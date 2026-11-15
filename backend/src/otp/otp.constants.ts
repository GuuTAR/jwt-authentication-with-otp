export const OTP_LENGTH = 6
/**
 * Reference shown next to the code in the SMS and in the app, so the user can
 * match them. Not a secret. Ambiguous characters (0/O, 1/I/L) are left out.
 */
export const OTP_REF_LENGTH = 4
export const OTP_REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** Lifetime of a challenge. Resending a code does not extend it. */
export const OTP_TTL_SECONDS = 5 * 60
/** Wrong codes allowed per challenge before it is locked. */
export const OTP_MAX_ATTEMPTS = 5
/** Minimum gap between codes sent to one phone number. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60

/** Redis keys. Identifiers that could be personal data are hashed. */
export const otpKeys = {
  challenge: (challengeId: string) => `otp:${challengeId}`,
  attempts: (challengeId: string) => `otp:attempt:${challengeId}`,
  cooldown: (phoneHash: string) => `otp:cooldown:${phoneHash}`,
}

export const INVALID_CODE = 'Invalid or expired code'
export const RESEND_TOO_SOON = 'Please wait before requesting another code'
