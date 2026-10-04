import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { config } from '../../config/env.js';
import {
  ErrorCode,
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
  unauthorized,
} from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { sendMail } from '../../common/mailer/index.js';
import { sha256 } from '../../common/utils/crypto.js';
import { durationToMs, formatDuration } from '../../common/utils/duration.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/utils/jwt.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { db } from '../../db/index.js';
import { passwordResetTokens, platformSettings, refreshTokens, users, type UserRow } from '../../db/schema.js';
import { buildPasswordResetEmail } from './auth.email.js';
import { fetchGoogleProfile } from './auth.google.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.schema.js';
import type { AuthResult, AuthUser, SignInMethod } from './auth.types.js';

function signInMethodsOf(user: UserRow): SignInMethod[] {
  const methods: SignInMethod[] = [];
  if (user.passwordHash) {
    methods.push('password');
  }
  if (user.googleId) {
    methods.push('google');
  }
  return methods;
}

function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    signInMethods: signInMethodsOf(user),
    createdAt: user.createdAt,
  };
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

async function findUserById(id: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

/** Issues a new access token and a new refresh token, persisting only the refresh hash. */
async function issueTokens(user: UserRow): Promise<AuthResult> {
  const tokenId = randomUUID();
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });

  await db.insert(refreshTokens).values({
    id: tokenId,
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + durationToMs(config.auth.refresh.expiresIn)),
  });

  return {
    user: toAuthUser(user),
    accessToken: signAccessToken({ userId: user.id, email: user.email }),
    refreshToken,
  };
}

async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/**
 * Signs every device out after a password change or reset. The rows are deleted, not
 * marked revoked: a revoked token that is replayed reads as theft and triggers
 * revokeAllUserTokens, so the first other device to refresh would also kill the
 * fresh session of the person who just changed the password. An unknown token is
 * simply refused.
 */
async function endAllSessions(userId: string): Promise<void> {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

const SIGNUP_SETTING_KEY = 'signup';

/** Off means only an admin can create accounts; existing users still log in normally. */
export async function isSignupEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ enabled: platformSettings.enabled })
    .from(platformSettings)
    .where(eq(platformSettings.key, SIGNUP_SETTING_KEY))
    .limit(1);
  return row?.enabled ?? true;
}

export async function setSignupEnabled(actingAdminId: string, enabled: boolean): Promise<boolean> {
  await db
    .insert(platformSettings)
    .values({ key: SIGNUP_SETTING_KEY, enabled })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { enabled, updatedAt: new Date() },
    });
  logger.info({ enabled, actingAdminId }, 'Admin switched self sign up');
  return enabled;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  if (!(await isSignupEnabled())) {
    throw forbidden('Sign ups are currently closed. Ask an admin to create your account.');
  }

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw conflict('An account with this email already exists', ErrorCode.EMAIL_ALREADY_EXISTS);
  }

  const [user] = await db
    .insert(users)
    .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) })
    .returning();

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  if (!user?.passwordHash) {
    // Covers unknown emails and Google-only accounts without leaking which one it is.
    throw unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  return issueTokens(user);
}

export async function loginWithGoogle(code: string): Promise<AuthResult> {
  const profile = await fetchGoogleProfile(code);

  const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, profile.googleId)).limit(1);
  if (byGoogleId) {
    return issueTokens(byGoogleId);
  }

  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    const [linked] = await db
      .update(users)
      .set({ googleId: profile.googleId, updatedAt: new Date() })
      .where(eq(users.id, byEmail.id))
      .returning();
    return issueTokens(linked);
  }

  const [created] = await db
    .insert(users)
    .values({ email: profile.email, name: profile.name, googleId: profile.googleId })
    .returning();

  return issueTokens(created);
}

/** Verifies, rotates and reissues. A replayed token kills every session for that user. */
export async function refresh(rawRefreshToken: string | undefined): Promise<AuthResult> {
  if (!rawRefreshToken) {
    throw unauthorized('Refresh token missing');
  }

  const payload = verifyRefreshToken(rawRefreshToken);

  const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, payload.tokenId)).limit(1);
  if (!stored || stored.tokenHash !== sha256(rawRefreshToken) || stored.userId !== payload.userId) {
    throw unauthorized('Invalid refresh token');
  }

  if (stored.revokedAt) {
    logger.warn({ userId: stored.userId }, 'Revoked refresh token replayed, revoking all sessions');
    await revokeAllUserTokens(stored.userId);
    throw unauthorized('Refresh token already used');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Refresh token expired');
  }

  const user = await findUserById(stored.userId);
  if (!user) {
    throw unauthorized('Invalid refresh token');
  }

  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));

  return issueTokens(user);
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }

  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, payload.tokenId), isNull(refreshTokens.revokedAt)));
  } catch {
    // An invalid cookie still logs the user out on the client, so this is not an error.
  }
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw notFound('User not found');
  }
  return toAuthUser(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
  const [updated] = await db
    .update(users)
    .set({ name: input.name, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw notFound('User not found');
  }
  return toAuthUser(updated);
}

/**
 * Changes the password, or sets a first one on an account created through Google.
 * Every session is revoked and this one is handed a fresh pair, so anyone holding
 * the old password's sessions is signed out while the person changing it is not.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<AuthResult> {
  const user = await findUserById(userId);
  if (!user) {
    throw notFound('User not found');
  }

  if (user.passwordHash) {
    if (!input.currentPassword) {
      throw badRequest('Enter your current password', ErrorCode.INVALID_CURRENT_PASSWORD);
    }
    // A 400 rather than a 401: the session is fine, only the typed password is wrong.
    const matches = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!matches) {
      throw badRequest('Your current password is incorrect', ErrorCode.INVALID_CURRENT_PASSWORD);
    }
  }

  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  await endAllSessions(user.id);
  logger.info({ userId: user.id, firstPassword: !user.passwordHash }, 'Password changed');
  return issueTokens(updated);
}

/**
 * Always resolves, whether or not the address belongs to an account. Reporting
 * "no such user" would turn this route into a way to discover who has signed up.
 */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<{ expiresIn: string }> {
  if (!config.mail.enabled) {
    throw serviceUnavailable('Password reset is not configured');
  }

  // Returned whether or not the address exists, so the answer stays identical.
  const expiresIn = formatDuration(config.mail.resetExpiresIn);

  const user = await findUserByEmail(input.email);
  if (!user) {
    logger.info({ email: input.email }, 'Password reset asked for an unknown address');
    return { expiresIn };
  }

  // Asking again invalidates the previous link, so only the newest email works.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  const token = randomBytes(32).toString('hex');
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + durationToMs(config.mail.resetExpiresIn)),
  });

  const link = `${config.app.clientUrl}/reset-password?token=${token}`;
  try {
    await sendMail(
      buildPasswordResetEmail({ to: user.email, name: user.name, link, expiresIn }),
    );
  } catch (error) {
    // Surfacing a send failure here would reveal that the account exists, so it is
    // logged instead. The caller always sees the same answer.
    logger.error({ err: error, userId: user.id }, 'Password reset email failed to send');
  }

  return { expiresIn };
}

/** Consumes the token, replaces the password, and signs every existing session out. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, sha256(input.token)))
    .limit(1);

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
    throw badRequest('This reset link is invalid or has expired', ErrorCode.INVALID_RESET_TOKEN);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
    .where(eq(users.id, resetToken.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, resetToken.id));

  await endAllSessions(resetToken.userId);
  logger.info({ userId: resetToken.userId }, 'Password reset completed');
}
