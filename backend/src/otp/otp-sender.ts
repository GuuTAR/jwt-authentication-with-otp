import { Injectable, Logger } from '@nestjs/common'

import { OtpPurpose } from './otp-challenge.schema.js'
import { OTP_TTL_SECONDS } from './otp.constants.js'

/** Injection token for the `OtpSender` that delivers codes. */
export const OTP_SENDER = Symbol('OTP_SENDER')

export interface OtpMessage {
  phoneNumber: string
  code: string
  /** Shown with the code, e.g. "123456 (Ref: K7QP)". */
  ref: string
  purpose: OtpPurpose
}

export interface OtpSender {
  send(message: OtpMessage): Promise<void>
}

/** +66812345678 -> +66*****5678 */
export function maskPhoneNumber(phoneNumber: string): string {
  const visibleEnd = phoneNumber.slice(-4)
  const visibleStart = phoneNumber.slice(0, 3)
  const hidden = Math.max(phoneNumber.length - 7, 0)
  return `${visibleStart}${'*'.repeat(hidden)}${visibleEnd}`
}

const SMS_TEMPLATES: Record<OtpPurpose, string> = {
  [OtpPurpose.SIGN_IN]: 'Your login code is',
  [OtpPurpose.SIGN_UP]: 'Your sign-up code is',
  [OtpPurpose.VERIFY_PHONE]: 'Your phone verification code is',
}

/** The SMS text, e.g. "Your login code is 123456 (Ref: K7QP). Valid for 5 minutes." */
export function formatOtpSms({ code, ref, purpose }: OtpMessage): string {
  const minutes = Math.round(OTP_TTL_SECONDS / 60)
  return `${SMS_TEMPLATES[purpose]} ${code} (Ref: ${ref}). Valid for ${minutes} minutes. Do not share this code.`
}

/**
 * Mock SMS provider: prints each SMS to the console instead of sending it.
 * Replace with a real provider (e.g. Twilio) by binding another `OtpSender`
 * to `OTP_SENDER` in `OtpModule`.
 */
@Injectable()
export class MockSmsProvider implements OtpSender {
  private readonly logger = new Logger(MockSmsProvider.name)

  constructor() {
    this.logger.warn(
      'Mock SMS provider: OTP messages are printed to the console, not sent.',
    )
  }

  async send(message: OtpMessage) {
    this.logger.log(
      `SMS to ${maskPhoneNumber(message.phoneNumber)}: ${formatOtpSms(message)}`,
    )
  }
}
