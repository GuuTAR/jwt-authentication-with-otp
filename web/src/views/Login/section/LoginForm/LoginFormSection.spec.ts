import { beforeEach, describe, expect, it, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'

import { createPinia, setActivePinia } from 'pinia'

import PrimeVue from 'primevue/config'

import { AxiosError, AxiosHeaders } from 'axios'

import type { AuthTokens, LoginInput, PendingLogin } from '@/types/Auth'

import { useAuthStore } from '@/stores/auth'

import LoginFormSection from '@/views/Login/section/LoginForm/LoginFormSection.vue'

const { loginMock, refreshMock, toastAdd, routerPush } = vi.hoisted(() => ({
  routerPush: vi.fn<(to: unknown) => Promise<void>>(),
  loginMock: vi.fn<(input: LoginInput) => Promise<PendingLogin>>(),
  refreshMock: vi.fn<(refreshToken: string) => Promise<AuthTokens>>(),
  toastAdd: vi.fn<(message: object) => void>(),
}))

vi.mock('@/api/authApi', () => ({
  AuthAPI: vi.fn<() => object>(function () {
    return {
      login: loginMock,
      refresh: refreshMock,
      logout: vi.fn<() => Promise<void>>(),
      me: vi.fn<() => Promise<unknown>>(),
    }
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

function httpError(status: number) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, null, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

function mountForm() {
  return mount(LoginFormSection, { global: { plugins: [PrimeVue] }, attachTo: document.body })
}

async function fillAndSubmit(
  wrapper: ReturnType<typeof mountForm>,
  username: string,
  password: string,
) {
  await wrapper.find('#login-username').setValue(username)
  await wrapper.find('#login-password').setValue(password)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
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

describe('LoginFormSection', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('disables sign in until both fields are filled', async () => {
    const wrapper = mountForm()
    const submit = () => wrapper.find('button[type="submit"]')
    expect(submit().attributes('disabled')).toBeDefined()

    await wrapper.find('#login-username').setValue('john')
    expect(submit().attributes('disabled')).toBeDefined()
    await wrapper.find('#login-password').setValue('secret')
    expect(submit().attributes('disabled')).toBeUndefined()
  })

  it('labels both inputs for screen readers', () => {
    const wrapper = mountForm()
    expect(wrapper.find('label[for="login-username"]').text()).toBe('Username')
    expect(wrapper.find('label[for="login-password"]').text()).toBe('Password')
    expect(wrapper.find('#login-password').attributes('autocomplete')).toBe('current-password')
  })

  it('starts 2FA with the trimmed username, keeps the pending login and opens the OTP page', async () => {
    loginMock.mockResolvedValue(PENDING)
    const wrapper = mountForm()

    await fillAndSubmit(wrapper, '  John.Doe ', 'correct-horse')

    expect(loginMock).toHaveBeenCalledWith({ username: 'John.Doe', password: 'correct-horse' })
    expect(useAuthStore().pendingLogin).toMatchObject(PENDING)
    expect(routerPush).toHaveBeenCalledWith({ name: 'verify-otp' })
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: 'Verification code sent',
        detail: '+66*****5678 · Ref: K7QP',
      }),
    )
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe('')
  })

  it.each([
    [401, 'Invalid username or password'],
    [403, 'Two-factor authentication is not set up for this account'],
    [429, 'Too many attempts. Please try again later.'],
    [503, 'Unable to send the verification code. Please try again.'],
    [500, 'Login failed!'],
  ])('shows a message for HTTP %i and keeps the password', async (status, summary) => {
    loginMock.mockRejectedValue(httpError(status))
    const wrapper = mountForm()

    await fillAndSubmit(wrapper, 'john', 'wrong-password')

    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary }))
    expect(useAuthStore().pendingLogin).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe(
      'wrong-password',
    )
  })
})
