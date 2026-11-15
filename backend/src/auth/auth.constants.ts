/** Time allowed between a correct password and the OTP. */
export const PENDING_AUTH_TTL_SECONDS = 5 * 60
/** Failed password attempts allowed per IP within the window. */
export const LOGIN_MAX_FAILURES_PER_IP = 10
export const LOGIN_RATE_WINDOW_SECONDS = 15 * 60

export const authKeys = {
  pending: (authId: string) => `auth:pending:${authId}`,
  loginRateByIp: (ipHash: string) => `rate:login:ip:${ipHash}`,
}

export const INVALID_CREDENTIALS = 'Invalid username or password'
export const TOO_MANY_LOGIN_ATTEMPTS =
  'Too many login attempts. Try again later.'
