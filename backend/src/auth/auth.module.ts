import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditLogsModule } from '../audit-logs/audit-logs.module.js'

import { OtpModule } from '../otp/otp.module.js'

import { UserEntity, UserSchema } from '../users/user.schema.js'

import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtAuthModule } from './jwt-auth.module.js'
import { PasswordService } from './password.service.js'

@Module({
  imports: [
    AuditLogsModule,
    JwtAuthModule,
    OtpModule,
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
})
export class AuthModule {}
