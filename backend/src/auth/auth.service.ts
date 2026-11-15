import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'

import { Model, mongo, Types } from 'mongoose'

import { UserEntity, UserStatus } from '../users/user.schema.js'

import { AUTH_CONFIG } from './auth.constants.js'
import type { AuthConfig } from './auth.config.js'
import { AuthLoginResponse, AuthUser } from './auth.model.js'
import { AuthSessionEntity } from './auth-session.schema.js'
import { AuthRegisterRequest } from './dto/register.dto.js'
import type { AccessTokenPayload, AuthPrincipal } from './jwt-auth.guard.js'
import { PasswordService } from './password.service.js'

type UserRecord = UserEntity & { _id: Types.ObjectId }

const INVALID_CREDENTIALS = 'Invalid username or password'

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(AuthSessionEntity.name)
    private readonly sessionModel: Model<AuthSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
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
        // No OTP step yet, so registered users can sign in right away.
        status: UserStatus.ACTIVE,
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

  async login(username: string, password: string): Promise<AuthLoginResponse> {
    const user = await this.userModel
      .findOne({ username })
      .select('+password_hash')
      .lean<UserRecord>()

    const valid = user
      ? await this.passwordService.verify(password, user.password_hash)
      : await this.passwordService.verifyDummy(password)
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS)
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended')
    }

    const expiresIn = this.config.jwtExpiresIn
    const session = await this.sessionModel.create({
      user_id: user._id,
      expires_at: new Date(Date.now() + expiresIn * 1000),
    })
    const payload: AccessTokenPayload = {
      sub: String(user._id),
      sid: String(session._id),
    }

    return {
      access_token: await this.jwtService.signAsync(payload, { expiresIn }),
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: toAuthUser(user),
    }
  }

  /** Revokes the caller's session, so its access token stops working. */
  async logout({ sessionId }: AuthPrincipal): Promise<void> {
    await this.sessionModel.updateOne(
      { _id: sessionId, revoked_at: { $exists: false } },
      { revoked_at: new Date() },
    )
  }

  async me({ userId }: AuthPrincipal): Promise<AuthUser> {
    const user = await this.userModel.findById(userId).lean<UserRecord>()
    if (!user) throw new NotFoundException('User not found')
    return toAuthUser(user)
  }
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
