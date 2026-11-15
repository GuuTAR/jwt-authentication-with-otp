import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditLogsModule } from '../audit-logs/audit-logs.module.js'

import { JwtAuthModule } from '../auth/jwt-auth.module.js'

import { UserEntity, UserSchema } from '../users/user.schema.js'

import {
  OtpChallengeEntity,
  OtpChallengeSchema,
} from './otp-challenge.schema.js'
import { OtpController } from './otp.controller.js'
import { OtpService } from './otp.service.js'
import { MockSmsProvider, OTP_SENDER } from './otp-sender.js'

@Module({
  imports: [
    AuditLogsModule,
    JwtAuthModule,
    MongooseModule.forFeature([
      { name: OtpChallengeEntity.name, schema: OtpChallengeSchema },
      { name: UserEntity.name, schema: UserSchema },
    ]),
  ],
  controllers: [OtpController],
  providers: [OtpService, { provide: OTP_SENDER, useClass: MockSmsProvider }],
  exports: [OtpService],
})
export class OtpModule {}
