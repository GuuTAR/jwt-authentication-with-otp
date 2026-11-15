export type AuthUserStatus = 'pending' | 'active' | 'suspended'

export type AuthUser = {
  id: string
  username: string
  phone_number?: string
  status: AuthUserStatus
  created_at: string
  updated_at: string
}

export type LoginInput = {
  username: string
  password: string
}

/** Response of POST /api/v1/auth/login: the password passed and an OTP was sent. */
export type PendingLogin = {
  auth_id: string
  challenge_id: string
  /** Reference printed next to the code in the SMS, e.g. K7QP. */
  ref: string
  /** Seconds until the code expires. */
  expires_in: number
  /** Seconds until another code can be sent. */
  resend_after: number
  /** Masked phone number, e.g. +66*****5678. */
  phone_hint: string
}

/** Response of POST /api/v1/auth/verify-2fa and /refresh. */
export type AuthTokens = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
  user: AuthUser
}
