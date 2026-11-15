const DEFAULT_JWT_EXPIRES_IN_SECONDS = 60 * 60

export interface AuthConfig {
  jwtSecret: string
  /** Lifetime of an access token and its session, in seconds. */
  jwtExpiresIn: number
}

/** Reads auth settings from the environment. Throws at startup when invalid. */
export function loadAuthConfig(env = process.env): AuthConfig {
  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long')
  }

  const jwtExpiresIn = env.JWT_EXPIRES_IN
    ? Number(env.JWT_EXPIRES_IN)
    : DEFAULT_JWT_EXPIRES_IN_SECONDS
  if (!Number.isInteger(jwtExpiresIn) || jwtExpiresIn <= 0) {
    throw new Error('JWT_EXPIRES_IN must be a positive number of seconds')
  }

  return { jwtSecret, jwtExpiresIn }
}
