import type { UserRole } from '../../db/schema.js';

/** How an account can sign in. An account can hold both. */
export type SignInMethod = 'password' | 'google';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  signInMethods: SignInMethod[];
  createdAt: Date;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenResult {
  accessToken: string;
  refreshToken: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}
