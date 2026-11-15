import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import {
  AuditEventType,
  AuditResult,
  resultOf,
} from '../src/audit-logs/audit-log.schema.js'
import {
  bearer,
  createTestApp,
  nextPhoneNumber,
  PASSWORD,
  signIn,
  type TestContext,
} from './helpers.js'

describe('Audit log (e2e)', () => {
  let ctx: TestContext
  let server: ReturnType<TestContext['app']['getHttpServer']>
  const username = 'audit.user'
  const userAgent = 'audit-test/1.0'

  const events = async (filter: object = {}) =>
    ctx.conn.collection('audit_logs').find(filter).sort({ _id: 1 }).toArray()
  const eventTypes = async () => (await events()).map((e) => e.event_type)
  const clearAudit = () => ctx.conn.collection('audit_logs').deleteMany({})
  const clearCooldowns = async () => {
    const keys = await ctx.redis.keys('otp:cooldown:*')
    if (keys.length) await ctx.redis.del(...keys)
  }
  const register = () =>
    request(server)
      .post('/api/v1/auth/register')
      .set('User-Agent', userAgent)
      .send({ username, password: PASSWORD, phone_number: nextPhoneNumber() })
  const login = (password = PASSWORD) =>
    request(server)
      .post('/api/v1/auth/login')
      .set('User-Agent', userAgent)
      .send({ username, password })

  beforeEach(async () => {
    ctx = await createTestApp()
    server = ctx.app.getHttpServer()
  })

  afterEach(async () => {
    await ctx.app.close()
  })

  it('derives the result from the event type', () => {
    expect(resultOf(AuditEventType.LOGIN_SUCCESS)).toBe(AuditResult.SUCCESS)
    expect(resultOf(AuditEventType.OTP_SENT)).toBe(AuditResult.SUCCESS)
    for (const event of [
      AuditEventType.LOGIN_FAILED,
      AuditEventType.OTP_VERIFICATION_FAILED,
      AuditEventType.OTP_EXPIRED,
      AuditEventType.OTP_LOCKED,
      AuditEventType.OTP_SEND_FAILED,
      AuditEventType.RATE_LIMIT_EXCEEDED,
      AuditEventType.INVALID_TOKEN,
      AuditEventType.UNAUTHORIZED_ACCESS,
    ]) {
      expect(resultOf(event)).toBe(AuditResult.FAILURE)
    }
  })

  it('records USER_REGISTERED with the user, IP and user agent', async () => {
    const { id } = (await register().expect(201)).body.body
    const [event] = await events()
    expect(event).toMatchObject({
      event_type: 'USER_REGISTERED',
      result: 'success',
      ip_address: expect.stringMatching(/127\.0\.0\.1|::1/),
      user_agent: userAgent,
      created_at: expect.any(Date),
    })
    expect(String(event.user_id)).toBe(id)
  })

  it('records a full 2FA login in order, ending with LOGIN_SUCCESS', async () => {
    await register().expect(201)
    await clearAudit()

    const { auth_id, challenge_id } = (await login().expect(200)).body.body
    await request(server)
      .post('/api/v1/auth/verify-2fa')
      .send({ auth_id, code: ctx.otp.last.code })
      .expect(200)

    const all = await events()
    expect(all.map((e) => e.event_type)).toEqual([
      'OTP_REQUESTED',
      'OTP_SENT',
      'OTP_VERIFICATION_SUCCESS',
      'LOGIN_SUCCESS',
    ])
    expect(all.slice(1).every((e) => e.challenge_id === challenge_id)).toBe(
      true,
    )
    expect(all.at(-1)?.metadata).toMatchObject({
      method: 'password+otp',
      session_id: expect.stringMatching(/^[0-9a-f]{24}$/),
    })
  })

  it('records LOGIN_FAILED for a wrong password and RATE_LIMIT_EXCEEDED when blocked', async () => {
    await register().expect(201)
    await clearAudit()

    for (let i = 0; i < 10; i++) await login('wrong-password').expect(401)
    await login().expect(429)

    const all = await events()
    expect(all.filter((e) => e.event_type === 'LOGIN_FAILED')).toHaveLength(10)
    expect(all.at(-1)).toMatchObject({
      event_type: 'RATE_LIMIT_EXCEEDED',
      result: 'failure',
      metadata: { limit: 'login_per_ip' },
    })
  })

  it('records OTP rate limits with the limit that was hit', async () => {
    await register().expect(201)
    await login().expect(200)
    await clearAudit()

    await login().expect(429)
    expect(
      (await events()).map((e) => [e.event_type, e.metadata.limit]),
    ).toEqual([
      ['OTP_REQUESTED', undefined],
      ['RATE_LIMIT_EXCEEDED', 'otp_cooldown'],
    ])
  })

  it('records OTP_EXPIRED and marks the challenge expired', async () => {
    await register().expect(201)
    const { auth_id, challenge_id } = (await login().expect(200)).body.body
    await clearAudit()

    await ctx.redis.del(`otp:${challenge_id}`)
    await request(server)
      .post('/api/v1/auth/verify-2fa')
      .send({ auth_id, code: ctx.otp.last.code })
      .expect(401)

    expect(await eventTypes()).toEqual(['OTP_EXPIRED'])
    expect(
      await ctx.conn
        .collection<{ _id: string }>('otp_challenges')
        .findOne({ _id: challenge_id }),
    ).toMatchObject({ status: 'expired' })
  })

  it('records OTP_SEND_FAILED, answers 503 and lets the user retry at once', async () => {
    await register().expect(201)
    await clearAudit()

    ctx.otp.failNext = true
    await login()
      .expect(503)
      .expect({ code: 503, message: 'Unable to send OTP. Try again later.' })

    expect(await eventTypes()).toEqual(['OTP_REQUESTED', 'OTP_SEND_FAILED'])
    const failed = (await events())[1]
    expect(failed.metadata).toMatchObject({
      error: 'Error',
      purpose: 'sign_in',
    })
    expect(
      await ctx.conn
        .collection<{ _id: string }>('otp_challenges')
        .findOne({ _id: failed.challenge_id }),
    ).toMatchObject({ status: 'failed' })
    expect(await ctx.redis.exists(`otp:${failed.challenge_id}`)).toBe(0)

    // The cooldown was released, so a retry works without waiting.
    await login().expect(200)
  })

  it('records OTP_RESENT', async () => {
    await register().expect(201)
    const { challenge_id } = (await login().expect(200)).body.body
    await clearCooldowns()
    await clearAudit()

    await request(server)
      .post('/api/v1/otp/resend')
      .send({ challenge_id })
      .expect(200)
    expect(await eventTypes()).toEqual(['OTP_RESENT'])
  })

  it('records TOKEN_REFRESHED, LOGOUT_SUCCESS and INVALID_TOKEN for a revoked session', async () => {
    const tokens = await signIn(ctx, username)
    await clearAudit()

    const refreshed = (
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: tokens.refresh_token })
        .expect(200)
    ).body.body
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: tokens.refresh_token })
      .expect(401)
    await request(server)
      .post('/api/v1/auth/logout')
      .set(bearer(refreshed.access_token))
      .expect(200)
    await request(server)
      .get('/api/v1/auth/me')
      .set(bearer(refreshed.access_token))
      .expect(401)

    expect(
      (await events()).map((e) => [e.event_type, e.metadata.reason]),
    ).toEqual([
      ['TOKEN_REFRESHED', undefined],
      ['INVALID_TOKEN', 'unknown_revoked_or_expired'],
      ['LOGOUT_SUCCESS', undefined],
      ['INVALID_TOKEN', 'session_ended'],
    ])
  })

  it('records UNAUTHORIZED_ACCESS and INVALID_TOKEN on protected APIs', async () => {
    await request(server).get('/api/v1/todos').expect(401)
    await request(server)
      .get('/api/v1/todos')
      .set(bearer('not-a-jwt'))
      .expect(401)
    await request(server)
      .get('/api/v1/auth/me')
      .set(
        bearer(
          ctx.app
            .get(JwtService)
            .sign({ sub: 'a', sid: 'b' }, { expiresIn: -1 }),
        ),
      )
      .expect(401)

    expect(
      (await events()).map((e) => [
        e.event_type,
        e.metadata.reason,
        e.metadata.method,
        e.metadata.path,
      ]),
    ).toEqual([
      ['UNAUTHORIZED_ACCESS', 'missing_bearer_token', 'GET', '/api/v1/todos'],
      ['INVALID_TOKEN', 'invalid_signature_or_format', 'GET', '/api/v1/todos'],
      ['INVALID_TOKEN', 'expired', 'GET', '/api/v1/auth/me'],
    ])
  })

  it('never stores passwords, OTP codes or tokens', async () => {
    const tokens = await signIn(ctx, username)
    const codes = ctx.otp.sent.map((m) => m.code)
    await login('wrong-password').expect(401)

    const dump = JSON.stringify(await events())
    for (const secret of [
      PASSWORD,
      'wrong-password',
      ...codes,
      tokens.access_token,
      tokens.refresh_token,
    ]) {
      expect(dump).not.toContain(secret)
    }
  })
})
