import request from 'supertest'
import { bearer, createTestApp, signIn, type TestContext } from './helpers.js'

describe('OTP phone verification (e2e)', () => {
  let ctx: TestContext
  let server: ReturnType<TestContext['app']['getHttpServer']>
  let token: string

  const clearCooldowns = async () => {
    const keys = await ctx.redis.keys('otp:cooldown:*')
    if (keys.length) await ctx.redis.del(...keys)
  }
  const requestOtp = (accessToken = token) =>
    request(server).post('/api/v1/otp/request').set(bearer(accessToken))
  const verifyOtp = (challenge_id: string, code: string, accessToken = token) =>
    request(server)
      .post('/api/v1/otp/verify')
      .set(bearer(accessToken))
      .send({ challenge_id, code })

  beforeEach(async () => {
    ctx = await createTestApp()
    server = ctx.app.getHttpServer()
    token = (await signIn(ctx, 'john')).access_token
    await clearCooldowns()
  })

  afterEach(async () => {
    await ctx.app.close()
  })

  it('requires authentication', async () => {
    await request(server).post('/api/v1/otp/request').expect(401)
    await request(server)
      .post('/api/v1/otp/verify')
      .send({ challenge_id: '665f1c2e8b3e4a0012345678', code: '123456' })
      .expect(401)
  })

  it('verifies the phone number and activates a pending user', async () => {
    await ctx.conn
      .collection('users')
      .updateOne({ username: 'john' }, { $set: { status: 'pending' } })

    const res = await requestOtp().expect(200)
    expect(res.body).toMatchObject({
      code: 200,
      message: 'OTP sent',
      body: { challenge_id: expect.any(String), expires_in: 300 },
    })
    expect(ctx.otp.last.purpose).toBe('verify_phone')

    await verifyOtp(res.body.body.challenge_id, ctx.otp.last.code)
      .expect(200)
      .expect({ code: 200, message: 'Phone number verified' })
    expect(
      (await ctx.conn.collection('users').findOne({ username: 'john' }))
        ?.status,
    ).toBe('active')
  })

  it("rejects another user's challenge and a login challenge", async () => {
    const { challenge_id } = (await requestOtp().expect(200)).body.body
    const mine = ctx.otp.last.code
    const other = (await signIn(ctx, 'jane')).access_token

    await verifyOtp(challenge_id, mine, other)
      .expect(401)
      .expect({ code: 401, message: 'Invalid or expired code' })

    // A sign-in challenge cannot be spent on phone verification.
    await clearCooldowns()
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'john', password: 'correct-horse' })
      .expect(200)
    await verifyOtp(login.body.body.challenge_id, ctx.otp.last.code).expect(401)

    await verifyOtp(challenge_id, mine).expect(200)
  })

  it('rejects an invalid body with 400', async () => {
    await verifyOtp('not-an-id', '12').expect(400)
  })
})
