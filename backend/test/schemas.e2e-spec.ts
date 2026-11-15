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

  describe('users', () => {
    it('defaults status to pending and sets timestamps', async () => {
      const user = await User.create({ phone_number: '+66812345678' })
      expect(user.status).toBe(UserStatus.PENDING)
      expect(user.created_at).toBeInstanceOf(Date)
      expect(user.updated_at).toBeInstanceOf(Date)
    })

    it('rejects a non-E.164 phone number and unknown status', async () => {
      await expect(User.create({ phone_number: '0812345678' })).rejects.toThrow(
        /phone_number/,
      )
      await expect(
        User.create({
          phone_number: '+66899999999',
          status: 'deleted' as UserStatus,
        }),
      ).rejects.toThrow(/status/)
    })

    it('enforces a unique phone number', async () => {
      await User.create({ phone_number: '+66811111111' })
      await expect(
        User.create({ phone_number: '+66811111111' }),
      ).rejects.toThrow(/E11000/)
    })
  })

  describe('otp_challenges', () => {
    it('allows a challenge without a user and applies defaults', async () => {
      const challenge = await OtpChallenge.create({
        phone_number: '+66822222222',
        purpose: OtpPurpose.SIGN_UP,
        expires_at: new Date(Date.now() + 5 * 60_000),
      })
      expect(challenge.user_id).toBeUndefined()
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
        challenge_id: new Types.ObjectId(),
        event_type: AuditEventType.OTP_VERIFY,
        result: AuditResult.FAILURE,
        ip_address: '203.0.113.7',
        user_agent: 'vitest',
        metadata: { reason: 'invalid_code', attempt: 2 },
      })
      const found = await AuditLog.findById(log._id).lean<any>()
      expect(found.metadata).toEqual({ reason: 'invalid_code', attempt: 2 })
      expect(found.user_id).toBeInstanceOf(Types.ObjectId)
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
    it('requires a user and a unique refresh token hash', async () => {
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
