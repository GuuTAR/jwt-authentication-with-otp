import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
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

import { AuditEventType } from '../audit-logs/audit-log.schema.js'
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
import { OTP_SENDER, type OtpMessage, type OtpSender } from './otp-sender.js'

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
  private readonly logger = new Logger(OtpService.name)

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
    await this.auditLogs.record({
      event: AuditEventType.OTP_REQUESTED,
      userId,
      client,
      metadata: { purpose },
    })
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

    await this.deliver(
      { phoneNumber, code, ref, purpose },
      { userId, challengeId, client, event: AuditEventType.OTP_SENT },
      // Nothing was delivered, so drop the challenge and let the user retry.
      async () => {
        await this.redis.del(
          otpKeys.challenge(challengeId),
          otpKeys.attempts(challengeId),
        )
        await this.challengeModel.updateOne(
          { _id: challengeId },
          { status: OtpStatus.FAILED },
        )
      },
    )

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
    const challenge = isUUID(challengeId, 4)
      ? await this.challengeModel.findById(challengeId).lean<ChallengeRecord>()
      : null
    const audit = (
      event: AuditEventType,
      metadata: Record<string, unknown> = {},
    ) =>
      this.auditLogs.record({
        event,
        userId,
        challengeId: challenge?._id,
        client,
        metadata: {
          purpose,
          ...(challenge && { ref: challenge.ref }),
          ...metadata,
        },
      })
    const fail = async (reason: string, attempt?: number) => {
      await audit(AuditEventType.OTP_VERIFICATION_FAILED, {
        reason,
        ...(attempt && { attempt }),
      })
      return new UnauthorizedException(INVALID_CODE)
    }

    if (!challenge) throw await fail('unknown_challenge')
    if (String(challenge.user_id) !== userId || challenge.purpose !== purpose) {
      throw await fail('challenge_mismatch')
    }
    if (challenge.status !== OtpStatus.PENDING) {
      throw await fail(`challenge_${challenge.status}`)
    }
    const hmac = await this.redis.get(otpKeys.challenge(challengeId))
    if (!hmac || challenge.expires_at <= new Date()) {
      await this.challengeModel.updateOne(
        { _id: challengeId, status: OtpStatus.PENDING },
        { status: OtpStatus.EXPIRED },
      )
      await audit(AuditEventType.OTP_EXPIRED)
      throw new UnauthorizedException(INVALID_CODE)
    }

    // Count the attempt before comparing, so parallel guesses cannot all slip
    // under the limit.
    const attempt = await this.redis.incr(otpKeys.attempts(challengeId))
    if (attempt > OTP_MAX_ATTEMPTS) {
      await this.lock(challengeId, attempt - 1)
      throw await fail('challenge_locked', attempt)
    }

    if (!safeEqualHex(this.codeHmac(challengeId, code), hmac)) {
      const error = await fail('wrong_code', attempt)
      if (attempt >= OTP_MAX_ATTEMPTS) {
        await this.lock(challengeId, attempt)
        await audit(AuditEventType.OTP_LOCKED, { failed_attempts: attempt })
      } else {
        await this.challengeModel.updateOne(
          { _id: challengeId },
          { failed_attempts: attempt },
        )
      }
      throw error
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
    await audit(AuditEventType.OTP_VERIFICATION_SUCCESS, { attempt })
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
    // On failure the previous code is already replaced; the user can resend
    // again once the cooldown is released.
    await this.deliver(
      { phoneNumber, code, ref, purpose },
      { userId, challengeId, client, event: AuditEventType.OTP_RESENT },
      async () => {},
    )

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

    const reject = async (limit: string, message: string) => {
      await this.auditLogs.record({
        event: AuditEventType.RATE_LIMIT_EXCEEDED,
        userId: audit.userId,
        client: audit.client,
        metadata: { limit, purpose: audit.purpose },
      })
      return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    }

    const [byPhone, byIp] = await this.redis.mget(phoneKey, ipKey)
    if (Number(byPhone) >= OTP_MAX_SENDS_PER_PHONE) {
      throw await reject('otp_per_phone', TOO_MANY_OTP_REQUESTS)
    }
    if (Number(byIp) >= OTP_MAX_SENDS_PER_IP) {
      throw await reject('otp_per_ip', TOO_MANY_OTP_REQUESTS)
    }

    const started = await this.redis.set(
      otpKeys.cooldown(phoneHash),
      1,
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    )
    if (started !== 'OK') throw await reject('otp_cooldown', RESEND_TOO_SOON)

    await this.redis
      .multi()
      .incr(phoneKey)
      .expire(phoneKey, OTP_RATE_WINDOW_SECONDS, 'NX')
      .incr(ipKey)
      .expire(ipKey, OTP_RATE_WINDOW_SECONDS, 'NX')
      .exec()
  }

  /**
   * Sends the SMS and records `event` (OTP_SENT or OTP_RESENT). If the provider
   * fails, records OTP_SEND_FAILED, runs `rollback`, releases the cooldown and
   * answers 503.
   */
  private async deliver(
    message: OtpMessage,
    audit: {
      userId: string
      challengeId: string
      client: ClientInfo
      event: AuditEventType
    },
    rollback: () => Promise<void>,
  ) {
    const { userId, challengeId, client, event } = audit
    const metadata = { purpose: message.purpose, ref: message.ref }
    try {
      await this.sender.send(message)
    } catch (err) {
      this.logger.error('OTP delivery failed', err)
      await rollback()
      await this.redis.del(
        otpKeys.cooldown(this.hash(`phone:${message.phoneNumber}`)),
      )
      await this.auditLogs.record({
        event: AuditEventType.OTP_SEND_FAILED,
        userId,
        challengeId,
        client,
        metadata: {
          ...metadata,
          error: err instanceof Error ? err.name : 'unknown',
        },
      })
      throw new ServiceUnavailableException(
        'Unable to send OTP. Try again later.',
      )
    }
    await this.auditLogs.record({
      event,
      userId,
      challengeId,
      client,
      metadata,
    })
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
