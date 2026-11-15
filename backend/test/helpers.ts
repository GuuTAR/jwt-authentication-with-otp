import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { getConnectionToken } from '@nestjs/mongoose'
import RedisMock from 'ioredis-mock'
import type { Connection } from 'mongoose'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../src/app.module.js'
import {
  OTP_SENDER,
  type OtpMessage,
  type OtpSender,
} from '../src/otp/otp-sender.js'
import { REDIS } from '../src/redis/redis.module.js'

export type SentOtp = OtpMessage

/** Records codes instead of sending SMS. */
export class FakeOtpSender implements OtpSender {
  readonly sent: SentOtp[] = []

  async send(message: OtpMessage) {
    this.sent.push(message)
  }

  get last(): SentOtp {
    const last = this.sent.at(-1)
    if (!last) throw new Error('No OTP was sent')
    return last
  }
}

export interface TestContext {
  app: INestApplication<App>
  conn: Connection
  redis: InstanceType<typeof RedisMock>
  otp: FakeOtpSender
}

/** Boots the app with in-memory Redis and a fake OTP sender, on empty collections. */
export async function createTestApp(): Promise<TestContext> {
  const redis = new RedisMock()
  const otp = new FakeOtpSender()
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(redis)
    .overrideProvider(OTP_SENDER)
    .useValue(otp)
    .compile()

  const app = moduleFixture.createNestApplication<INestApplication<App>>()
  await app.init()
  const conn = app.get<Connection>(getConnectionToken())
  await redis.flushall()
  await Promise.all(
    Object.values(conn.collections).map((c) => c.deleteMany({})),
  )
  return { app, conn, redis, otp }
}

let phoneSeq = 0
/** A unique valid E.164 number. */
export const nextPhoneNumber = () =>
  `+668${String(10_000_000 + ++phoneSeq).slice(-8)}`

export const PASSWORD = 'correct-horse'

/** Registers a user, then logs in through both factors. */
export async function signIn(
  { app, otp }: TestContext,
  username: string,
  phoneNumber = nextPhoneNumber(),
) {
  const server = app.getHttpServer()
  await request(server)
    .post('/api/v1/auth/register')
    .send({ username, password: PASSWORD, phone_number: phoneNumber })
    .expect(201)
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200)
  const res = await request(server)
    .post('/api/v1/auth/verify-2fa')
    .send({ auth_id: login.body.body.auth_id, code: otp.last.code })
    .expect(200)
  return res.body.body as {
    access_token: string
    refresh_token: string
    user: { id: string; username: string; status: string }
  }
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
