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
import { HttpExceptionFilter } from '../common/http-exception.filter.js'
import { ResponseMessage } from '../common/response-message.decorator.js'
import { ResponseInterceptor } from '../common/response.interceptor.js'

import { AuthLoginResponse, AuthUser } from './auth.model.js'
import { AuthService } from './auth.service.js'
import { CurrentUser } from './current-user.decorator.js'
import { AuthLoginRequest } from './dto/login.dto.js'
import { AuthRegisterRequest } from './dto/register.dto.js'
import { type AuthPrincipal, JwtAuthGuard } from './jwt-auth.guard.js'

const BAD_REQUEST = { status: 400, description: 'Bad Request' }
const UNAUTHORIZED = { status: 401, description: 'Unauthorized' }
const CONFLICT = { status: 409, description: 'Conflict' }
const SERVER_ERROR = { status: 500, description: 'Internal Server Error' }

@ApiTags('auth')
@Controller('api/v1/auth')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: 'Register',
    description: 'Creates a user. Sign in with POST /api/v1/auth/login.',
  })
  @ResponseMessage('User registered successfully')
  @ApiCreatedResponseOf(AuthUser)
  @ApiErrorResponses(BAD_REQUEST, CONFLICT, SERVER_ERROR)
  register(@Body() body: AuthRegisterRequest): Promise<AuthUser> {
    return this.authService.register(body)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: 'Log in with username and password',
    description:
      'Returns a JWT access token.\nUse it as: Authorization: Bearer <access_token>',
  })
  @ResponseMessage('Logged in successfully')
  @ApiOkResponseOf(AuthLoginResponse)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED, SERVER_ERROR)
  login(@Body() body: AuthLoginRequest): Promise<AuthLoginResponse> {
    return this.authService.login(body.username, body.password)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'Log out',
    description: 'Revokes the current session; its access token stops working.',
  })
  @ResponseMessage('Logged out successfully')
  @ApiOkResponseWithoutBody()
  @ApiErrorResponses(UNAUTHORIZED)
  logout(@CurrentUser() user: AuthPrincipal): Promise<void> {
    return this.authService.logout(user)
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
