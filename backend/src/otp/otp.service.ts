import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'

import { isUUID } from 'class-validator'
import type { Redis } from 'ioredis'
import { Model } from 'mongoose'
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
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_IP,
  OTP_MAX_SENDS_PER_PHONE,
  OTP_RATE_WINDOW_SECONDS,
  OTP_REF_ALPHABET,
  OTP_REF_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  otpKeys,
  RESEND_TOO_SOON,
  TOO_MANY_OTP_REQUESTS,
} from './otp.constants.js'
import { OTP_SENDER, type OtpSender } from './otp-sender.js'

type ChallengeRecord = OtpChallengeEntity & { _id: string }

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
 * - Codes come from a CSPRNG. Redis holds only HMAC-SHA256(challengeId:code)
 *   under `otp:{challengeId}` with a 300s TTL; the code itself is never stored.
 * - Challenge metadata (user, purpose, status, ref, expiry) lives in MongoDB.
 * - A challenge allows `OTP_MAX_ATTEMPTS` wrong codes, then it is locked.
 * - Resending sends a new code but keeps the expiry and attempt counter.
 * - Sends are limited per phone number (cooldown and hourly) and per IP.
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
    await this.limitSends(phoneNumber, { userId, client, purpose })

    const code = generateCode()
    const ref = generateRef()
    const challenge = await this.challengeModel.create({
      user_id: userId,
      phone_number: phoneNumber,
      purpose,
      ref,
      expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    })
    const challengeId = challenge._id

    await this.redis
      .multi()
      .set(
        otpKeys.challenge(challengeId),
        this.codeHmac(challengeId, code),
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
    const challenge = await this.findLive(challengeId)
    const fail = async (reason: string, attempt?: number) => {
      await this.auditLogs.record({
        event: AuditEventType.OTP_VERIFY,
        result: AuditResult.FAILURE,
        userId,
        challengeId: challenge?._id,
        client,
        metadata: {
          purpose,
          reason,
          ...(challenge && { ref: challenge.ref }),
          ...(attempt && { attempt }),
        },
      })
      return new UnauthorizedException(INVALID_CODE)
    }

    if (!challenge) throw await fail('expired_or_unknown')
    if (String(challenge.user_id) !== userId || challenge.purpose !== purpose) {
      throw await fail('challenge_mismatch')
    }
    const hmac = await this.redis.get(otpKeys.challenge(challengeId))
    if (!hmac) throw await fail('expired_or_unknown')

    // Count the attempt before comparing, so parallel guesses cannot all slip
    // under the limit.
    const attempt = await this.redis.incr(otpKeys.attempts(challengeId))
    if (attempt > OTP_MAX_ATTEMPTS) {
      await this.lock(challengeId, attempt - 1)
      throw await fail('locked', attempt)
    }

    if (!safeEqualHex(this.codeHmac(challengeId, code), hmac)) {
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
      { _id: challengeId, status: OtpStatus.PENDING },
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
      metadata: { purpose, ref: challenge.ref, attempt },
    })
  }

  /** Sends a new code for a live challenge without extending it. */
  async resend(
    challengeId: string,
    client: ClientInfo,
  ): Promise<{ issued: IssuedChallenge; phoneNumber: string }> {
    const invalid = new BadRequestException('Invalid or expired challenge')

    const challenge = await this.findLive(challengeId)
    if (!challenge) throw invalid
    const [ttlMs, attempts] = await Promise.all([
      this.redis.pttl(otpKeys.challenge(challengeId)),
      this.redis.get(otpKeys.attempts(challengeId)),
    ])
    if (ttlMs <= 0 || Number(attempts) >= OTP_MAX_ATTEMPTS) throw invalid

    const userId = String(challenge.user_id)
    const { phone_number: phoneNumber, purpose } = challenge
    await this.limitSends(phoneNumber, { userId, client, purpose })

    const code = generateCode()
    // A new code gets a new ref, so the user can tell which SMS is current.
    const ref = generateRef()
    // XX: never resurrect a challenge that was consumed or locked meanwhile.
    const updated = await this.redis.set(
      otpKeys.challenge(challengeId),
      this.codeHmac(challengeId, code),
      'PX',
      ttlMs,
      'XX',
    )
    if (updated !== 'OK') throw invalid

    await this.challengeModel.updateOne({ _id: challengeId }, { ref })
    await this.sender.send({ phoneNumber, code, ref, purpose })
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
      phoneNumber,
    }
  }

  /**
   * Allows a send only when the phone number and IP are under their hourly
   * limits and the phone number's 60s cooldown has passed. Every allowed send
   * counts toward both limits.
   */
  private async limitSends(
    phoneNumber: string,
    audit: { userId: string; client: ClientInfo; purpose: OtpPurpose },
  ) {
    const phoneHash = this.hash(`phone:${phoneNumber}`)
    const phoneKey = otpKeys.rateByPhone(phoneHash)
    const ipKey = otpKeys.rateByIp(this.hash(`ip:${audit.client.ip}`))

    const reject = async (reason: string, message: string) => {
      await this.auditLogs.record({
        event: AuditEventType.OTP_REQUEST,
        result: AuditResult.FAILURE,
        userId: audit.userId,
        client: audit.client,
        metadata: { purpose: audit.purpose, reason },
      })
      return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    }

    const [byPhone, byIp] = await this.redis.mget(phoneKey, ipKey)
    if (
      Number(byPhone) >= OTP_MAX_SENDS_PER_PHONE ||
      Number(byIp) >= OTP_MAX_SENDS_PER_IP
    ) {
      throw await reject('rate_limited', TOO_MANY_OTP_REQUESTS)
    }

    const started = await this.redis.set(
      otpKeys.cooldown(phoneHash),
      1,
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    )
    if (started !== 'OK') throw await reject('cooldown', RESEND_TOO_SOON)

    await this.redis
      .multi()
      .incr(phoneKey)
      .expire(phoneKey, OTP_RATE_WINDOW_SECONDS, 'NX')
      .incr(ipKey)
      .expire(ipKey, OTP_RATE_WINDOW_SECONDS, 'NX')
      .exec()
  }

  /** A pending, unexpired challenge, or null. */
  private async findLive(challengeId: string): Promise<ChallengeRecord | null> {
    if (!isUUID(challengeId, 4)) return null
    return this.challengeModel
      .findOne({
        _id: challengeId,
        status: OtpStatus.PENDING,
        expires_at: { $gt: new Date() },
      })
      .lean<ChallengeRecord>()
  }

  private async lock(challengeId: string, failedAttempts: number) {
    await this.redis.del(otpKeys.challenge(challengeId))
    await this.challengeModel.updateOne(
      { _id: challengeId },
      { status: OtpStatus.LOCKED, failed_attempts: failedAttempts },
    )
  }

  private codeHmac(challengeId: string, code: string): string {
    return this.hash(`${challengeId}:${code}`)
  }

  private hash(value: string): string {
    return hmacSha256(this.config.otpSecret, value)
  }
}

/** Uniform CSPRNG code, zero-padded, e.g. 042917. */
function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

/** Uniform pick from `OTP_REF_ALPHABET`, e.g. K7QP. */
function generateRef(): string {
  return Array.from(
    { length: OTP_REF_LENGTH },
    () => OTP_REF_ALPHABET[randomInt(OTP_REF_ALPHABET.length)],
  ).join('')
}
