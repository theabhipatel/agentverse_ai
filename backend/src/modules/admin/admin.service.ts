import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { ErrorCode, badRequest, conflict, notFound } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { hashPassword } from '../../common/utils/password.js';
import { db } from '../../db/index.js';
import {
  conversations,
  messages,
  userDisabledToolkits,
  userIntegrations,
  users,
  type UserRow,
} from '../../db/schema.js';
import type { CreateUserInput, UpdateUserInput } from './admin.schema.js';
import type { AdminStats, AdminUser } from './admin.types.js';
import { TOOLKIT_SLUGS, type ToolkitSlug } from '../integration/integration.constants.js';
import {
  getUserAllowedToolkits,
  listIntegrationSettings,
  setUserToolkitAccess,
} from '../integration/integration.service.js';

/** A live connection to a toolkit we still offer. Rows for removed toolkits are never counted. */
const countedIntegration = () =>
  and(eq(userIntegrations.status, 'connected'), inArray(userIntegrations.toolkit, TOOLKIT_SLUGS));

function toAdminUser(
  user: UserRow,
  conversationCount: number,
  integrationCount: number,
  allowedToolkits: ToolkitSlug[],
): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(user.googleId),
    conversationCount,
    integrationCount,
    allowedToolkits,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      user: users,
      conversationCount: count(conversations.id),
    })
    .from(users)
    .leftJoin(conversations, eq(conversations.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  const integrationRows = await db
    .select({ userId: userIntegrations.userId, total: count(userIntegrations.id) })
    .from(userIntegrations)
    .where(countedIntegration())
    .groupBy(userIntegrations.userId);

  const integrationsByUser = new Map(integrationRows.map((row) => [row.userId, row.total]));

  const disabledRows = await db.select().from(userDisabledToolkits);
  const disabledByUser = new Map<string, Set<string>>();
  for (const row of disabledRows) {
    const set = disabledByUser.get(row.userId) ?? new Set<string>();
    set.add(row.toolkit);
    disabledByUser.set(row.userId, set);
  }

  return rows.map((row) => {
    const disabled = disabledByUser.get(row.user.id) ?? new Set<string>();
    const allowedToolkits = TOOLKIT_SLUGS.filter((slug) => !disabled.has(slug));
    return toAdminUser(
      row.user,
      row.conversationCount,
      integrationsByUser.get(row.user.id) ?? 0,
      allowedToolkits,
    );
  });
}

async function requireUser(userId: string): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw notFound('User not found');
  }
  return user;
}

export async function getUser(userId: string): Promise<AdminUser> {
  const user = await requireUser(userId);
  const [conversationRow] = await db
    .select({ total: count(conversations.id) })
    .from(conversations)
    .where(eq(conversations.userId, userId));
  const [integrationRow] = await db
    .select({ total: count(userIntegrations.id) })
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), countedIntegration()));
  const allowedToolkits = await getUserAllowedToolkits(userId);

  return toAdminUser(
    user,
    conversationRow?.total ?? 0,
    integrationRow?.total ?? 0,
    allowedToolkits,
  );
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) {
    throw conflict('An account with this email already exists', ErrorCode.EMAIL_ALREADY_EXISTS);
  }

  const [created] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning();

  // Not given means every toolkit, same as ticking every box in the form.
  const allowedToolkits = input.toolkits ?? [...TOOLKIT_SLUGS];
  await setUserToolkitAccess(created.id, allowedToolkits);

  logger.info({ userId: created.id, role: created.role }, 'Admin created a user');
  return toAdminUser(created, 0, 0, allowedToolkits);
}

export async function updateUser(
  actingAdminId: string,
  userId: string,
  input: UpdateUserInput,
): Promise<AdminUser> {
  const user = await requireUser(userId);

  // An admin removing their own admin rights could lock everyone out of this area.
  if (userId === actingAdminId && input.role === 'user') {
    throw badRequest('You cannot remove your own admin role');
  }

  if (input.email && input.email !== user.email) {
    const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) {
      throw conflict('An account with this email already exists', ErrorCode.EMAIL_ALREADY_EXISTS);
    }
  }

  await db
    .update(users)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.password === undefined ? {} : { passwordHash: await hashPassword(input.password) }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  if (input.toolkits !== undefined) {
    await setUserToolkitAccess(userId, input.toolkits);
  }

  logger.info({ userId, actingAdminId }, 'Admin updated a user');
  return getUser(userId);
}

export async function deleteUser(actingAdminId: string, userId: string): Promise<void> {
  if (userId === actingAdminId) {
    throw badRequest('You cannot delete your own account');
  }

  await requireUser(userId);
  // Conversations, messages and integration rows cascade with the user.
  await db.delete(users).where(eq(users.id, userId));
  logger.info({ userId, actingAdminId }, 'Admin deleted a user');
}

const RECENT_WINDOW_DAYS = 7;

/** Aggregate counts for the dashboard overview. Read only, no user data leaves here. */
export async function getStats(): Promise<AdminStats> {
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [[totalUsers], [adminUsers], [recentUsers]] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(users).where(eq(users.role, 'admin')),
    db.select({ total: count() }).from(users).where(gte(users.createdAt, since)),
  ]);

  const [[totalConversations], [totalMessages], [toolCalls]] = await Promise.all([
    db.select({ total: count() }).from(conversations),
    db.select({ total: count() }).from(messages),
    db.select({ total: count() }).from(messages).where(eq(messages.role, 'tool')),
  ]);

  const toolkitUsage = (await listIntegrationSettings())
    .filter((setting) => setting.connectedUsers > 0)
    .sort((a, b) => b.connectedUsers - a.connectedUsers)
    .map((setting) => ({
      toolkit: setting.slug,
      name: setting.name,
      enabled: setting.enabled,
      connectedUsers: setting.connectedUsers,
    }));

  return {
    totalUsers: totalUsers?.total ?? 0,
    adminUsers: adminUsers?.total ?? 0,
    newUsersLast7Days: recentUsers?.total ?? 0,
    totalConversations: totalConversations?.total ?? 0,
    totalMessages: totalMessages?.total ?? 0,
    toolCalls: toolCalls?.total ?? 0,
    connectedIntegrations: toolkitUsage.reduce((sum, usage) => sum + usage.connectedUsers, 0),
    toolkitUsage,
  };
}
