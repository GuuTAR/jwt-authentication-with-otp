/** Injection token for `SecurityConfig`. */
export const SECURITY_CONFIG = Symbol('SECURITY_CONFIG')

export interface SecurityConfig {
  jwtSecret: string
  /** Access token lifetime, in seconds. */
  jwtExpiresIn: number
  /** Refresh token and session lifetime, in seconds. */
  refreshTokenExpiresIn: number
  /** HMAC key for OTP codes and for hashing identifiers in Redis keys. */
  otpSecret: string
}

const MIN_SECRET_LENGTH = 32

function secret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be set and at least ${MIN_SECRET_LENGTH} characters long`,
    )
  }
  return value
}

function seconds(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = env[name] ? Number(env[name]) : fallback
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive number of seconds`)
  }
  return value
}

/** Reads security settings from the environment. Throws at startup when invalid. */
export function loadSecurityConfig(env = process.env): SecurityConfig {
  const config: SecurityConfig = {
    jwtSecret: secret(env, 'JWT_SECRET'),
    jwtExpiresIn: seconds(env, 'JWT_EXPIRES_IN', 15 * 60),
    refreshTokenExpiresIn: seconds(
      env,
      'REFRESH_TOKEN_EXPIRES_IN',
      7 * 24 * 60 * 60,
    ),
    otpSecret: secret(env, 'OTP_SECRET'),
  }
  if (config.otpSecret === config.jwtSecret) {
    throw new Error('OTP_SECRET must be different from JWT_SECRET')
  }
  return config
}
