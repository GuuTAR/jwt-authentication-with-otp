import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { Model } from 'mongoose'

import {
  ApiErrorResponses,
  ApiOkResponseOf,
  ApiOkResponseWithoutBody,
} from '../common/api-response.decorator.js'
import { Client, type ClientInfo } from '../common/client-info.decorator.js'
import { HttpExceptionFilter } from '../common/http-exception.filter.js'
import { ResponseMessage } from '../common/response-message.decorator.js'
import { ResponseInterceptor } from '../common/response.interceptor.js'

import { CurrentUser } from '../auth/current-user.decorator.js'
import { type AuthPrincipal, JwtAuthGuard } from '../auth/jwt-auth.guard.js'

import { UserEntity, UserStatus } from '../users/user.schema.js'

import { OtpPurpose } from './otp-challenge.schema.js'
import {
  OtpChallengeResponse,
  OtpResendRequest,
  OtpVerifyRequest,
  toChallengeResponse,
} from './otp.dto.js'
import { OtpService } from './otp.service.js'

const BAD_REQUEST = { status: 400, description: 'Bad Request' }
const UNAUTHORIZED = { status: 401, description: 'Unauthorized' }
const TOO_MANY = { status: 429, description: 'Too Many Requests' }

@ApiTags('otp')
@Controller('api/v1/otp')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'Request OTP',
    description:
      "Sends a code to the signed-in user's phone number to verify it.",
  })
  @ResponseMessage('OTP sent')
  @ApiOkResponseOf(OtpChallengeResponse)
  @ApiErrorResponses(UNAUTHORIZED, TOO_MANY)
  async request(
    @CurrentUser() user: AuthPrincipal,
    @Client() client: ClientInfo,
  ): Promise<OtpChallengeResponse> {
    const found = await this.userModel.findById(user.userId).lean()
    if (!found) throw new NotFoundException('User not found')
    if (!found.phone_number) {
      throw new ForbiddenException('No phone number on this account')
    }

    const issued = await this.otpService.issue({
      userId: user.userId,
      phoneNumber: found.phone_number,
      purpose: OtpPurpose.VERIFY_PHONE,
      client,
    })
    return toChallengeResponse(issued, found.phone_number)
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'Verify OTP',
    description:
      'Verifies a code from POST /api/v1/otp/request and marks the phone number as verified.',
  })
  @ResponseMessage('Phone number verified')
  @ApiOkResponseWithoutBody()
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED)
  async verify(
    @CurrentUser() user: AuthPrincipal,
    @Client() client: ClientInfo,
    @Body() body: OtpVerifyRequest,
  ): Promise<void> {
    await this.otpService.verify({
      challengeId: body.challenge_id,
      code: body.code,
      userId: user.userId,
      purpose: OtpPurpose.VERIFY_PHONE,
      client,
    })
    await this.userModel.updateOne(
      { _id: user.userId, status: UserStatus.PENDING },
      { status: UserStatus.ACTIVE },
    )
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend OTP',
    description:
      'Sends a new code for a live challenge, including the login challenge from POST /api/v1/auth/login. ' +
      'The expiry and the failed-attempt count are not reset.',
  })
  @ResponseMessage('OTP sent')
  @ApiOkResponseOf(OtpChallengeResponse)
  @ApiErrorResponses(BAD_REQUEST, TOO_MANY)
  async resend(
    @Client() client: ClientInfo,
    @Body() body: OtpResendRequest,
  ): Promise<OtpChallengeResponse> {
    const { issued, phoneNumber } = await this.otpService.resend(
      body.challenge_id,
      client,
    )
    return toChallengeResponse(issued, phoneNumber)
  }
}
