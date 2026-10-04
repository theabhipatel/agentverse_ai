/**
 * The single place the frontend learns where the backend lives.
 * Never hardcode an API URL anywhere else, import `env` instead.
 */

const apiUrl = import.meta.env.VITE_API_URL ?? '/api'

if (!apiUrl) {
  throw new Error('VITE_API_URL is not set. Copy .env.example to .env.')
}

export const env = {
  apiUrl,
  /** Full URL used for a top level browser redirect, not an XHR. */
  googleLoginUrl: `${apiUrl}/auth/google`,
  /** Where the voice activity model and its runtime are served. Copied there at build by vite.config.ts. */
  vadAssetsPath: `${import.meta.env.BASE_URL}vad/`,
} as const
