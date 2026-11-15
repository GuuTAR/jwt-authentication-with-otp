import { Logger } from '@nestjs/common'

import { OtpPurpose } from './otp-challenge.schema.js'
import { formatOtpSms, maskPhoneNumber, MockSmsProvider } from './otp-sender.js'

describe('maskPhoneNumber', () => {
  it('keeps the country code and the last 4 digits', () => {
    expect(maskPhoneNumber('+66812345678')).toBe('+66*****5678')
  })
})

describe('formatOtpSms', () => {
  it.each([
    [OtpPurpose.SIGN_IN, 'Your login code is'],
    [OtpPurpose.SIGN_UP, 'Your sign-up code is'],
    [OtpPurpose.VERIFY_PHONE, 'Your phone verification code is'],
  ])('writes the code, ref and expiry for %s', (purpose, intro) => {
    expect(
      formatOtpSms({
        phoneNumber: '+66812345678',
        code: '042917',
        ref: 'K7QP',
        purpose,
      }),
    ).toBe(
      `${intro} 042917 (Ref: K7QP). Valid for 5 minutes. Do not share this code.`,
    )
  })
})

describe('MockSmsProvider', () => {
  it('prints the SMS to the console with a masked phone number', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    await new MockSmsProvider().send({
      phoneNumber: '+66812345678',
      code: '042917',
      ref: 'K7QP',
      purpose: OtpPurpose.SIGN_IN,
    })

    expect(log).toHaveBeenCalledWith(
      'SMS to +66*****5678: Your login code is 042917 (Ref: K7QP). Valid for 5 minutes. Do not share this code.',
    )
    vi.restoreAllMocks()
  })
})
