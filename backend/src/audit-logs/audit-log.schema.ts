import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose'

import { OtpChallengeEntity } from '../otp/otp-challenge.schema.js'

import { UserEntity } from '../users/user.schema.js'

/**
 * Security events, grouped as in the audit log design. Values are stored in
 * `audit_logs.event_type`.
 */
export enum AuditEventType {
  // Authentication
  USER_REGISTERED = 'USER_REGISTERED',
  /** Both factors passed and tokens were issued. */
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  /** Password step failed: unknown user, wrong password, suspended, etc. */
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT_SUCCESS = 'LOGOUT_SUCCESS',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  /** Reserved: a session revoked other than by logout (no feature yet). */
  TOKEN_REVOKED = 'TOKEN_REVOKED',

  // OTP
  OTP_REQUESTED = 'OTP_REQUESTED',
  OTP_SENT = 'OTP_SENT',
  OTP_SEND_FAILED = 'OTP_SEND_FAILED',
  OTP_VERIFICATION_SUCCESS = 'OTP_VERIFICATION_SUCCESS',
  OTP_VERIFICATION_FAILED = 'OTP_VERIFICATION_FAILED',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_RESENT = 'OTP_RESENT',
  OTP_LOCKED = 'OTP_LOCKED',

  // Security
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Reserved: no account lockout feature yet. */
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  /** A bearer token was malformed, forged, expired or its session ended. */
  INVALID_TOKEN = 'INVALID_TOKEN',
  /** A protected API was called without a bearer token. */
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',

  // User security (reserved: these features do not exist yet)
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',
}

export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

const FAILURE_EVENTS = new Set<AuditEventType>([
  AuditEventType.LOGIN_FAILED,
  AuditEventType.OTP_SEND_FAILED,
  AuditEventType.OTP_VERIFICATION_FAILED,
  AuditEventType.OTP_EXPIRED,
  AuditEventType.OTP_LOCKED,
  AuditEventType.RATE_LIMIT_EXCEEDED,
  AuditEventType.ACCOUNT_LOCKED,
  AuditEventType.INVALID_TOKEN,
  AuditEventType.UNAUTHORIZED_ACCESS,
])

/** Every event has one outcome, so `result` is derived rather than passed. */
export function resultOf(event: AuditEventType): AuditResult {
  return FAILURE_EVENTS.has(event) ? AuditResult.FAILURE : AuditResult.SUCCESS
}

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class AuditLogEntity {
  /** Unset when the actor is unknown, e.g. an OTP request for a new number. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: UserEntity.name })
  user_id?: Types.ObjectId

  /** `otp_challenges._id` (UUID). */
  @Prop({ type: String, ref: OtpChallengeEntity.name, index: true })
  challenge_id?: string

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
