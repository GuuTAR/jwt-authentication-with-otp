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
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    const [scheme, token] = req.headers.authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token')
    }

    let payload: AccessTokenPayload
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
    if (!isValidObjectId(payload.sid) || !isValidObjectId(payload.sub)) {
      throw new UnauthorizedException('Invalid or expired token')
    }

    const active = await this.sessionModel.exists({
      _id: payload.sid,
      user_id: payload.sub,
      revoked_at: { $exists: false },
      expires_at: { $gt: new Date() },
    })
    if (!active) throw new UnauthorizedException('Session has ended')

    req.user = { userId: payload.sub, sessionId: payload.sid }
    return true
  }
}
