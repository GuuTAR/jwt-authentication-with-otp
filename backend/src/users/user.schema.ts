import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument } from 'mongoose'

/** E.164 format, e.g. +66812345678. */
export const PHONE_NUMBER_PATTERN = /^\+[1-9]\d{7,14}$/

export enum UserStatus {
  /** Created on first OTP request, phone number not verified yet. */
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
    match: PHONE_NUMBER_PATTERN,
  })
  phone_number: string

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
