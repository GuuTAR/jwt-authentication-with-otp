import { ApiProperty } from '@nestjs/swagger'

import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class AuthRefreshRequest {
  @ApiProperty({ description: 'From POST /api/v1/auth/verify-2fa or /refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refresh_token: string
}
