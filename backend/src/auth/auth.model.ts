import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { OtpChallengeResponse } from '../otp/otp.dto.js'

import { UserStatus } from '../users/user.schema.js'

export class AuthUser {
  @ApiProperty({ example: '665f1c2e8b3e4a0012345678' })
  id: string

  @ApiProperty({ example: 'john.doe' })
  username: string

  @ApiPropertyOptional({ example: '+66812345678' })
  phone_number?: string

  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.ACTIVE,
    description: '`pending` until the phone number is verified by an OTP',
  })
  status: UserStatus

  @ApiProperty()
  created_at: Date

  @ApiProperty()
  updated_at: Date
}

/** First factor passed: an OTP was sent, but no token is issued yet. */
export class AuthLoginResponse extends OtpChallengeResponse {
  @ApiProperty({
    description: 'Pass to POST /api/v1/auth/verify-2fa with the code',
    example: '3f2b8c1e-7d4a-4f6b-9a2e-1c5d8e9f0a1b',
  })
  auth_id: string
}

export class AuthTokensResponse {
  @ApiProperty({ description: 'JWT, use as: Authorization: Bearer <token>' })
  access_token: string

  @ApiProperty({ example: 'Bearer' })
  token_type: 'Bearer'

  @ApiProperty({
    description: 'Seconds until the access token expires',
    example: 900,
  })
  expires_in: number

  @ApiProperty({
    description:
      'Opaque token for POST /api/v1/auth/refresh. Rotated on every refresh.',
  })
  refresh_token: string

  @ApiProperty({
    description: 'Seconds until the refresh token and session expire',
    example: 604800,
  })
  refresh_expires_in: number

  @ApiProperty({ type: AuthUser })
  user: AuthUser
}
