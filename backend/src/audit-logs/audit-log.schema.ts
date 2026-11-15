import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose'

import { OtpChallengeEntity } from '../otp/otp-challenge.schema.js'

import { UserEntity } from '../users/user.schema.js'

export enum AuditEventType {
  OTP_REQUEST = 'otp_request',
  OTP_VERIFY = 'otp_verify',
  SESSION_CREATE = 'session_create',
  SESSION_REFRESH = 'session_refresh',
  SESSION_REVOKE = 'session_revoke',
}

export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class AuditLogEntity {
  /** Unset when the actor is unknown, e.g. an OTP request for a new number. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: UserEntity.name })
  user_id?: Types.ObjectId

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: OtpChallengeEntity.name,
    index: true,
  })
  challenge_id?: Types.ObjectId

  @Prop({ type: String, enum: AuditEventType, required: true })
  event_type: AuditEventType

  @Prop({ type: String, enum: AuditResult, required: true })
  result: AuditResult

  @Prop()
  ip_address?: string

  @Prop()
  user_agent?: string

  /** Free-form event details, e.g. failure reason. Never store OTP codes or tokens. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, unknown>

  created_at: Date
}

export type AuditLogDocument = HydratedDocument<AuditLogEntity>
export const AuditLogSchema = SchemaFactory.createForClass(AuditLogEntity)

AuditLogSchema.index({ user_id: 1, created_at: -1 })
AuditLogSchema.index({ event_type: 1, created_at: -1 })
