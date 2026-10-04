/**
 * The access token lives here and nowhere else: not in localStorage,
 * not in a cookie, not in a React or zustand store. It dies with the tab
 * and is rebuilt on boot from the httpOnly refresh cookie.
 */

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}
