import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import {
  bearer,
  createTestApp,
  nextPhoneNumber,
  PASSWORD,
  signIn,
  type TestContext,
} from './helpers.js'

describe('Auth 2FA flow (e2e)', () => {
  let ctx: TestContext
  let server: ReturnType<TestContext['app']['getHttpServer']>

  const username = 'john.doe'
  let phoneNumber: string
  const register = (
    body: object = { username, password: PASSWORD, phone_number: phoneNumber },
  ) => request(server).post('/api/v1/auth/register').send(body)
  const login = (body: object = { username, password: PASSWORD }) =>
    request(server).post('/api/v1/auth/login').send(body)
  const verify2fa = (auth_id: string, code: string) =>
    request(server).post('/api/v1/auth/verify-2fa').send({ auth_id, code })
  const resend = (challenge_id: string) =>
    request(server).post('/api/v1/otp/resend').send({ challenge_id })
  const wrongCode = (code: string) =>
    String((Number(code) + 1) % 1_000_000).padStart(6, '0')
  const clearCooldowns = async () => {
    const keys = await ctx.redis.keys('otp:cooldown:*')
    if (keys.length) await ctx.redis.del(...keys)
  }
  const auditEvents = (filter: object = {}) =>
    ctx.conn.collection('audit_logs').find(filter).sort({ _id: 1 }).toArray()

  beforeEach(async () => {
    ctx = await createTestApp()
    server = ctx.app.getHttpServer()
    phoneNumber = nextPhoneNumber()
  })

  afterEach(async () => {
    await ctx.app.close()
  })

  describe('POST /api/v1/auth/register', () => {
    it('creates a pending user and never returns the password hash', async () => {
      const res = await register({
        username: ' John.Doe ',
        password: PASSWORD,
        phone_number: phoneNumber,
      }).expect(201)

      expect(res.body).toEqual({
        code: 201,
        message: 'User registered successfully',
        body: {
          id: expect.stringMatching(/^[0-9a-f]{24}$/),
          username: 'john.doe',
          phone_number: phoneNumber,
          status: 'pending',
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })
      const stored = await ctx.conn.collection('users').findOne({ username })
      expect(stored?.password_hash).toMatch(/^scrypt\$/)
    })

    it('requires a phone number for 2FA', async () => {
      await register({ username, password: PASSWORD }).expect(400)
    })

    it('rejects a taken username or phone number with 409', async () => {
      await register().expect(201)
      await register({
        username: 'JOHN.DOE',
        password: PASSWORD,
        phone_number: nextPhoneNumber(),
      })
        .expect(409)
        .expect({ code: 409, message: 'Username is already taken' })
      await register({
        username: 'jane',
        password: PASSWORD,
        phone_number: phoneNumber,
      })
        .expect(409)
        .expect({ code: 409, message: 'Phone number is already registered' })
    })
  })

  describe('POST /api/v1/auth/login (factor 1)', () => {
    beforeEach(async () => {
      await register().expect(201)
    })

    it('sends an OTP and returns a pending auth, but no token', async () => {
      const res = await login({
        username: 'John.Doe',
        password: PASSWORD,
      }).expect(200)

      expect(res.body).toEqual({
        code: 200,
        message: 'OTP sent',
        body: {
          auth_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          challenge_id: expect.stringMatching(/^[0-9a-f]{24}$/),
          expires_in: 300,
          resend_after: 60,
          phone_hint: `${phoneNumber.slice(0, 3)}*****${phoneNumber.slice(-4)}`,
        },
      })
      expect(JSON.stringify(res.body)).not.toMatch(/access_token|refresh_token/)
      expect(ctx.otp.sent).toEqual([
        {
          phoneNumber,
          code: expect.stringMatching(/^\d{6}$/),
          purpose: 'sign_in',
        },
      ])
    })

    it('stores the pending auth and OTP in Redis with a 300s TTL and no plaintext code', async () => {
      const { auth_id, challenge_id } = (await login().expect(200)).body.body

      expect(await ctx.redis.ttl(`auth:pending:${auth_id}`)).toBeGreaterThan(
        295,
      )
      expect(await ctx.redis.ttl(`otp:${challenge_id}`)).toBeGreaterThan(295)
      expect(
        await ctx.redis.ttl(`otp:attempt:${challenge_id}`),
      ).toBeGreaterThan(295)
      expect(await ctx.redis.get(`otp:${challenge_id}`)).not.toContain(
        ctx.otp.last.code,
      )
      expect((await ctx.redis.keys('otp:cooldown:*'))[0]).not.toContain(
        phoneNumber,
      )
    })

    it('never sends an OTP for a wrong password, and uses one generic error', async () => {
      const generic = { code: 401, message: 'Invalid username or password' }
      await login({ username, password: 'wrong-password' })
        .expect(401)
        .expect(generic)
      await login({ username: 'nobody', password: PASSWORD })
        .expect(401)
        .expect(generic)
      await ctx.conn
        .collection('users')
        .updateOne({ username }, { $set: { status: 'suspended' } })
      await login().expect(401).expect(generic)

      expect(ctx.otp.sent).toEqual([])
      expect(
        (await auditEvents({ event_type: 'login_password' })).map((e) => [
          e.result,
          e.metadata.reason,
        ]),
      ).toEqual([
        ['failure', 'wrong_password'],
        ['failure', 'unknown_user'],
        ['failure', 'suspended'],
      ])
    })

    it('blocks an IP after 10 failed passwords, even with the right password', async () => {
      for (let i = 0; i < 10; i++) {
        await login({ username, password: 'wrong-password' }).expect(401)
      }
      await login().expect(429).expect({
        code: 429,
        message: 'Too many login attempts. Try again later.',
      })
      expect(ctx.otp.sent).toEqual([])

      const [key] = await ctx.redis.keys('rate:login:ip:*')
      expect(await ctx.redis.ttl(key)).toBeGreaterThan(895)
      expect(key).not.toMatch(/127\.0\.0\.1|::/)
    })
  })

  describe('POST /api/v1/auth/verify-2fa (factor 2)', () => {
    let authId: string
    let challengeId: string

    beforeEach(async () => {
      await register().expect(201)
      ;({ auth_id: authId, challenge_id: challengeId } = (
        await login().expect(200)
      ).body.body)
    })

    it('issues tokens only after a correct OTP and activates the user', async () => {
      const res = await verify2fa(authId, ctx.otp.last.code).expect(200)

      expect(res.body).toMatchObject({
        code: 200,
        message: 'Logged in successfully',
        body: {
          token_type: 'Bearer',
          expires_in: 900,
          refresh_token: expect.any(String),
          refresh_expires_in: expect.any(Number),
          user: { username, status: 'active' },
        },
      })
      const payload = ctx.app.get(JwtService).verify(res.body.body.access_token)
      expect(payload).toMatchObject({
        sub: res.body.body.user.id,
        sid: expect.any(String),
      })
      expect(payload.exp - payload.iat).toBe(900)

      await request(server)
        .get('/api/v1/auth/me')
        .set(bearer(res.body.body.access_token))
        .expect(200)
    })

    it('accepts the pending auth and OTP only once', async () => {
      const { code } = ctx.otp.last
      await verify2fa(authId, code).expect(200)
      await verify2fa(authId, code)
        .expect(401)
        .expect({ code: 401, message: 'Invalid or expired code' })
      expect(
        await ctx.redis.exists(`auth:pending:${authId}`, `otp:${challengeId}`),
      ).toBe(0)
    })

    it('uses one generic error for wrong, unknown and expired codes', async () => {
      const generic = { code: 401, message: 'Invalid or expired code' }
      await verify2fa(authId, wrongCode(ctx.otp.last.code))
        .expect(401)
        .expect(generic)
      await verify2fa(crypto.randomUUID(), ctx.otp.last.code)
        .expect(401)
        .expect(generic)

      // Simulate expiry of the pending auth.
      await ctx.redis.del(`auth:pending:${authId}`)
      await verify2fa(authId, ctx.otp.last.code).expect(401).expect(generic)
    })

    it('rejects a code after the OTP itself expires', async () => {
      await ctx.redis.del(`otp:${challengeId}`)
      await verify2fa(authId, ctx.otp.last.code).expect(401)
    })

    it('binds the OTP to its own user and auth session', async () => {
      const mine = ctx.otp.last.code
      await register({
        username: 'jane',
        password: PASSWORD,
        phone_number: nextPhoneNumber(),
      }).expect(201)
      const theirs = (
        await login({ username: 'jane', password: PASSWORD }).expect(200)
      ).body.body

      await verify2fa(theirs.auth_id, mine).expect(401)
      await verify2fa(authId, ctx.otp.last.code).expect(401)
      await verify2fa(authId, mine).expect(200)
    })

    it('locks the challenge after 5 wrong codes', async () => {
      const { code } = ctx.otp.last
      for (let i = 0; i < 5; i++) {
        await verify2fa(authId, wrongCode(code)).expect(401)
      }
      await verify2fa(authId, code).expect(401)

      const challenge = await ctx.conn.collection('otp_challenges').findOne({})
      expect(challenge).toMatchObject({ status: 'locked', failed_attempts: 5 })
      const failures = await auditEvents({
        event_type: 'otp_verify',
        result: 'failure',
      })
      expect(failures).toHaveLength(6)
      expect(failures.every((e) => !JSON.stringify(e).includes(code))).toBe(
        true,
      )
    })

    it('does not reset the attempt counter when the code is resent', async () => {
      for (let i = 0; i < 4; i++) {
        await verify2fa(authId, wrongCode(ctx.otp.last.code)).expect(401)
      }
      await clearCooldowns()
      await resend(challengeId).expect(200)
      const resent = ctx.otp.last.code

      await verify2fa(authId, wrongCode(resent)).expect(401)
      await verify2fa(authId, resent).expect(401)
      expect(
        await ctx.conn.collection('otp_challenges').findOne({}),
      ).toMatchObject({ status: 'locked' })
    })
  })

  describe('POST /api/v1/otp/resend', () => {
    let authId: string
    let challengeId: string

    beforeEach(async () => {
      await register().expect(201)
      ;({ auth_id: authId, challenge_id: challengeId } = (
        await login().expect(200)
      ).body.body)
    })

    it('enforces a 60s cooldown per phone number', async () => {
      await resend(challengeId).expect(429).expect({
        code: 429,
        message: 'Please wait before requesting another code',
      })
      const [key] = await ctx.redis.keys('otp:cooldown:*')
      expect(await ctx.redis.ttl(key)).toBeGreaterThan(55)
    })

    it('replaces the code without extending the expiry', async () => {
      const first = ctx.otp.last.code
      await ctx.redis.expire(`otp:${challengeId}`, 120)
      await clearCooldowns()

      const res = await resend(challengeId).expect(200)
      expect(res.body.body).toMatchObject({
        challenge_id: challengeId,
        resend_after: 60,
      })
      expect(res.body.body.expires_in).toBeLessThanOrEqual(120)
      expect(ctx.otp.sent).toHaveLength(2)

      const second = ctx.otp.last.code
      if (first !== second) await verify2fa(authId, first).expect(401)
      await verify2fa(authId, second).expect(200)
    })

    it('refuses to resend for an unknown or used challenge', async () => {
      await clearCooldowns()
      await resend('665f1c2e8b3e4a0012345678').expect(400)
      await verify2fa(authId, ctx.otp.last.code).expect(200)
      await resend(challengeId).expect(400)
    })
  })

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates the refresh token', async () => {
      const { refresh_token } = await signIn(ctx, username, phoneNumber)

      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(200)
      expect(res.body.message).toBe('Token refreshed successfully')
      expect(res.body.body.refresh_token).not.toBe(refresh_token)
      await request(server)
        .get('/api/v1/auth/me')
        .set(bearer(res.body.body.access_token))
        .expect(200)

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(401)
        .expect({ code: 401, message: 'Invalid or expired refresh token' })
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: res.body.body.refresh_token })
        .expect(200)
    })

    it('stores only a hash of the refresh token', async () => {
      const { refresh_token } = await signIn(ctx, username, phoneNumber)
      const session = await ctx.conn.collection('auth_sessions').findOne({})
      expect(session?.refresh_token_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(session?.refresh_token_hash).not.toBe(refresh_token)
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the access and refresh tokens of the current session only', async () => {
      const first = await signIn(ctx, username, phoneNumber)
      await clearCooldowns()
      const login2 = (await login().expect(200)).body.body
      const second = (
        await verify2fa(login2.auth_id, ctx.otp.last.code).expect(200)
      ).body.body

      await request(server)
        .post('/api/v1/auth/logout')
        .set(bearer(first.access_token))
        .expect(200)
        .expect({ code: 200, message: 'Logged out successfully' })

      await request(server)
        .get('/api/v1/auth/me')
        .set(bearer(first.access_token))
        .expect(401)
        .expect({ code: 401, message: 'Session has ended' })
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: first.refresh_token })
        .expect(401)
      await request(server)
        .get('/api/v1/auth/me')
        .set(bearer(second.access_token))
        .expect(200)
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without a bearer token', () => {
      return request(server)
        .get('/api/v1/auth/me')
        .expect(401)
        .expect({ code: 401, message: 'Missing bearer token' })
    })

    it.each([
      ['a malformed token', () => 'not-a-jwt'],
      [
        'a token signed with another secret',
        () =>
          new JwtService({ secret: 'x'.repeat(32) }).sign({
            sub: 'a',
            sid: 'b',
          }),
      ],
      [
        'an expired token',
        () =>
          ctx.app
            .get(JwtService)
            .sign({ sub: 'a', sid: 'b' }, { expiresIn: -1 }),
      ],
    ])('returns 401 for %s', async (_case, token) => {
      await request(server)
        .get('/api/v1/auth/me')
        .set(bearer(token()))
        .expect(401)
        .expect({ code: 401, message: 'Invalid or expired token' })
    })
  })
})
