import type { AxiosResponse } from 'axios'

import type { OtpChallenge } from '@/types/Auth'
import type { ResponseData } from '@/types/ResponseData'

import type { ApiService } from '@/services/apiService'

/** OTP endpoints. Errors are thrown as AxiosError so callers can react to the status. */
export class OtpAPI {
  private api: ApiService

  constructor(apiService: ApiService) {
    this.api = apiService
  }

  /** Sends a new code for a live challenge. Keeps its expiry and attempt count. */
  public resend = async (challengeId: string): Promise<OtpChallenge> => {
    const result: AxiosResponse<ResponseData<OtpChallenge>> = await this.api.post<
      ResponseData<OtpChallenge>,
      { challenge_id: string }
    >('/api/v1/otp/resend', { challenge_id: challengeId }, { skipAuthRefresh: true })
    return result.data.body
  }
}
