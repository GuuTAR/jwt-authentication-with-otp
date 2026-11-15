import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'

import type { Redis } from 'ioredis'
import { isValidObjectId, Model } from 'mongoose'
import { randomInt } from 'node:crypto'

import type { ClientInfo } from '../common/client-info.decorator.js'
import { hmacSha256, safeEqualHex } from '../common/hash.js'

import {
  SECURITY_CONFIG,
  type SecurityConfig,
} from '../config/security.config.js'

import { AuditEventType, AuditResult } from '../audit-logs/audit-log.schema.js'
import { AuditLogsService } from '../audit-logs/audit-logs.service.js'

import { REDIS } from '../redis/redis.module.js'

import {
  OtpChallengeEntity,
  OtpPurpose,
  OtpStatus,
} from './otp-challenge.schema.js'
import {
  INVALID_CODE,
  OTP_LENGTH,
  OTP_REF_ALPHABET,
  OTP_REF_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  otpKeys,
  RESEND_TOO_SOON,
} from './otp.constants.js'
import { OTP_SENDER, type OtpSender } from './otp-sender.js'

/** What Redis holds for a live challenge. The code itself is never stored. */
interface StoredChallenge {
  hmac: string
  ref: string
  user_id: string
  purpose: OtpPurpose
}

export interface IssuedChallenge {
  challengeId: string
  /** Reference of the code that was just sent. */
  ref: string
  /** Seconds until the challenge expires. */
  expiresIn: number
  /** Seconds until another code can be sent. */
  resendAfter: number
}

export interface IssueChallengeInput {
  userId: string
  phoneNumber: string
  purpose: OtpPurpose
  client: ClientInfo
}

export interface VerifyChallengeInput {
  challengeId: string
  code: string
  /** The challenge must belong to this user. */
  userId: string
  purpose: OtpPurpose
  client: ClientInfo
}

/**
 * One-time passwords bound to a user and purpose.
 *
 * - Codes are random, stored only as HMAC(challengeId:code), and expire.
 * - A challenge allows `OTP_MAX_ATTEMPTS` wrong codes, then it is locked.
 * - Resending sends a new code but keeps the expiry and attempt counter.
 * - A correct code consumes the challenge, so it works only once.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig,
    @InjectModel(OtpChallengeEntity.name)
    private readonly challengeModel: Model<OtpChallengeEntity>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async issue({
    userId,
    phoneNumber,
    purpose,
    client,
  }: IssueChallengeInput): Promise<IssuedChallenge> {
    await this.startCooldown(phoneNumber, { userId, client, purpose })

    const code = generateCode()
    const ref = generateRef()
    const challenge = await this.challengeModel.create({
      user_id: userId,
      phone_number: phoneNumber,
      purpose,
      ref,
      expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    })
    const challengeId = String(challenge._id)

    const stored: StoredChallenge = {
      hmac: this.codeHmac(challengeId, code),
      ref,
      user_id: userId,
      purpose,
    }
    await this.redis
      .multi()
      .set(
        otpKeys.challenge(challengeId),
        JSON.stringify(stored),
        'EX',
        OTP_TTL_SECONDS,
      )
      .set(otpKeys.attempts(challengeId), 0, 'EX', OTP_TTL_SECONDS)
      .exec()

    await this.sender.send({ phoneNumber, code, ref, purpose })
    await this.auditLogs.record({
      event: AuditEventType.OTP_REQUEST,
      result: AuditResult.SUCCESS,
      userId,
      challengeId,
      client,
      metadata: { purpose, ref },
    })

    return {
      challengeId,
      ref,
      expiresIn: OTP_TTL_SECONDS,
      resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
    }
  }

  /** Throws `401 Invalid or expired code` for every kind of failure. */
  async verify({
    challengeId,
    code,
    userId,
    purpose,
    client,
  }: VerifyChallengeInput): Promise<void> {
    const fail = async (reason: string, attempt?: number) => {
      await this.auditLogs.record({
        event: AuditEventType.OTP_VERIFY,
        result: AuditResult.FAILURE,
        userId,
        challengeId: isValidObjectId(challengeId) ? challengeId : undefined,
        client,
        metadata: { purpose, reason, ...(attempt && { attempt }) },
      })
      return new UnauthorizedException(INVALID_CODE)
    }

    const stored = await this.load(challengeId)
    if (!stored) throw await fail('expired_or_unknown')
    if (stored.user_id !== userId || stored.purpose !== purpose) {
      throw await fail('challenge_mismatch')
    }

    // Count the attempt before comparing, so parallel guesses cannot all slip
    // under the limit.
    const attempt = await this.redis.incr(otpKeys.attempts(challengeId))
    if (attempt > OTP_MAX_ATTEMPTS) {
      await this.lock(challengeId, attempt - 1)
      throw await fail('locked', attempt)
    }

    if (!safeEqualHex(this.codeHmac(challengeId, code), stored.hmac)) {
      if (attempt >= OTP_MAX_ATTEMPTS) {
        await this.lock(challengeId, attempt)
      } else {
        await this.challengeModel.updateOne(
          { _id: challengeId },
          { failed_attempts: attempt },
        )
      }
      throw await fail('wrong_code', attempt)
    }

    // Single use: only the request that deletes the key wins.
    const deleted = await this.redis.del(otpKeys.challenge(challengeId))
    if (deleted !== 1) throw await fail('already_used')
    await this.redis.del(otpKeys.attempts(challengeId))

    const now = new Date()
    await this.challengeModel.updateOne(
      { _id: challengeId },
      {
        status: OtpStatus.CONSUMED,
        failed_attempts: attempt - 1,
        verified_at: now,
        consumed_at: now,
      },
    )
    await this.auditLogs.record({
      event: AuditEventType.OTP_VERIFY,
      result: AuditResult.SUCCESS,
      userId,
      challengeId,
      client,
      metadata: { purpose, ref: stored.ref, attempt },
    })
  }

  /** Sends a new code for a live challenge without extending it. */
  async resend(
    challengeId: string,
    client: ClientInfo,
  ): Promise<{ issued: IssuedChallenge; phoneNumber: string }> {
    const invalid = new BadRequestException('Invalid or expired challenge')

    const stored = await this.load(challengeId)
    if (!stored) throw invalid
    const [ttlMs, attempts, challenge] = await Promise.all([
      this.redis.pttl(otpKeys.challenge(challengeId)),
      this.redis.get(otpKeys.attempts(challengeId)),
      this.challengeModel.findById(challengeId).lean(),
    ])
    if (ttlMs <= 0 || !challenge || Number(attempts) >= OTP_MAX_ATTEMPTS) {
      throw invalid
    }

    const { user_id: userId, purpose } = stored
    await this.startCooldown(challenge.phone_number, {
      userId,
      client,
      purpose,
    })

    const code = generateCode()
    // A new code gets a new ref, so the user can tell which SMS is current.
    const ref = generateRef()
    // XX: never resurrect a challenge that was consumed or locked meanwhile.
    const updated = await this.redis.set(
      otpKeys.challenge(challengeId),
      JSON.stringify({
        ...stored,
        hmac: this.codeHmac(challengeId, code),
        ref,
      } satisfies StoredChallenge),
      'PX',
      ttlMs,
      'XX',
    )
    if (updated !== 'OK') throw invalid

    await this.challengeModel.updateOne({ _id: challengeId }, { ref })
    await this.sender.send({
      phoneNumber: challenge.phone_number,
      code,
      ref,
      purpose,
    })
    await this.auditLogs.record({
      event: AuditEventType.OTP_RESEND,
      result: AuditResult.SUCCESS,
      userId,
      challengeId,
      client,
      metadata: { purpose, ref },
    })

    return {
      issued: {
        challengeId,
        ref,
        expiresIn: Math.ceil(ttlMs / 1000),
        resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
      },
      phoneNumber: challenge.phone_number,
    }
  }

  private async startCooldown(
    phoneNumber: string,
    audit: { userId: string; client: ClientInfo; purpose: OtpPurpose },
  ) {
    const phoneHash = hmacSha256(this.config.otpSecret, `phone:${phoneNumber}`)
    const started = await this.redis.set(
      otpKeys.cooldown(phoneHash),
      1,
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    )
    if (started === 'OK') return

    await this.auditLogs.record({
      event: AuditEventType.OTP_REQUEST,
      result: AuditResult.FAILURE,
      userId: audit.userId,
      client: audit.client,
      metadata: { purpose: audit.purpose, reason: 'cooldown' },
    })
    throw new HttpException(RESEND_TOO_SOON, HttpStatus.TOO_MANY_REQUESTS)
  }

  private async lock(challengeId: string, failedAttempts: number) {
    await this.redis.del(otpKeys.challenge(challengeId))
    await this.challengeModel.updateOne(
      { _id: challengeId },
      { status: OtpStatus.LOCKED, failed_attempts: failedAttempts },
    )
  }

  private async load(challengeId: string): Promise<StoredChallenge | null> {
    if (!isValidObjectId(challengeId)) return null
    const raw = await this.redis.get(otpKeys.challenge(challengeId))
    return raw ? (JSON.parse(raw) as StoredChallenge) : null
  }

  private codeHmac(challengeId: string, code: string): string {
    return hmacSha256(this.config.otpSecret, `${challengeId}:${code}`)
  }
}

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

/** Unbiased pick from `OTP_REF_ALPHABET`, e.g. K7QP. */
function generateRef(): string {
  return Array.from(
    { length: OTP_REF_LENGTH },
    () => OTP_REF_ALPHABET[randomInt(OTP_REF_ALPHABET.length)],
  ).join('')
}
