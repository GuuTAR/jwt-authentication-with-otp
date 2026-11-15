import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { getConnectionToken } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../src/app.module.js'

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>
  let conn: Connection

  const credentials = { username: 'john.doe', password: 'correct-horse' }
  const register = (body: object = credentials) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send(body)
  const login = (body: object = credentials) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send(body)
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
    conn = app.get<Connection>(getConnectionToken())
    await Promise.all([
      conn.collection('users').deleteMany({}),
      conn.collection('auth_sessions').deleteMany({}),
    ])
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/v1/auth/register', () => {
    it('creates an active user and never returns the password hash', async () => {
      const res = await register({
        username: '  John.Doe ',
        password: 'correct-horse',
        phone_number: '+66812345678',
      }).expect(201)

      expect(res.body).toEqual({
        code: 201,
        message: 'User registered successfully',
        body: {
          id: expect.stringMatching(/^[0-9a-f]{24}$/),
          username: 'john.doe',
          phone_number: '+66812345678',
          status: 'active',
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })

      const stored = await conn
        .collection('users')
        .findOne({ username: 'john.doe' })
      expect(stored?.password_hash).toMatch(/^scrypt\$/)
      expect(stored?.password_hash).not.toContain('correct-horse')
    })

    it('rejects a taken username with 409', async () => {
      await register().expect(201)
      await register({ ...credentials, username: 'JOHN.DOE' })
        .expect(409)
        .expect({ code: 409, message: 'Username is already taken' })
    })

    it('rejects a taken phone number with 409', async () => {
      const phone_number = '+66812345678'
      await register({ ...credentials, phone_number }).expect(201)
      await register({
        username: 'jane',
        password: 'correct-horse',
        phone_number,
      })
        .expect(409)
        .expect({ code: 409, message: 'Phone number is already registered' })
    })

    it('allows several users without a phone number', async () => {
      await register().expect(201)
      await register({ username: 'jane', password: 'correct-horse' }).expect(
        201,
      )
    })

    it.each([
      ['a short password', { username: 'john', password: 'short' }],
      [
        'an invalid username',
        { username: 'no spaces!', password: 'correct-horse' },
      ],
      [
        'an invalid phone number',
        { ...credentials, phone_number: '0812345678' },
      ],
      ['a missing password', { username: 'john' }],
    ])('rejects %s with 400', async (_case, body) => {
      const res = await register(body).expect(400)
      expect(res.body).toEqual({ code: 400, message: expect.any(String) })
    })
  })

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await register().expect(201)
    })

    it('returns a JWT access token and the user', async () => {
      const res = await login({ ...credentials, username: 'John.Doe' }).expect(
        200,
      )

      expect(res.body).toMatchObject({
        code: 200,
        message: 'Logged in successfully',
        body: {
          token_type: 'Bearer',
          expires_in: 3600,
          user: { username: 'john.doe', status: 'active' },
        },
      })
      expect(res.body.body.user).not.toHaveProperty('password_hash')

      const payload = app.get(JwtService).verify(res.body.body.access_token)
      expect(payload).toMatchObject({
        sub: res.body.body.user.id,
        sid: expect.stringMatching(/^[0-9a-f]{24}$/),
      })
      expect(payload.exp - payload.iat).toBe(3600)
      expect(
        await conn
          .collection('auth_sessions')
          .countDocuments({ revoked_at: { $exists: false } }),
      ).toBe(1)
    })

    it('returns the same 401 for a wrong password and an unknown user', async () => {
      const expected = { code: 401, message: 'Invalid username or password' }
      await login({ ...credentials, password: 'wrong-password' })
        .expect(401)
        .expect(expected)
      await login({ ...credentials, username: 'nobody' })
        .expect(401)
        .expect(expected)
    })

    it('rejects a suspended user', async () => {
      await conn
        .collection('users')
        .updateOne({ username: 'john.doe' }, { $set: { status: 'suspended' } })
      await login()
        .expect(401)
        .expect({ code: 401, message: 'Account is suspended' })
    })

    it('rejects a missing username with 400', async () => {
      await login({ password: 'x' }).expect(400)
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns the current user', async () => {
      await register().expect(201)
      const { access_token, user } = (await login().expect(200)).body.body

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(access_token))
        .expect(200)
        .expect({
          code: 200,
          message: 'User retrieved successfully',
          body: user,
        })
    })

    it('returns 401 without a bearer token', () => {
      return request(app.getHttpServer())
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
          app.get(JwtService).sign({ sub: 'a', sid: 'b' }, { expiresIn: -1 }),
      ],
    ])('returns 401 for %s', async (_case, token) => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(token()))
        .expect(401)
        .expect({ code: 401, message: 'Invalid or expired token' })
    })

    it('returns 401 for a valid signature whose session does not exist', async () => {
      const token = app.get(JwtService).sign({
        sub: '665f1c2e8b3e4a0012345678',
        sid: '665f1c2e8b3e4a0012345679',
      })
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(token))
        .expect(401)
        .expect({ code: 401, message: 'Session has ended' })
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('revokes only the current session', async () => {
      await register().expect(201)
      const first = (await login().expect(200)).body.body.access_token
      const second = (await login().expect(200)).body.body.access_token

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(bearer(first))
        .expect(200)
        .expect({ code: 200, message: 'Logged out successfully' })

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(first))
        .expect(401)
        .expect({ code: 401, message: 'Session has ended' })
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(bearer(first))
        .expect(401)
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(second))
        .expect(200)
    })

    it('returns 401 without a bearer token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401)
    })
  })
})
