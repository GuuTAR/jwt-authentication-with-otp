import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'

import { UserEntity, UserSchema } from '../users/user.schema.js'

import { loadAuthConfig } from './auth.config.js'
import { AUTH_CONFIG } from './auth.constants.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { AuthSessionEntity, AuthSessionSchema } from './auth-session.schema.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { PasswordService } from './password.service.js'

const authModels = MongooseModule.forFeature([
  { name: UserEntity.name, schema: UserSchema },
  { name: AuthSessionEntity.name, schema: AuthSessionSchema },
])

@Module({
  imports: [
    authModels,
    JwtModule.registerAsync({
      useFactory: () => {
        const { jwtSecret, jwtExpiresIn } = loadAuthConfig()
        return {
          secret: jwtSecret,
          signOptions: { algorithm: 'HS256', expiresIn: jwtExpiresIn },
          verifyOptions: { algorithms: ['HS256'] },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtAuthGuard,
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
  ],
  // Modules using `@UseGuards(JwtAuthGuard)` resolve its dependencies themselves.
  exports: [JwtAuthGuard, JwtModule, authModels],
})
export class AuthModule {}
