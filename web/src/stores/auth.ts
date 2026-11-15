import { computed, ref, shallowRef } from 'vue'

import { defineStore } from 'pinia'

import type {
  AuthTokens,
  AuthUser,
  OtpChallenge,
  PendingLogin,
  PendingLoginState,
} from '@/types/Auth'

import { useAppDataStore } from '@/stores/appData'

import { AuthAPI } from '@/api/authApi'
import { apiService } from '@/services/apiService'

const authApi = new AuthAPI(apiService)

/**
 * Kept across reloads so a session survives a refresh of the page. The access
 * token stays in memory only and is re-issued from this on startup.
 */
const REFRESH_TOKEN_KEY = 'refreshToken'

export const useAuthStore = defineStore('auth', () => {
  const appData = useAppDataStore()

  const user = shallowRef<AuthUser | null>(null)
  const accessToken = ref<string | null>(null)
  /** Password passed and an OTP was sent; waiting for POST /auth/verify-2fa. */
  const pendingLogin = shallowRef<PendingLoginState | null>(null)

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null)

  const setUser = (newUser: AuthUser | null) => {
    user.value = newUser
    appData.setDisplayName(newUser?.username ?? '')
  }

  const setPendingLogin = (login: PendingLogin | null) => {
    pendingLogin.value = login && withDeadlines(login)
  }

  /** Applies a resent code: new challenge details, same pending login. */
  const updatePendingChallenge = (challenge: OtpChallenge) => {
    if (!pendingLogin.value) return
    pendingLogin.value = withDeadlines({ ...pendingLogin.value, ...challenge })
  }

  const setSession = (tokens: AuthTokens) => {
    accessToken.value = tokens.access_token
    writeRefreshToken(tokens.refresh_token)
    pendingLogin.value = null
    setUser(tokens.user)
  }

  const clearSession = () => {
    accessToken.value = null
    writeRefreshToken(null)
    pendingLogin.value = null
    setUser(null)
  }

  /** Exchanges the stored refresh token for a new session. */
  const refreshSession = async (): Promise<boolean> => {
    const refreshToken = readRefreshToken()
    if (!refreshToken) return false
    try {
      setSession(await authApi.refresh(refreshToken))
      return true
    } catch {
      clearSession()
      return false
    }
  }

  apiService.setSession({
    getAccessToken: () => accessToken.value,
    refresh: refreshSession,
    onExpired: clearSession,
  })

  // Resolves once a saved session has been restored (or ruled out)
  const authReady = refreshSession().then(() => undefined)
  const waitForAuthReady = () => authReady

  return {
    user,
    accessToken,
    pendingLogin,
    isAuthenticated,
    setPendingLogin,
    updatePendingChallenge,
    setSession,
    clearSession,
    refreshSession,
    waitForAuthReady,
  }
})

function withDeadlines(login: PendingLogin): PendingLoginState {
  const now = Date.now()
  return {
    ...login,
    expiresAt: now + login.expires_in * 1000,
    resendAvailableAt: now + login.resend_after * 1000,
  }
}

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
    else localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode): the session lasts until reload.
  }
}
