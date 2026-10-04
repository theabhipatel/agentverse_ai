import { z } from 'zod';
import { config } from '../../config/env.js';
import { badRequest, serviceUnavailable } from '../../common/errors/index.js';
import type { GoogleProfile } from './auth.types.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });

const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export function assertGoogleEnabled(): void {
  if (!config.google.enabled) {
    throw serviceUnavailable('Google login is not configured on this server');
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function fetchGoogleProfile(code: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.callbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    throw badRequest('Google rejected the authorization code');
  }

  const token = tokenResponseSchema.parse(await tokenResponse.json());

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!profileResponse.ok) {
    throw badRequest('Could not read the Google profile');
  }

  const profile = userInfoSchema.parse(await profileResponse.json());

  if (profile.email_verified === false) {
    throw badRequest('This Google account has an unverified email address');
  }

  return {
    googleId: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name?.trim() || profile.email.split('@')[0],
  };
}
