import type { CookieOptions, Response } from 'express';
import { config } from '../../config/env.js';
import { durationToMs } from '../../common/utils/duration.js';

export const REFRESH_COOKIE_NAME = 'agentverse_refresh_token';
export const OAUTH_STATE_COOKIE_NAME = 'agentverse_oauth_state';

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookie.secure,
    sameSite: 'lax',
    path: config.auth.cookie.path,
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseCookieOptions(),
    maxAge: durationToMs(config.auth.refresh.expiresIn),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE_NAME, state, {
    ...baseCookieOptions(),
    maxAge: OAUTH_STATE_MAX_AGE_MS,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, baseCookieOptions());
}
