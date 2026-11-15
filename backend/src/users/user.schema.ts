import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument } from 'mongoose'

/** E.164 format, e.g. +66812345678. */
export const PHONE_NUMBER_PATTERN = /^\+[1-9]\d{7,14}$/

/** 3–32 characters: lowercase letters, digits, dot, underscore. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/

export enum UserStatus {
  /** Phone number not verified yet. */
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Schema({
  collection: 'users',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class UserEntity {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: USERNAME_PATTERN,
  })
  username: string

  /** scrypt hash, see `PasswordService`. Excluded from queries unless selected. */
  @Prop({ required: true, select: false })
  password_hash: string

  /** Optional until OTP verification is added. Unique when set. */
  @Prop({ trim: true, match: PHONE_NUMBER_PATTERN })
  phone_number?: string

  @Prop({
    type: String,
    enum: UserStatus,
    required: true,
    default: UserStatus.PENDING,
  })
  status: UserStatus

  created_at: Date
  updated_at: Date
}

export type UserDocument = HydratedDocument<UserEntity>
export const UserSchema = SchemaFactory.createForClass(UserEntity)

UserSchema.index(
  { phone_number: 1 },
  {
    unique: true,
    partialFilterExpression: { phone_number: { $type: 'string' } },
  },
)
