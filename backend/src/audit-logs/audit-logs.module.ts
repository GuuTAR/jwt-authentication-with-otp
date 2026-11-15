import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditLogEntity, AuditLogSchema } from './audit-log.schema.js'
import { AuditLogsService } from './audit-logs.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLogEntity.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
