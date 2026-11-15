import type { AxiosResponse } from 'axios'

import type { AuthTokens, AuthUser, LoginInput, PendingLogin, VerifyOtpInput } from '@/types/Auth'
import type { ResponseData } from '@/types/ResponseData'

import type { ApiService } from '@/services/apiService'

/**
 * Auth endpoints. Errors are thrown as AxiosError so callers can react to the
 * status code (401 wrong credentials, 429 rate limited, 503 SMS unavailable, ...).
 */
export class AuthAPI {
  private api: ApiService

  constructor(apiService: ApiService) {
    this.api = apiService
  }

  /** Step 1 of 2FA: checks the password and sends an OTP. Never returns a token. */
  public login = async (input: LoginInput): Promise<PendingLogin> => {
    const result: AxiosResponse<ResponseData<PendingLogin>> = await this.api.post<
      ResponseData<PendingLogin>,
      LoginInput
    >('/api/v1/auth/login', input)
    return result.data.body
  }

  /** Step 2 of 2FA: checks the OTP and issues the tokens. */
  public verify2fa = async (input: VerifyOtpInput): Promise<AuthTokens> => {
    const result: AxiosResponse<ResponseData<AuthTokens>> = await this.api.post<
      ResponseData<AuthTokens>,
      VerifyOtpInput
    >('/api/v1/auth/verify-2fa', input, { skipAuthRefresh: true })
    return result.data.body
  }

  public refresh = async (refreshToken: string): Promise<AuthTokens> => {
    const result: AxiosResponse<ResponseData<AuthTokens>> = await this.api.post<
      ResponseData<AuthTokens>,
      { refresh_token: string }
    >('/api/v1/auth/refresh', { refresh_token: refreshToken }, { skipAuthRefresh: true })
    return result.data.body
  }

  public logout = async (): Promise<void> => {
    await this.api.post<undefined>('/api/v1/auth/logout', undefined, { skipAuthRefresh: true })
  }

  public me = async (): Promise<AuthUser> => {
    const result: AxiosResponse<ResponseData<AuthUser>> =
      await this.api.get<ResponseData<AuthUser>>('/api/v1/auth/me')
    return result.data.body
  }
}
