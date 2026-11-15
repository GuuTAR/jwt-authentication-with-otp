import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useToast } from 'primevue'

import { isAxiosError } from 'axios'

import { LANGUAGE, STATUS_CODE } from '@/enum/global'
import type { LoginInput, OtpChallenge } from '@/types/Auth'

import {
  INVALID_CODE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  LOGIN_FAILURE_MESSAGE,
  LOGIN_SUCCESS_MESSAGE,
  LOGOUT_SUCCESS_MESSAGE,
  OTP_DELIVERY_FAILURE_MESSAGE,
  OTP_SENT_MESSAGE,
  SIGN_IN_AGAIN_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  TWO_FACTOR_NOT_SET_UP_MESSAGE,
} from '@/lang/auth'

import { useAppDataStore } from '@/stores/appData'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todo'

import { AuthAPI } from '@/api/authApi'
import { OtpAPI } from '@/api/otpApi'
import { apiService } from '@/services/apiService'

const authApi = new AuthAPI(apiService)
const otpApi = new OtpAPI(apiService)

type Message = Record<LANGUAGE, string>

/** Backend error status → message shown to the user, per step. */
const LOGIN_ERRORS: Partial<Record<number, Message>> = {
  [STATUS_CODE.UNAUTHORIZED]: INVALID_CREDENTIALS_MESSAGE,
  [STATUS_CODE.FORBIDDEN]: TWO_FACTOR_NOT_SET_UP_MESSAGE,
  [STATUS_CODE.TOO_MANY_REQUESTS]: TOO_MANY_ATTEMPTS_MESSAGE,
  [STATUS_CODE.SERVICE_UNAVAILABLE]: OTP_DELIVERY_FAILURE_MESSAGE,
}
const VERIFY_ERRORS: Partial<Record<number, Message>> = {
  [STATUS_CODE.BAD_REQUEST]: INVALID_CODE_MESSAGE,
  [STATUS_CODE.UNAUTHORIZED]: INVALID_CODE_MESSAGE,
}
const RESEND_ERRORS: Partial<Record<number, Message>> = {
  [STATUS_CODE.TOO_MANY_REQUESTS]: TOO_MANY_ATTEMPTS_MESSAGE,
  [STATUS_CODE.SERVICE_UNAVAILABLE]: OTP_DELIVERY_FAILURE_MESSAGE,
}

const statusOf = (error: unknown): number | undefined =>
  isAxiosError(error) ? error.response?.status : undefined

export function useAuth() {
  const router = useRouter()
  const toast = useToast()

  const appData = useAppDataStore()
  const authStore = useAuthStore()
  const todoStore = useTodoStore()

  const isLoading = ref(false)

  const showToast = (
    severity: 'success' | 'error',
    message: Message,
    life: number,
    detail?: string,
  ) => {
    toast.add({ severity, summary: message[appData.language], detail, life })
  }

  const showError = (error: unknown, messages: Partial<Record<number, Message>>) => {
    const status = statusOf(error)
    showToast('error', (status && messages[status]) || LOGIN_FAILURE_MESSAGE, 4000)
  }

  const showOtpSent = (challenge: OtpChallenge) => {
    showToast('success', OTP_SENT_MESSAGE, 5000, `${challenge.phone_hint} · Ref: ${challenge.ref}`)
  }

  /**
   * Step 1 of 2FA. On a correct password the backend sends an OTP and returns
   * a pending login; continue on the OTP page. No token yet.
   */
  const login = async (input: LoginInput): Promise<boolean> => {
    isLoading.value = true
    try {
      const pending = await authApi.login(input)
      authStore.setPendingLogin(pending)
      showOtpSent(pending)
      await router.push({ name: 'verify-otp' })
      return true
    } catch (error) {
      showError(error, LOGIN_ERRORS)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /** Step 2 of 2FA. A correct code signs the user in. */
  const verifyOtp = async (code: string): Promise<boolean> => {
    const pending = authStore.pendingLogin
    if (!pending) return false

    isLoading.value = true
    try {
      authStore.setSession(await authApi.verify2fa({ auth_id: pending.auth_id, code }))
      await router.push({ name: 'home' })
      showToast('success', LOGIN_SUCCESS_MESSAGE, 3000)
      return true
    } catch (error) {
      showError(error, VERIFY_ERRORS)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /** Sends a new code. The backend keeps the expiry and the failed-attempt count. */
  const resendOtp = async (): Promise<boolean> => {
    const pending = authStore.pendingLogin
    if (!pending) return false

    isLoading.value = true
    try {
      const challenge = await otpApi.resend(pending.challenge_id)
      authStore.updatePendingChallenge(challenge)
      showOtpSent(challenge)
      return true
    } catch (error) {
      // 400: the challenge expired or was locked, so this login cannot continue.
      if (statusOf(error) === STATUS_CODE.BAD_REQUEST) {
        showToast('error', SIGN_IN_AGAIN_MESSAGE, 4000)
        await cancelLogin()
      } else {
        showError(error, RESEND_ERRORS)
      }
      return false
    } finally {
      isLoading.value = false
    }
  }

  /** Abandons the pending login and returns to the password step. */
  const cancelLogin = async () => {
    authStore.setPendingLogin(null)
    await router.push({ name: 'login' })
  }

  const logout = async () => {
    // Revoke the session on the server; sign out locally even if that fails.
    if (authStore.accessToken) await authApi.logout().catch(() => undefined)
    authStore.clearSession()
    todoStore.resetTodos()
    await router.push({ name: 'login' })
    showToast('success', LOGOUT_SUCCESS_MESSAGE, 3000)
  }

  return {
    isLoading,
    login,
    verifyOtp,
    resendOtp,
    cancelLogin,
    logout,
  }
}
