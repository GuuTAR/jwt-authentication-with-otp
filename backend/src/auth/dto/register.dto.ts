import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { Transform } from 'class-transformer'
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

import {
  PHONE_NUMBER_PATTERN,
  USERNAME_PATTERN,
} from '../../users/user.schema.js'

export class AuthRegisterRequest {
  @ApiProperty({
    example: 'john.doe',
    description: '3–32 characters: letters, digits, dot, underscore',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3–32 characters of letters, digits, dot or underscore',
  })
  username: string

  @ApiProperty({ example: 'correct-horse-battery', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string

  @ApiPropertyOptional({ example: '+66812345678', description: 'E.164 format' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_NUMBER_PATTERN, {
    message: 'phone_number must be in E.164 format, e.g. +66812345678',
  })
  phone_number?: string
}
