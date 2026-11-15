import { Injectable } from '@nestjs/common'

import {
  randomBytes,
  scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto'

const KEY_LENGTH = 64
const SALT_LENGTH = 16
// OWASP minimum for scrypt: N=2^17, r=8, p=1.
const PARAMS = { N: 2 ** 17, r: 8, p: 1 }
const MAX_MEMORY = 256 * 1024 * 1024

function derive(
  password: string,
  salt: Buffer,
  { N, r, p }: typeof PARAMS,
): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: MAX_MEMORY }
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )
}

/** Hashes passwords with scrypt as `scrypt$N$r$p$<salt b64>$<hash b64>`. */
@Injectable()
export class PasswordService {
  /** Hash used to keep login timing the same when the username does not exist. */
  private readonly dummyHash = this.hash(randomBytes(16).toString('hex'))

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH)
    const key = await derive(password, salt, PARAMS)
    const { N, r, p } = PARAMS
    return [
      'scrypt',
      N,
      r,
      p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$')
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, N, r, p, salt, hash] = stored.split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false

    const expected = Buffer.from(hash, 'base64')
    const actual = await derive(password, Buffer.from(salt, 'base64'), {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    )
  }

  /** Spends the same time as `verify` and always fails. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(password, await this.dummyHash)
    return false
  }
}
