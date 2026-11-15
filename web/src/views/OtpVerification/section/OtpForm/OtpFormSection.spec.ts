import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'

import { createPinia, setActivePinia } from 'pinia'

import PrimeVue from 'primevue/config'
import InputOtp from 'primevue/inputotp'

import { AxiosError, AxiosHeaders } from 'axios'

import type { AuthTokens, OtpChallenge, PendingLogin, VerifyOtpInput } from '@/types/Auth'

import { useAuthStore } from '@/stores/auth'

import OtpFormSection from '@/views/OtpVerification/section/OtpForm/OtpFormSection.vue'

const { verifyMock, resendMock, toastAdd, routerPush } = vi.hoisted(() => ({
  verifyMock: vi.fn<(input: VerifyOtpInput) => Promise<AuthTokens>>(),
  resendMock: vi.fn<(challengeId: string) => Promise<OtpChallenge>>(),
  toastAdd: vi.fn<(message: object) => void>(),
  routerPush: vi.fn<(to: unknown) => Promise<void>>(),
}))

vi.mock('@/api/authApi', () => ({
  AuthAPI: vi.fn<() => object>(function () {
    return {
      verify2fa: verifyMock,
      refresh: vi.fn<() => Promise<AuthTokens>>().mockRejectedValue(new Error('no session')),
      logout: vi.fn<() => Promise<void>>(),
    }
  }),
}))
vi.mock('@/api/otpApi', () => ({
  OtpAPI: vi.fn<() => object>(function () {
    return { resend: resendMock }
  }),
}))
vi.mock('primevue', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

const PENDING: PendingLogin = {
  auth_id: '3f2b8c1e-7d4a-4f6b-9a2e-1c5d8e9f0a1b',
  challenge_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  ref: 'K7QP',
  expires_in: 300,
  resend_after: 60,
  phone_hint: '+66*****5678',
}

const TOKENS: AuthTokens = {
  access_token: 'access',
  token_type: 'Bearer',
  expires_in: 900,
  refresh_token: 'refresh',
  refresh_expires_in: 604800,
  user: {
    id: '665f1c2e8b3e4a0012345678',
    username: 'john.doe',
    status: 'active',
    created_at: '2026-11-15T10:00:00Z',
    updated_at: '2026-11-15T10:00:00Z',
  },
}

function httpError(status: number) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, null, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

/** Node's experimental global localStorage shadows jsdom's, so use a plain in-memory one. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

function mountForm() {
  useAuthStore().setPendingLogin(PENDING)
  return mount(OtpFormSection, { global: { plugins: [PrimeVue] } })
}

async function enterCode(wrapper: ReturnType<typeof mountForm>, code: string) {
  wrapper.findComponent(InputOtp).vm.$emit('update:modelValue', code)
  await flushPromises()
}

const buttonNamed = (wrapper: ReturnType<typeof mountForm>, label: string) =>
  wrapper.findAll('button').find((b) => b.text().startsWith(label))!

describe('OtpFormSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
    vi.stubGlobal('localStorage', memoryStorage())
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows where the code went, its Ref and the expiry countdown', () => {
    const text = mountForm().text()
    expect(text).toContain('Code sent to +66*****5678')
    expect(text).toContain('Ref: K7QP')
    expect(text).toContain('Code expires in 5:00')
  })

  it('verifies as soon as 6 digits are entered and signs the user in', async () => {
    verifyMock.mockResolvedValue(TOKENS)
    const wrapper = mountForm()

    await enterCode(wrapper, '12345')
    expect(verifyMock).not.toHaveBeenCalled()
    await enterCode(wrapper, '123456')

    expect(verifyMock).toHaveBeenCalledWith({ auth_id: PENDING.auth_id, code: '123456' })
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(true)
    expect(store.pendingLogin).toBeNull()
    expect(routerPush).toHaveBeenCalledWith({ name: 'home' })
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Login successful!' }),
    )
  })

  it('clears the code and stays on the page when the code is wrong', async () => {
    verifyMock.mockRejectedValue(httpError(401))
    const wrapper = mountForm()

    await enterCode(wrapper, '000000')

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', summary: 'Invalid or expired code' }),
    )
    expect(wrapper.findComponent(InputOtp).props('modelValue')).toBe('')
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('allows a resend only after the cooldown, then shows the new Ref', async () => {
    resendMock.mockResolvedValue({ ...PENDING, ref: 'M4ZC', expires_in: 240, resend_after: 60 })
    const wrapper = mountForm()

    const resend = () => buttonNamed(wrapper, 'Resend code')
    expect(resend().text()).toBe('Resend code in 1:00')
    expect(resend().attributes('disabled')).toBeDefined()

    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(resend().text()).toBe('Resend code')
    await resend().trigger('click')
    await flushPromises()

    expect(resendMock).toHaveBeenCalledWith(PENDING.challenge_id)
    expect(wrapper.text()).toContain('Ref: M4ZC')
    expect(wrapper.text()).toContain('Code expires in 4:00')
    expect(resend().text()).toBe('Resend code in 1:00')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Verification code sent',
        detail: '+66*****5678 · Ref: M4ZC',
      }),
    )
  })

  it('sends the user back to sign in when the challenge can no longer be resent', async () => {
    resendMock.mockRejectedValue(httpError(400))
    const wrapper = mountForm()
    vi.advanceTimersByTime(60_000)
    await flushPromises()

    await buttonNamed(wrapper, 'Resend code').trigger('click')
    await flushPromises()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Your sign-in has expired. Please sign in again.' }),
    )
    expect(useAuthStore().pendingLogin).toBeNull()
    expect(routerPush).toHaveBeenCalledWith({ name: 'login' })
  })

  it('stops accepting codes once expired and offers to sign in again', async () => {
    const wrapper = mountForm()
    vi.advanceTimersByTime(300_000)
    await flushPromises()

    expect(wrapper.text()).toContain('This code has expired. Please sign in again.')
    await enterCode(wrapper, '123456')
    expect(verifyMock).not.toHaveBeenCalled()

    await buttonNamed(wrapper, 'Sign in again').trigger('click')
    await flushPromises()
    expect(routerPush).toHaveBeenCalledWith({ name: 'login' })
  })

  it('lets the user switch to a different account', async () => {
    const wrapper = mountForm()
    await buttonNamed(wrapper, 'Use a different account').trigger('click')
    await flushPromises()

    expect(useAuthStore().pendingLogin).toBeNull()
    expect(routerPush).toHaveBeenCalledWith({ name: 'login' })
  })
})
