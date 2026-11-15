import { createParamDecorator, ExecutionContext } from '@nestjs/common'

import type { AuthenticatedRequest } from './jwt-auth.guard.js'

/** The `AuthPrincipal` set by `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
)
