import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'

import { Model } from 'mongoose'

import type { ClientInfo } from '../common/client-info.decorator.js'

import {
  AuditEventType,
  AuditLogEntity,
  AuditResult,
} from './audit-log.schema.js'

export interface AuditEvent {
  event: AuditEventType
  result: AuditResult
  userId?: string
  challengeId?: string
  client?: ClientInfo
  /** Never include OTP codes, passwords or tokens. */
  metadata?: Record<string, unknown>
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name)

  constructor(
    @InjectModel(AuditLogEntity.name)
    private readonly auditLogModel: Model<AuditLogEntity>,
  ) {}

  /** Records an event. Failures are logged but never break the request. */
  async record({
    event,
    result,
    userId,
    challengeId,
    client,
    metadata = {},
  }: AuditEvent): Promise<void> {
    try {
      await this.auditLogModel.create({
        event_type: event,
        result,
        user_id: userId,
        challenge_id: challengeId,
        ip_address: client?.ip,
        user_agent: client?.userAgent,
        metadata,
      })
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${event}`, err)
    }
  }
}
