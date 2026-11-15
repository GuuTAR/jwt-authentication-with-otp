import { randomUUID } from 'node:crypto'
import { inject } from 'vitest'

// Runs before each test file's imports, so AppModule sees these values.
process.env.MONGODB_URI = inject('mongoUri')
// Test files run in parallel, so each gets its own database.
process.env.MONGODB_DB_NAME = `e2e-${randomUUID()}`
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.OTP_SECRET = 'test-otp-secret-that-is-at-least-32-characters'
