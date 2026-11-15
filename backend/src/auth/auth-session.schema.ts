import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { HydratedDocument, Types } from 'mongoose'

import { UserEntity } from '../users/user.schema.js'

@Schema({
  collection: 'auth_sessions',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class AuthSessionEntity {
  @Prop({
    type: Types.ObjectId,
    ref: UserEntity.name,
    required: true,
    index: true,
  })
  user_id: Types.ObjectId

  /** SHA-256 of the refresh token. The raw token is never stored. */
  @Prop({ required: true, unique: true })
  refresh_token_hash: string

  @Prop({ required: true })
  expires_at: Date

  @Prop()
  revoked_at?: Date

  created_at: Date
}

export type AuthSessionDocument = HydratedDocument<AuthSessionEntity>
export const AuthSessionSchema = SchemaFactory.createForClass(AuthSessionEntity)

// Expired sessions are useless, so MongoDB removes them automatically.
AuthSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 })
