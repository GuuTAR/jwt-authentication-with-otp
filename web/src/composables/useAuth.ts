import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useToast } from 'primevue'

import { isAxiosError } from 'axios'

import { LANGUAGE, STATUS_CODE } from '@/enum/global'
import type { LoginInput } from '@/types/Auth'

import {
  INVALID_CREDENTIALS_MESSAGE,
  LOGIN_FAILURE_MESSAGE,
  LOGOUT_SUCCESS_MESSAGE,
  OTP_DELIVERY_FAILURE_MESSAGE,
  OTP_SENT_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  TWO_FACTOR_NOT_SET_UP_MESSAGE,
} from '@/lang/auth'

import { useAppDataStore } from '@/stores/appData'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todo'

import { AuthAPI } from '@/api/authApi'
import { apiService } from '@/services/apiService'

const authApi = new AuthAPI(apiService)

/** Backend error status → message shown to the user. */
const LOGIN_ERROR_MESSAGES: Partial<Record<number, Record<LANGUAGE, string>>> = {
  [STATUS_CODE.UNAUTHORIZED]: INVALID_CREDENTIALS_MESSAGE,
  [STATUS_CODE.FORBIDDEN]: TWO_FACTOR_NOT_SET_UP_MESSAGE,
  [STATUS_CODE.TOO_MANY_REQUESTS]: TOO_MANY_ATTEMPTS_MESSAGE,
  [STATUS_CODE.SERVICE_UNAVAILABLE]: OTP_DELIVERY_FAILURE_MESSAGE,
}

export function useAuth() {
  const router = useRouter()
  const toast = useToast()

  const appData = useAppDataStore()
  const authStore = useAuthStore()
  const todoStore = useTodoStore()

  const isLoading = ref(false)

  const showToast = (
    severity: 'success' | 'error',
    message: Record<LANGUAGE, string>,
    life: number,
    detail?: string,
  ) => {
    toast.add({ severity, summary: message[appData.language], detail, life })
  }

  /**
   * Step 1 of 2FA. On a correct password the backend sends an OTP and returns
   * a pending login, kept in the auth store for the OTP step. No token yet.
   */
  const login = async (input: LoginInput): Promise<boolean> => {
    isLoading.value = true
    try {
      const pending = await authApi.login(input)
      authStore.setPendingLogin(pending)
      showToast('success', OTP_SENT_MESSAGE, 5000, `${pending.phone_hint} · Ref: ${pending.ref}`)
      return true
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined
      const message = (status && LOGIN_ERROR_MESSAGES[status]) || LOGIN_FAILURE_MESSAGE
      showToast('error', message, 4000)
      return false
    } finally {
      isLoading.value = false
    }
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
    logout,
  }
}
