import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import { CONFIG } from '@/config'

import { STATUS_CODE } from '@/enum/global'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not try to refresh the session when this request answers 401. */
    skipAuthRefresh?: boolean
    /** Internal: set once a request has been retried after a refresh. */
    authRetried?: boolean
  }
}

/** Provided by the auth store, so this service does not depend on Pinia. */
export interface AuthSession {
  getAccessToken: () => string | null
  /** Exchanges the refresh token for new tokens. Resolves false when that fails. */
  refresh: () => Promise<boolean>
  /** Called when a 401 could not be recovered by refreshing. */
  onExpired: () => void
}

export class ApiService {
  private client: AxiosInstance
  private session: AuthSession | null = null
  private pendingRefresh: Promise<boolean> | null = null

  constructor(baseURL: string = CONFIG.API_BASE_URL) {
    this.client = axios.create({ baseURL })

    // Attach the backend access token (JWT) of the signed-in user.
    this.client.interceptors.request.use((config) => {
      const token = this.session?.getAccessToken()
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })

    // On 401, refresh the session once and retry the request.
    this.client.interceptors.response.use(undefined, async (error: unknown) => {
      if (!(error instanceof AxiosError) || !this.session || !error.config) throw error
      const config = error.config
      const isUnauthorized = error.response?.status === STATUS_CODE.UNAUTHORIZED
      if (!isUnauthorized || config.skipAuthRefresh || config.authRetried) throw error

      // Concurrent 401s share one refresh request.
      this.pendingRefresh ??= this.session.refresh().finally(() => {
        this.pendingRefresh = null
      })
      if (!(await this.pendingRefresh)) {
        this.session.onExpired()
        throw error
      }
      return this.client.request({ ...config, authRetried: true })
    })
  }

  public setSession(session: AuthSession | null): void {
    this.session = session
  }

  public get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config)
  }

  public post<T, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T, AxiosResponse<T>, D>(url, data, config)
  }

  public patch<T, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<AxiosResponse<T>> {
    return this.client.patch<T, AxiosResponse<T>, D>(url, data, config)
  }

  public delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config)
  }
}

export const apiService = new ApiService()
