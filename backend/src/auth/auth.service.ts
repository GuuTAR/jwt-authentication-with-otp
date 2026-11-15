import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'

import type { Redis } from 'ioredis'
import { Model, mongo, Types } from 'mongoose'
import { randomBytes, randomUUID } from 'node:crypto'

import type { ClientInfo } from '../common/client-info.decorator.js'
import { hmacSha256, sha256 } from '../common/hash.js'

import {
  SECURITY_CONFIG,
  type SecurityConfig,
} from '../config/security.config.js'

import { AuditEventType, AuditResult } from '../audit-logs/audit-log.schema.js'
import { AuditLogsService } from '../audit-logs/audit-logs.service.js'

import { OtpPurpose } from '../otp/otp-challenge.schema.js'
import { INVALID_CODE } from '../otp/otp.constants.js'
import { toChallengeResponse } from '../otp/otp.dto.js'
import { OtpService } from '../otp/otp.service.js'

import { REDIS } from '../redis/redis.module.js'

import { UserEntity, UserStatus } from '../users/user.schema.js'

import {
  authKeys,
  INVALID_CREDENTIALS,
  LOGIN_MAX_FAILURES_PER_IP,
  LOGIN_RATE_WINDOW_SECONDS,
  PENDING_AUTH_TTL_SECONDS,
  TOO_MANY_LOGIN_ATTEMPTS,
} from './auth.constants.js'
import {
  AuthLoginResponse,
  AuthTokensResponse,
  AuthUser,
} from './auth.model.js'
import { AuthSessionEntity } from './auth-session.schema.js'
import { AuthRegisterRequest } from './dto/register.dto.js'
import type { AccessTokenPayload, AuthPrincipal } from './jwt-auth.guard.js'
import { PasswordService } from './password.service.js'

type UserRecord = UserEntity & { _id: Types.ObjectId }

/** Redis state between a correct password and a correct OTP. */
interface PendingAuth {
  user_id: string
  challenge_id: string
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(AuthSessionEntity.name)
    private readonly sessionModel: Model<AuthSessionEntity>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async register({
    username,
    password,
    phone_number,
  }: AuthRegisterRequest): Promise<AuthUser> {
    if (await this.userModel.exists({ username })) {
      throw new ConflictException('Username is already taken')
    }

    try {
      const user = await this.userModel.create({
        username,
        password_hash: await this.passwordService.hash(password),
        phone_number,
        // Becomes active once an OTP to this phone number is verified.
        status: UserStatus.PENDING,
      })
      return toAuthUser(user.toObject())
    } catch (err) {
      // Lost a race with a concurrent registration, or the phone is in use.
      if (err instanceof mongo.MongoServerError && err.code === 11000) {
        const field = Object.keys(err.keyPattern ?? {})[0]
        throw new ConflictException(
          field === 'phone_number'
            ? 'Phone number is already registered'
            : 'Username is already taken',
        )
      }
      throw err
    }
  }

  /**
   * Factor 1. A correct password sends an OTP and returns a pending `auth_id`;
   * no token is issued until `verify2fa`. A wrong password never sends an OTP.
   */
  async login(
    username: string,
    password: string,
    client: ClientInfo,
  ): Promise<AuthLoginResponse> {
    const rateKey = authKeys.loginRateByIp(
      hmacSha256(this.config.otpSecret, `ip:${client.ip}`),
    )
    if (Number(await this.redis.get(rateKey)) >= LOGIN_MAX_FAILURES_PER_IP) {
      await this.auditLogs.record({
        event: AuditEventType.LOGIN_PASSWORD,
        result: AuditResult.FAILURE,
        client,
        metadata: { reason: 'rate_limited' },
      })
      throw new HttpException(
        TOO_MANY_LOGIN_ATTEMPTS,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const user = await this.userModel
      .findOne({ username })
      .select('+password_hash')
      .lean<UserRecord>()
    const valid = user
      ? await this.passwordService.verify(password, user.password_hash)
      : await this.passwordService.verifyDummy(password)

    if (!user || !valid || user.status === UserStatus.SUSPENDED) {
      await this.redis
        .multi()
        .incr(rateKey)
        .expire(rateKey, LOGIN_RATE_WINDOW_SECONDS, 'NX')
        .exec()
      await this.auditLogs.record({
        event: AuditEventType.LOGIN_PASSWORD,
        result: AuditResult.FAILURE,
        userId: user ? String(user._id) : undefined,
        client,
        metadata: {
          reason: !user
            ? 'unknown_user'
            : !valid
              ? 'wrong_password'
              : 'suspended',
        },
      })
      // Same message for every case, so callers cannot tell which one failed.
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    const userId = String(user._id)
    await this.auditLogs.record({
      event: AuditEventType.LOGIN_PASSWORD,
      result: AuditResult.SUCCESS,
      userId,
      client,
    })
    if (!user.phone_number) {
      throw new ForbiddenException(
        'Two-factor authentication is not set up for this account',
      )
    }

    const issued = await this.otpService.issue({
      userId,
      phoneNumber: user.phone_number,
      purpose: OtpPurpose.SIGN_IN,
      client,
    })
    const authId = randomUUID()
    const pending: PendingAuth = {
      user_id: userId,
      challenge_id: issued.challengeId,
    }
    await this.redis.set(
      authKeys.pending(authId),
      JSON.stringify(pending),
      'EX',
      PENDING_AUTH_TTL_SECONDS,
    )

    return {
      auth_id: authId,
      ...toChallengeResponse(issued, user.phone_number),
    }
  }

  /** Factor 2. A correct OTP for the pending login issues the tokens. */
  async verify2fa(
    authId: string,
    code: string,
    client: ClientInfo,
  ): Promise<AuthTokensResponse> {
    const raw = await this.redis.get(authKeys.pending(authId))
    if (!raw) {
      await this.auditLogs.record({
        event: AuditEventType.OTP_VERIFY,
        result: AuditResult.FAILURE,
        client,
        metadata: { purpose: OtpPurpose.SIGN_IN, reason: 'unknown_auth_id' },
      })
      throw new UnauthorizedException(INVALID_CODE)
    }
    const pending = JSON.parse(raw) as PendingAuth

    // Throws the same generic 401 for wrong, expired, locked or reused codes.
    await this.otpService.verify({
      challengeId: pending.challenge_id,
      code,
      userId: pending.user_id,
      purpose: OtpPurpose.SIGN_IN,
      client,
    })

    // The pending login works once, even if two requests race.
    if (!(await this.redis.getdel(authKeys.pending(authId)))) {
      throw new UnauthorizedException(INVALID_CODE)
    }

    const user = await this.userModel
      .findOneAndUpdate(
        { _id: pending.user_id, status: { $ne: UserStatus.SUSPENDED } },
        // The OTP proved the phone number, so a pending account becomes active.
        [
          {
            $set: {
              status: {
                $cond: [
                  { $eq: ['$status', UserStatus.PENDING] },
                  UserStatus.ACTIVE,
                  '$status',
                ],
              },
            },
          },
        ],
        { returnDocument: 'after', updatePipeline: true },
      )
      .lean<UserRecord>()
    if (!user) throw new UnauthorizedException(INVALID_CODE)

    const refreshToken = generateRefreshToken()
    const session = await this.sessionModel.create({
      user_id: user._id,
      refresh_token_hash: sha256(refreshToken),
      expires_at: new Date(
        Date.now() + this.config.refreshTokenExpiresIn * 1000,
      ),
    })
    await this.auditLogs.record({
      event: AuditEventType.SESSION_CREATE,
      result: AuditResult.SUCCESS,
      userId: String(user._id),
      challengeId: pending.challenge_id,
      client,
    })

    return this.tokens(user, String(session._id), refreshToken)
  }

  /** Rotates the refresh token: the old one stops working immediately. */
  async refresh(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<AuthTokensResponse> {
    const next = generateRefreshToken()
    const session = await this.sessionModel
      .findOneAndUpdate(
        {
          refresh_token_hash: sha256(refreshToken),
          revoked_at: { $exists: false },
          expires_at: { $gt: new Date() },
        },
        { refresh_token_hash: sha256(next) },
        { returnDocument: 'after' },
      )
      .lean()
    const user =
      session &&
      (await this.userModel
        .findOne({
          _id: session.user_id,
          status: { $ne: UserStatus.SUSPENDED },
        })
        .lean<UserRecord>())

    if (!session || !user) {
      await this.auditLogs.record({
        event: AuditEventType.SESSION_REFRESH,
        result: AuditResult.FAILURE,
        userId: session ? String(session.user_id) : undefined,
        client,
        metadata: { reason: session ? 'user_unavailable' : 'invalid_token' },
      })
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    await this.auditLogs.record({
      event: AuditEventType.SESSION_REFRESH,
      result: AuditResult.SUCCESS,
      userId: String(user._id),
      client,
    })
    return this.tokens(user, String(session._id), next, session.expires_at)
  }

  /** Revokes the caller's session, so its access and refresh tokens stop working. */
  async logout(
    { userId, sessionId }: AuthPrincipal,
    client: ClientInfo,
  ): Promise<void> {
    await this.sessionModel.updateOne(
      { _id: sessionId, revoked_at: { $exists: false } },
      { revoked_at: new Date() },
    )
    await this.auditLogs.record({
      event: AuditEventType.SESSION_REVOKE,
      result: AuditResult.SUCCESS,
      userId,
      client,
    })
  }

  async me({ userId }: AuthPrincipal): Promise<AuthUser> {
    const user = await this.userModel.findById(userId).lean<UserRecord>()
    if (!user) throw new NotFoundException('User not found')
    return toAuthUser(user)
  }

  private async tokens(
    user: UserRecord,
    sessionId: string,
    refreshToken: string,
    sessionExpiresAt = new Date(
      Date.now() + this.config.refreshTokenExpiresIn * 1000,
    ),
  ): Promise<AuthTokensResponse> {
    const payload: AccessTokenPayload = {
      sub: String(user._id),
      sid: sessionId,
    }
    return {
      access_token: await this.jwtService.signAsync(payload),
      token_type: 'Bearer',
      expires_in: this.config.jwtExpiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: Math.max(
        Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000),
        0,
      ),
      user: toAuthUser(user),
    }
  }
}

function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

function toAuthUser({
  _id,
  username,
  phone_number,
  status,
  created_at,
  updated_at,
}: UserRecord): AuthUser {
  return {
    id: String(_id),
    username,
    phone_number,
    status,
    created_at,
    updated_at,
  }
}
