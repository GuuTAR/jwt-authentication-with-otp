import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** Keyed hash, used so Redis keys and OTP records never contain raw values. */
export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

/** Unkeyed hash for high-entropy values such as refresh tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}
