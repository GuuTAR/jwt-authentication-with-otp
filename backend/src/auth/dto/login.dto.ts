import { ApiProperty } from '@nestjs/swagger'

import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class AuthLoginRequest {
  @ApiProperty({ example: 'john.doe' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  username: string

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string
}
