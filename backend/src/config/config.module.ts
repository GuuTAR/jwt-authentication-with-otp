import { Global, Module } from '@nestjs/common'

import { loadSecurityConfig, SECURITY_CONFIG } from './security.config.js'

@Global()
@Module({
  providers: [
    { provide: SECURITY_CONFIG, useFactory: () => loadSecurityConfig() },
  ],
  exports: [SECURITY_CONFIG],
})
export class ConfigModule {}
