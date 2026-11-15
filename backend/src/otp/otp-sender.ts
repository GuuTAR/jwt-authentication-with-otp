import { Injectable, Logger } from '@nestjs/common'

import type { OtpPurpose } from './otp-challenge.schema.js'

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

/**
 * Development sender: writes the code to the server log instead of sending an
 * SMS. Replace with a real provider (e.g. Twilio) before production use.
 */
@Injectable()
export class LogOtpSender implements OtpSender {
  private readonly logger = new Logger('OtpSender')

  constructor() {
    this.logger.warn(
      'OTP codes are written to the log. Configure an SMS provider for production.',
    )
  }

  async send({ phoneNumber, code, ref, purpose }: OtpMessage) {
    this.logger.log(
      `[${purpose}] OTP for ${maskPhoneNumber(phoneNumber)}: ${code} (Ref: ${ref})`,
    )
  }
}
