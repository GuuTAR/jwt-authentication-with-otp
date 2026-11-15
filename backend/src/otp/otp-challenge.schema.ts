import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose'
import { randomUUID } from 'node:crypto'

import { PHONE_NUMBER_PATTERN, UserEntity } from '../users/user.schema.js'

/** Expired challenges are removed this long after `expires_at`. */
export const OTP_CHALLENGE_RETENTION_SECONDS = 24 * 60 * 60

export enum OtpPurpose {
  /** Second factor of login. */
  SIGN_IN = 'sign_in',
  SIGN_UP = 'sign_up',
  /** Confirms that a signed-in user owns their phone number. */
  VERIFY_PHONE = 'verify_phone',
}

/**
 * pending -> verified -> consumed
 * pending -> expired | locked (too many failed attempts) | failed (not delivered)
 */
export enum OtpStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  CONSUMED = 'consumed',
  EXPIRED = 'expired',
  LOCKED = 'locked',
  /** The SMS provider failed, so no code was delivered. */
  FAILED = 'failed',
}

@Schema({
  collection: 'otp_challenges',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class OtpChallengeEntity {
  /**
   * Challenge ID (UUID v4). Random rather than an ObjectId, which is partly
   * predictable, because `POST /otp/resend` accepts it without a login.
   */
  @Prop({ type: String, default: () => randomUUID() })
  _id: string

  /** Unset when the phone number has no user yet (sign-up). */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: UserEntity.name,
    index: true,
  })
  user_id?: Types.ObjectId

  /** Copied from the request so challenges work before a user exists. */
  @Prop({ required: true, trim: true, match: PHONE_NUMBER_PATTERN })
  phone_number: string

  @Prop({ type: String, enum: OtpPurpose, required: true })
  purpose: OtpPurpose

  @Prop({
    type: String,
    enum: OtpStatus,
    required: true,
    default: OtpStatus.PENDING,
  })
  status: OtpStatus

  @Prop({ required: true, default: 0, min: 0 })
  failed_attempts: number

  @Prop({ required: true })
  expires_at: Date

  @Prop()
  verified_at?: Date

  @Prop()
  consumed_at?: Date

  /** Reference of the latest code sent, e.g. K7QP. Changes on resend. */
  @Prop({ required: true })
  ref: string

  created_at: Date
}

export type OtpChallengeDocument = HydratedDocument<OtpChallengeEntity>
export const OtpChallengeSchema =
  SchemaFactory.createForClass(OtpChallengeEntity)

// Latest open challenge for a phone number and purpose.
OtpChallengeSchema.index({
  phone_number: 1,
  purpose: 1,
  status: 1,
  created_at: -1,
})
OtpChallengeSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: OTP_CHALLENGE_RETENTION_SECONDS },
)
