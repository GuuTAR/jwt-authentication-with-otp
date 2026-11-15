import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'

import type { Request } from 'express'
import { isValidObjectId, Model } from 'mongoose'

import { clientInfoOf } from '../common/client-info.decorator.js'

import { AuditEventType } from '../audit-logs/audit-log.schema.js'
import { AuditLogsService } from '../audit-logs/audit-logs.service.js'

import { AuthSessionEntity } from './auth-session.schema.js'

/** Claims in an access token. */
export interface AccessTokenPayload {
  /** User ID. */
  sub: string
  /** Session ID in `auth_sessions`. */
  sid: string
}

/** The authenticated caller, set on the request by `JwtAuthGuard`. */
export interface AuthPrincipal {
  userId: string
  sessionId: string
}

export type AuthenticatedRequest = Request & { user: AuthPrincipal }

/**
 * Accepts `Authorization: Bearer <jwt>` when the signature and expiry are valid
 * and its session still exists and has not been revoked (logout).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(AuthSessionEntity.name)
    private readonly sessionModel: Model<AuthSessionEntity>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    const audit = (
      event: AuditEventType,
      metadata: Record<string, unknown>,
      userId?: string,
    ) =>
      this.auditLogs.record({
        event,
        userId,
        client: clientInfoOf(req),
        metadata: { method: req.method, path: req.originalUrl, ...metadata },
      })

    const [scheme, token] = req.headers.authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      await audit(AuditEventType.UNAUTHORIZED_ACCESS, {
        reason: 'missing_bearer_token',
      })
      throw new UnauthorizedException('Missing bearer token')
    }

    let payload: AccessTokenPayload
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token)
    } catch (err) {
      await audit(AuditEventType.INVALID_TOKEN, {
        token: 'access',
        reason:
          err instanceof Error && err.name === 'TokenExpiredError'
            ? 'expired'
            : 'invalid_signature_or_format',
      })
      throw new UnauthorizedException('Invalid or expired token')
    }
    if (!isValidObjectId(payload.sid) || !isValidObjectId(payload.sub)) {
      await audit(AuditEventType.INVALID_TOKEN, {
        token: 'access',
        reason: 'invalid_claims',
      })
      throw new UnauthorizedException('Invalid or expired token')
    }

    const active = await this.sessionModel.exists({
      _id: payload.sid,
      user_id: payload.sub,
      revoked_at: { $exists: false },
      expires_at: { $gt: new Date() },
    })
    if (!active) {
      await audit(
        AuditEventType.INVALID_TOKEN,
        { token: 'access', reason: 'session_ended', session_id: payload.sid },
        payload.sub,
      )
      throw new UnauthorizedException('Session has ended')
    }

    req.user = { userId: payload.sub, sessionId: payload.sid }
    return true
  }
}
