import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'

import {
  SECURITY_CONFIG,
  type SecurityConfig,
} from '../config/security.config.js'

import { AuthSessionEntity, AuthSessionSchema } from './auth-session.schema.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'

const sessionModels = MongooseModule.forFeature([
  { name: AuthSessionEntity.name, schema: AuthSessionSchema },
])

/**
 * Access token signing and `JwtAuthGuard`. Kept separate from `AuthModule` so
 * modules it depends on (e.g. OTP) can protect their own endpoints.
 */
@Module({
  imports: [
    sessionModels,
    JwtModule.registerAsync({
      inject: [SECURITY_CONFIG],
      useFactory: ({ jwtSecret, jwtExpiresIn }: SecurityConfig) => ({
        secret: jwtSecret,
        signOptions: { algorithm: 'HS256', expiresIn: jwtExpiresIn },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [JwtAuthGuard],
  // Modules using `@UseGuards(JwtAuthGuard)` resolve its dependencies themselves.
  exports: [JwtAuthGuard, JwtModule, sessionModels],
})
export class JwtAuthModule {}
