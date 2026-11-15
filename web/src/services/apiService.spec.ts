import { describe, expect, it, vi } from 'vitest'

import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'

import { ApiService, type AuthSession } from '@/services/apiService'

/** Adapter answering 401 until the given token is sent, then 200. */
function adapterAcceptingToken(validToken: string): AxiosAdapter {
  return vi.fn<AxiosAdapter>(async (config: InternalAxiosRequestConfig) => {
    const sent = config.headers.Authorization
    const response = { data: { sent }, headers: {}, config, statusText: '' }
    if (sent === `Bearer ${validToken}`) return { ...response, status: 200 }
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      ...response,
      status: 401,
    })
  })
}

function sessionWith(token: { value: string | null }, refreshTo: string | null) {
  const session: AuthSession = {
    getAccessToken: () => token.value,
    refresh: vi.fn<AuthSession['refresh']>(async () => {
      if (!refreshTo) return false
      token.value = refreshTo
      return true
    }),
    onExpired: vi.fn<AuthSession['onExpired']>(),
  }
  return session
}

describe('ApiService', () => {
  it('sends the access token as a Bearer header', async () => {
    const api = new ApiService('http://api.test')
    api.setSession(sessionWith({ value: 'good' }, null))

    const res = await api.get<{ sent: string }>('/me', { adapter: adapterAcceptingToken('good') })
    expect(res.data.sent).toBe('Bearer good')
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const api = new ApiService('http://api.test')
    const session = sessionWith({ value: 'expired' }, 'fresh')
    api.setSession(session)
    const adapter = adapterAcceptingToken('fresh')

    const res = await api.get<{ sent: string }>('/me', { adapter })
    expect(res.data.sent).toBe('Bearer fresh')
    expect(session.refresh).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('shares one refresh between concurrent 401s', async () => {
    const api = new ApiService('http://api.test')
    const session = sessionWith({ value: 'expired' }, 'fresh')
    api.setSession(session)
    const adapter = adapterAcceptingToken('fresh')

    await Promise.all([api.get('/a', { adapter }), api.get('/b', { adapter })])
    expect(session.refresh).toHaveBeenCalledTimes(1)
  })

  it('ends the session when the refresh fails', async () => {
    const api = new ApiService('http://api.test')
    const session = sessionWith({ value: 'expired' }, null)
    api.setSession(session)

    await expect(api.get('/me', { adapter: adapterAcceptingToken('fresh') })).rejects.toThrow(
      'Unauthorized',
    )
    expect(session.onExpired).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for requests that opt out, such as login', async () => {
    const api = new ApiService('http://api.test')
    const session = sessionWith({ value: null }, 'fresh')
    api.setSession(session)

    await expect(
      api.post('/login', {}, { adapter: adapterAcceptingToken('x'), skipAuthRefresh: true }),
    ).rejects.toThrow('Unauthorized')
    expect(session.refresh).not.toHaveBeenCalled()
  })
})
