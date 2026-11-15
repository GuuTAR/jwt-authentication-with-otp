import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { UserStatus } from '../users/user.schema.js'

export class AuthUser {
  @ApiProperty({ example: '665f1c2e8b3e4a0012345678' })
  id: string

  @ApiProperty({ example: 'john.doe' })
  username: string

  @ApiPropertyOptional({ example: '+66812345678' })
  phone_number?: string

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus

  @ApiProperty()
  created_at: Date

  @ApiProperty()
  updated_at: Date
}

export class AuthLoginResponse {
  @ApiProperty({ description: 'JWT, use as: Authorization: Bearer <token>' })
  access_token: string

  @ApiProperty({ example: 'Bearer' })
  token_type: 'Bearer'

  @ApiProperty({
    description: 'Seconds until the token expires',
    example: 3600,
  })
  expires_in: number

  @ApiProperty({ type: AuthUser })
  user: AuthUser
}
