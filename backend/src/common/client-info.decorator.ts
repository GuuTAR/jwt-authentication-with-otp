import { createParamDecorator, ExecutionContext } from '@nestjs/common'

import type { Request } from 'express'

/** Caller details recorded in audit logs and used for rate limiting. */
export interface ClientInfo {
  ip: string
  userAgent?: string
}

export const Client = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const req = ctx.switchToHttp().getRequest<Request>()
    return {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'],
    }
  },
)
