import { randomBytes } from 'node:crypto';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { Request, RequestHandler, Response } from 'express';
import { config } from '../../config/env.js';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import { logger } from '../../common/logger/index.js';
import {
  OAUTH_STATE_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearOAuthStateCookie,
  clearRefreshCookie,
  setOAuthStateCookie,
  setRefreshCookie,
} from './auth.cookie.js';
import { assertGoogleEnabled, buildGoogleAuthUrl } from './auth.google.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.schema.js';
import * as authService from './auth.service.js';
import type { AuthResult } from './auth.types.js';

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}

/** The refresh token goes to the cookie, the access token to the JSON body. Never the reverse. */
function sendAuthResult(res: Response, result: AuthResult, statusCode = 200): void {
  setRefreshCookie(res, result.refreshToken);
  sendSuccess(res, { user: result.user, accessToken: result.accessToken }, statusCode);
}

export const register: RequestHandler<ParamsDictionary, unknown, RegisterInput> = async (req, res) => {
  const result = await authService.register(req.body);
  sendAuthResult(res, result, 201);
};

export const login: RequestHandler<ParamsDictionary, unknown, LoginInput> = async (req, res) => {
  const result = await authService.login(req.body);
  sendAuthResult(res, result);
};

export const forgotPassword: RequestHandler<ParamsDictionary, unknown, ForgotPasswordInput> = async (
  req,
  res,
) => {
  const { expiresIn } = await authService.requestPasswordReset(req.body);
  // Identical answer whether or not the address is registered.
  sendSuccess(res, { sent: true, expiresIn });
};

export const resetPassword: RequestHandler<ParamsDictionary, unknown, ResetPasswordInput> = async (
  req,
  res,
) => {
  await authService.resetPassword(req.body);
  sendSuccess(res, { reset: true });
};

export const refresh: RequestHandler = async (req, res) => {
  const result = await authService.refresh(readRefreshCookie(req));
  sendAuthResult(res, result);
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true });
};

export const me: RequestHandler = async (req, res) => {
  const { id } = getAuthenticatedUser(req);
  const user = await authService.getCurrentUser(id);
  sendSuccess(res, { user });
};

export const updateMe: RequestHandler<ParamsDictionary, unknown, UpdateProfileInput> = async (req, res) => {
  const { id } = getAuthenticatedUser(req);
  const user = await authService.updateProfile(id, req.body);
  sendSuccess(res, { user });
};

export const changePassword: RequestHandler<ParamsDictionary, unknown, ChangePasswordInput> = async (
  req,
  res,
) => {
  const { id } = getAuthenticatedUser(req);
  const result = await authService.changePassword(id, req.body);
  // The old sessions are gone, so this one continues on the new pair set here.
  sendAuthResult(res, result);
};

export const googleRedirect: RequestHandler = async (_req, res) => {
  assertGoogleEnabled();
  const state = randomBytes(16).toString('hex');
  setOAuthStateCookie(res, state);
  res.redirect(buildGoogleAuthUrl(state));
};

export const googleCallback: RequestHandler = async (req, res) => {
  assertGoogleEnabled();

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const expectedState: unknown = req.cookies?.[OAUTH_STATE_COOKIE_NAME];
  clearOAuthStateCookie(res);

  const failureRedirect = `${config.app.clientUrl}/login?error=google_auth_failed`;

  if (!code || !state || typeof expectedState !== 'string' || state !== expectedState) {
    logger.warn({ requestId: req.requestId }, 'Google callback rejected: missing code or state mismatch');
    res.redirect(failureRedirect);
    return;
  }

  try {
    const result = await authService.loginWithGoogle(code);
    setRefreshCookie(res, result.refreshToken);
    // No token in the URL: the client picks up an access token by calling /api/auth/refresh.
    res.redirect(`${config.app.clientUrl}/auth/callback`);
  } catch (error) {
    logger.error({ requestId: req.requestId, err: error }, 'Google login failed');
    res.redirect(failureRedirect);
  }
};
