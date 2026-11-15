import { ApiProperty } from '@nestjs/swagger'

import { IsMongoId, IsString, Matches } from 'class-validator'

import { OTP_LENGTH } from './otp.constants.js'
import type { IssuedChallenge } from './otp.service.js'
import { maskPhoneNumber } from './otp-sender.js'

export const CODE_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`)

export class OtpVerifyRequest {
  @ApiProperty({ example: '665f1c2e8b3e4a0012345678' })
  @IsMongoId()
  challenge_id: string

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(CODE_PATTERN, { message: `code must be ${OTP_LENGTH} digits` })
  code: string
}

export class OtpResendRequest {
  @ApiProperty({ example: '665f1c2e8b3e4a0012345678' })
  @IsMongoId()
  challenge_id: string
}

export class OtpChallengeResponse {
  @ApiProperty({ example: '665f1c2e8b3e4a0012345678' })
  challenge_id: string

  @ApiProperty({ description: 'Seconds until the code expires', example: 300 })
  expires_in: number

  @ApiProperty({
    description: 'Seconds until another code can be sent',
    example: 60,
  })
  resend_after: number

  @ApiProperty({
    description:
      'Reference printed next to the code in the SMS. Show it to the user so they can match the message. Changes on resend.',
    example: 'K7QP',
  })
  ref: string

  @ApiProperty({ example: '+66*****5678' })
  phone_hint: string
}

export function toChallengeResponse(
  issued: IssuedChallenge,
  phoneNumber: string,
): OtpChallengeResponse {
  return {
    challenge_id: issued.challengeId,
    ref: issued.ref,
    expires_in: issued.expiresIn,
    resend_after: issued.resendAfter,
    phone_hint: maskPhoneNumber(phoneNumber),
  }
}
