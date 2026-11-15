import { ApiProperty } from '@nestjs/swagger'

import { IsString, IsUUID, Matches } from 'class-validator'

import { OTP_LENGTH } from '../../otp/otp.constants.js'
import { CODE_PATTERN } from '../../otp/otp.dto.js'

export class AuthVerify2faRequest {
  @ApiProperty({
    description: 'From POST /api/v1/auth/login',
    example: '3f2b8c1e-7d4a-4f6b-9a2e-1c5d8e9f0a1b',
  })
  @IsUUID(4)
  auth_id: string

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(CODE_PATTERN, { message: `code must be ${OTP_LENGTH} digits` })
  code: string
}
