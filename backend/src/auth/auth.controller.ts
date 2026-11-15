import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  ApiCreatedResponseOf,
  ApiErrorResponses,
  ApiOkResponseOf,
  ApiOkResponseWithoutBody,
} from '../common/api-response.decorator.js'
import { Client, type ClientInfo } from '../common/client-info.decorator.js'
import { HttpExceptionFilter } from '../common/http-exception.filter.js'
import { ResponseMessage } from '../common/response-message.decorator.js'
import { ResponseInterceptor } from '../common/response.interceptor.js'

import {
  AuthLoginResponse,
  AuthTokensResponse,
  AuthUser,
} from './auth.model.js'
import { AuthService } from './auth.service.js'
import { CurrentUser } from './current-user.decorator.js'
import { AuthLoginRequest } from './dto/login.dto.js'
import { AuthRefreshRequest } from './dto/refresh.dto.js'
import { AuthRegisterRequest } from './dto/register.dto.js'
import { AuthVerify2faRequest } from './dto/verify-2fa.dto.js'
import { type AuthPrincipal, JwtAuthGuard } from './jwt-auth.guard.js'

const BAD_REQUEST = { status: 400, description: 'Bad Request' }
const UNAUTHORIZED = { status: 401, description: 'Unauthorized' }
const FORBIDDEN = { status: 403, description: 'Forbidden' }
const CONFLICT = { status: 409, description: 'Conflict' }
const TOO_MANY = { status: 429, description: 'Too Many Requests' }
const SERVER_ERROR = { status: 500, description: 'Internal Server Error' }

@ApiTags('auth')
@Controller('api/v1/auth')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register',
    description:
      'Creates a user with status `pending`. It becomes `active` after the first OTP is verified.',
  })
  @ResponseMessage('User registered successfully')
  @ApiCreatedResponseOf(AuthUser)
  @ApiErrorResponses(BAD_REQUEST, CONFLICT, SERVER_ERROR)
  register(
    @Body() body: AuthRegisterRequest,
    @Client() client: ClientInfo,
  ): Promise<AuthUser> {
    return this.authService.register(body, client)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check username/password and start 2FA',
    description:
      'Step 1 of 2. On a correct password, sends an OTP to the phone number and returns `auth_id`. ' +
      'No token is issued: call POST /api/v1/auth/verify-2fa with the code.',
  })
  @ResponseMessage('OTP sent')
  @ApiOkResponseOf(AuthLoginResponse)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, TOO_MANY)
  login(
    @Body() body: AuthLoginRequest,
    @Client() client: ClientInfo,
  ): Promise<AuthLoginResponse> {
    return this.authService.login(body.username, body.password, client)
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and issue JWT',
    description:
      'Step 2 of 2. Returns an access token and a refresh token. Each `auth_id` works once.',
  })
  @ResponseMessage('Logged in successfully')
  @ApiOkResponseOf(AuthTokensResponse)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED)
  verify2fa(
    @Body() body: AuthVerify2faRequest,
    @Client() client: ClientInfo,
  ): Promise<AuthTokensResponse> {
    return this.authService.verify2fa(body.auth_id, body.code, client)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh token',
    description:
      'Exchanges a refresh token for a new access token and a new refresh token. The old refresh token stops working.',
  })
  @ResponseMessage('Token refreshed successfully')
  @ApiOkResponseOf(AuthTokensResponse)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED)
  refresh(
    @Body() body: AuthRefreshRequest,
    @Client() client: ClientInfo,
  ): Promise<AuthTokensResponse> {
    return this.authService.refresh(body.refresh_token, client)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the current session; its access and refresh tokens stop working.',
  })
  @ResponseMessage('Logged out successfully')
  @ApiOkResponseWithoutBody()
  @ApiErrorResponses(UNAUTHORIZED)
  logout(
    @CurrentUser() user: AuthPrincipal,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.authService.logout(user, client)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get current user' })
  @ResponseMessage('User retrieved successfully')
  @ApiOkResponseOf(AuthUser)
  @ApiErrorResponses(UNAUTHORIZED)
  me(@CurrentUser() user: AuthPrincipal): Promise<AuthUser> {
    return this.authService.me(user)
  }
}
