import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/config/env'
import { clearAccessToken, getAccessToken, setAccessToken } from './token'
import type { ApiErrorResponse, ApiSuccessResponse, RefreshPayload } from '@/types/api'

const ACCESS_TOKEN_EXPIRED = 'ACCESS_TOKEN_EXPIRED'
const REFRESH_PATH = '/auth/refresh'

type RetriableConfig = InternalAxiosRequestConfig & { retried?: boolean }

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let onUnauthorized: (() => void) | null = null

/** The auth store registers here so a dead session can clear itself without a circular import. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * Single flight refresh. Ten requests failing at once share one promise,
 * so exactly one call to /auth/refresh goes out and all ten replay after it.
 */
let refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<ApiSuccessResponse<RefreshPayload>>(REFRESH_PATH)
      .then((response) => {
        const { accessToken } = response.data.data
        setAccessToken(accessToken)
        return accessToken
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/**
 * For the one request that cannot go through axios, the streamed voice reply.
 * Same rules as the interceptor below: one shared refresh, and a refresh that
 * fails ends the session.
 */
export async function refreshOrSignOut(): Promise<string> {
  try {
    return await refreshAccessToken()
  } catch (error) {
    clearAccessToken()
    onUnauthorized?.()
    throw error
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError<ApiErrorResponse>) => {
  const config = error.config as RetriableConfig | undefined
  const isExpiredAccessToken =
    error.response?.status === 401 && error.response.data?.error?.code === ACCESS_TOKEN_EXPIRED

  if (!config || !isExpiredAccessToken || config.retried || config.url?.endsWith(REFRESH_PATH)) {
    return Promise.reject(error)
  }

  config.retried = true

  /**
   * A 401 can land after another request already refreshed. Refreshing again
   * would send the rotated-away cookie and trip the backend's reuse detection,
   * which revokes every session. So if the token already moved on, just replay.
   */
  const currentToken = getAccessToken()
  if (currentToken && config.headers.Authorization !== `Bearer ${currentToken}`) {
    config.headers.Authorization = `Bearer ${currentToken}`
    return api(config)
  }

  try {
    const token = await refreshAccessToken()
    config.headers.Authorization = `Bearer ${token}`
    return await api(config)
  } catch (refreshError) {
    clearAccessToken()
    onUnauthorized?.()
    return Promise.reject(refreshError)
  }
})

/** Turns an axios failure into the message the backend actually sent. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.error?.message ?? error.message ?? fallback
  }
  return fallback
}
