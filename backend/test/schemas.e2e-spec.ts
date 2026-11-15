import {
  createConnection,
  type Collection,
  type Connection,
  Types,
} from 'mongoose'

import {
  AuditEventType,
  AuditLogSchema,
  AuditResult,
} from '../src/audit-logs/audit-log.schema.js'
import { AuthSessionSchema } from '../src/auth/auth-session.schema.js'
import {
  OTP_CHALLENGE_RETENTION_SECONDS,
  OtpChallengeSchema,
  OtpPurpose,
  OtpStatus,
} from '../src/otp/otp-challenge.schema.js'
import { UserSchema, UserStatus } from '../src/users/user.schema.js'

const registerModels = (conn: Connection) => ({
  User: conn.model('UserEntity', UserSchema),
  OtpChallenge: conn.model('OtpChallengeEntity', OtpChallengeSchema),
  AuditLog: conn.model('AuditLogEntity', AuditLogSchema),
  AuthSession: conn.model('AuthSessionEntity', AuthSessionSchema),
})

describe('Auth schemas (e2e)', () => {
  let conn: Connection
  let User: ReturnType<typeof registerModels>['User']
  let OtpChallenge: ReturnType<typeof registerModels>['OtpChallenge']
  let AuditLog: ReturnType<typeof registerModels>['AuditLog']
  let AuthSession: ReturnType<typeof registerModels>['AuthSession']

  const indexesOf = async (model: { collection: Collection }) =>
    (await model.collection.indexes()).map(
      ({ key, unique, expireAfterSeconds }) => ({
        key,
        unique,
        expireAfterSeconds,
      }),
    )

  beforeAll(async () => {
    conn = await createConnection(process.env.MONGODB_URI!, {
      dbName: 'schemas-e2e',
    }).asPromise()
    ;({ User, OtpChallenge, AuditLog, AuthSession } = registerModels(conn))
    await conn.dropDatabase()
    await Promise.all([
      User.syncIndexes(),
      OtpChallenge.syncIndexes(),
      AuditLog.syncIndexes(),
      AuthSession.syncIndexes(),
    ])
  })

  afterAll(async () => {
    await conn.dropDatabase()
    await conn.close()
  })

  it('stores collections under the ERD names', () => {
    expect(User.collection.name).toBe('users')
    expect(OtpChallenge.collection.name).toBe('otp_challenges')
    expect(AuditLog.collection.name).toBe('audit_logs')
    expect(AuthSession.collection.name).toBe('auth_sessions')
  })

  it('stores references as ObjectId so string IDs are cast in queries', () => {
    expect(OtpChallengeSchema.path('user_id').instance).toBe('ObjectId')
    expect(AuditLogSchema.path('user_id').instance).toBe('ObjectId')
    // Challenge IDs are UUID strings.
    expect(AuditLogSchema.path('challenge_id').instance).toBe('String')
    expect(OtpChallengeSchema.path('_id').instance).toBe('String')
    expect(AuthSessionSchema.path('user_id').instance).toBe('ObjectId')
  })

  describe('users', () => {
    let n = 0
    const newUser = (fields: object = {}) =>
      User.create({ username: `user_${++n}`, password_hash: 'hash', ...fields })

    it('defaults status to pending, lowercases the username and hides the hash', async () => {
      const user = await newUser({ username: 'John.Doe' })
      expect(user.username).toBe('john.doe')
      expect(user.status).toBe(UserStatus.PENDING)
      expect(user.created_at).toBeInstanceOf(Date)
      expect(user.updated_at).toBeInstanceOf(Date)

      const found = await User.findById(user._id).lean()
      expect(found).not.toHaveProperty('password_hash')
    })

    it('requires a username and password hash', async () => {
      await expect(User.create({})).rejects.toThrow(
        /username.*password_hash|password_hash.*username/s,
      )
    })

    it('rejects an invalid username, phone number or status', async () => {
      await expect(newUser({ username: 'no spaces' })).rejects.toThrow(
        /username/,
      )
      await expect(newUser({ phone_number: '0812345678' })).rejects.toThrow(
        /phone_number/,
      )
      await expect(
        newUser({ status: 'deleted' as UserStatus }),
      ).rejects.toThrow(/status/)
    })

    it('enforces a unique username', async () => {
      await newUser({ username: 'taken' })
      await expect(newUser({ username: 'TAKEN' })).rejects.toThrow(/E11000/)
    })

    it('enforces a unique phone number only when one is set', async () => {
      await newUser()
      await newUser()
      await newUser({ phone_number: '+66811111111' })
      await expect(newUser({ phone_number: '+66811111111' })).rejects.toThrow(
        /E11000/,
      )
    })
  })

  describe('otp_challenges', () => {
    it('allows a challenge without a user and applies defaults', async () => {
      const challenge = await OtpChallenge.create({
        phone_number: '+66822222222',
        purpose: OtpPurpose.SIGN_UP,
        ref: 'K7QP',
        expires_at: new Date(Date.now() + 5 * 60_000),
      })
      expect(challenge.user_id).toBeUndefined()
      expect(challenge._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      expect(challenge.status).toBe(OtpStatus.PENDING)
      expect(challenge.failed_attempts).toBe(0)
      expect(challenge.created_at).toBeInstanceOf(Date)
      expect(challenge.get('updated_at')).toBeUndefined()
    })

    it('requires purpose and expires_at', async () => {
      await expect(
        OtpChallenge.create({ phone_number: '+66822222222' }),
      ).rejects.toThrow(/purpose.*expires_at|expires_at.*purpose/s)
    })

    it('has a lookup index and a TTL index on expires_at', async () => {
      const indexes = await indexesOf(OtpChallenge)
      expect(indexes).toContainEqual(
        expect.objectContaining({
          key: { phone_number: 1, purpose: 1, status: 1, created_at: -1 },
        }),
      )
      expect(indexes).toContainEqual(
        expect.objectContaining({
          key: { expires_at: 1 },
          expireAfterSeconds: OTP_CHALLENGE_RETENTION_SECONDS,
        }),
      )
    })
  })

  describe('audit_logs', () => {
    it('stores metadata and references', async () => {
      const log = await AuditLog.create({
        user_id: new Types.ObjectId(),
        challenge_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        event_type: AuditEventType.OTP_VERIFY,
        result: AuditResult.FAILURE,
        ip_address: '203.0.113.7',
        user_agent: 'vitest',
        metadata: { reason: 'invalid_code', attempt: 2 },
      })
      const found = await AuditLog.findById(log._id).lean<any>()
      expect(found.metadata).toEqual({ reason: 'invalid_code', attempt: 2 })
      expect(found.user_id).toBeInstanceOf(Types.ObjectId)
      expect(found.challenge_id).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
    })

    it('rejects an unknown event type or result', async () => {
      await expect(
        AuditLog.create({
          event_type: 'hack' as AuditEventType,
          result: AuditResult.SUCCESS,
        }),
      ).rejects.toThrow(/event_type/)
      await expect(
        AuditLog.create({
          event_type: AuditEventType.OTP_REQUEST,
          result: 'maybe' as AuditResult,
        }),
      ).rejects.toThrow(/result/)
    })
  })

  describe('auth_sessions', () => {
    it('requires a user and a unique refresh token hash when set', async () => {
      await expect(
        AuthSession.create({
          refresh_token_hash: 'h1',
          expires_at: new Date(),
        }),
      ).rejects.toThrow(/user_id/)

      const session = {
        user_id: new Types.ObjectId(),
        refresh_token_hash: 'h2',
        expires_at: new Date(),
      }
      await AuthSession.create(session)
      await expect(AuthSession.create(session)).rejects.toThrow(/E11000/)

      // Sessions without a refresh token do not collide.
      const { user_id, expires_at } = session
      await AuthSession.create({ user_id, expires_at })
      await AuthSession.create({ user_id, expires_at })
    })

    it('expires sessions at expires_at', async () => {
      expect(await indexesOf(AuthSession)).toContainEqual(
        expect.objectContaining({
          key: { expires_at: 1 },
          expireAfterSeconds: 0,
        }),
      )
    })
  })
})
