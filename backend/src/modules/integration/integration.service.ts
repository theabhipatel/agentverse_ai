import { and, count, eq, inArray } from 'drizzle-orm';
import { badRequest, notFound } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { config } from '../../config/env.js';
import { db } from '../../db/index.js';
import {
  integrationSettings,
  userDisabledToolkits,
  userIntegrations,
  type IntegrationStatus,
} from '../../db/schema.js';
import { composio } from './composio.client.js';
import {
  SUPPORTED_TOOLKITS,
  TOOLKIT_SLUGS,
  getToolkit,
  isSupportedToolkit,
  type ToolkitSlug,
} from './integration.constants.js';
import type {
  ConnectResult,
  IntegrationSettingView,
  IntegrationView,
} from './integration.types.js';

/** Composio reports this once the OAuth handshake has actually completed. */
const ACTIVE_STATUS = 'ACTIVE';

async function upsertStatus(
  userId: string,
  toolkit: ToolkitSlug,
  status: IntegrationStatus,
  connectedAccountId: string | null,
): Promise<void> {
  await db
    .insert(userIntegrations)
    .values({ userId, toolkit, status, connectedAccountId })
    .onConflictDoUpdate({
      target: [userIntegrations.userId, userIntegrations.toolkit],
      set: { status, connectedAccountId, updatedAt: new Date() },
    });
}

/**
 * Composio owns the truth about whether an account is really connected, so the
 * local rows are refreshed from it rather than trusted on their own.
 */
async function syncFromComposio(userId: string): Promise<Map<ToolkitSlug, string>> {
  const active = new Map<ToolkitSlug, string>();

  try {
    const accounts = await composio.connectedAccounts.list({ userIds: [userId] });
    for (const account of accounts.items ?? []) {
      const slug = account.toolkit?.slug;
      // An account for a toolkit we no longer offer must never reach the agent.
      if (!slug || !isSupportedToolkit(slug) || account.status !== ACTIVE_STATUS) {
        continue;
      }
      active.set(slug, account.id);
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Could not read connected accounts from Composio');
    return active;
  }

  const rows = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, userId));

  for (const [slug, connectedAccountId] of active) {
    const row = rows.find((item) => item.toolkit === slug);
    if (row?.status !== 'connected' || row.connectedAccountId !== connectedAccountId) {
      await upsertStatus(userId, slug, 'connected', connectedAccountId);
    }
  }

  // A row we think is connected but Composio no longer reports is stale.
  for (const row of rows) {
    if (row.status === 'connected' && !active.has(row.toolkit as ToolkitSlug)) {
      await db
        .update(userIntegrations)
        .set({ status: 'pending', connectedAccountId: null, updatedAt: new Date() })
        .where(eq(userIntegrations.id, row.id));
    }
  }

  return active;
}

// ---------- Admin on/off switch ----------

async function getDisabledToolkits(): Promise<Set<string>> {
  const rows = await db
    .select({ toolkit: integrationSettings.toolkit })
    .from(integrationSettings)
    .where(eq(integrationSettings.enabled, false));
  return new Set(rows.map((row) => row.toolkit));
}

/** Toolkits switched on platform wide. A per-user allow list narrows this further, see getAllowedToolkits. */
async function getEnabledToolkits(): Promise<ToolkitSlug[]> {
  const disabled = await getDisabledToolkits();
  return TOOLKIT_SLUGS.filter((slug) => !disabled.has(slug));
}

async function getUserDisabledToolkits(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ toolkit: userDisabledToolkits.toolkit })
    .from(userDisabledToolkits)
    .where(eq(userDisabledToolkits.userId, userId));
  return new Set(rows.map((row) => row.toolkit));
}

/** What an admin has individually allowed this user, regardless of the platform switch. Feeds the user form. */
export async function getUserAllowedToolkits(userId: string): Promise<ToolkitSlug[]> {
  const disabled = await getUserDisabledToolkits(userId);
  return TOOLKIT_SLUGS.filter((slug) => !disabled.has(slug));
}

/**
 * Replaces which toolkits an admin has allowed for this user, set on Admin > Users
 * create and edit. A user is never asked which toolkits they get, only an admin is.
 */
export async function setUserToolkitAccess(userId: string, allowed: ToolkitSlug[]): Promise<void> {
  const allowedSet = new Set(allowed);
  const disabled = TOOLKIT_SLUGS.filter((slug) => !allowedSet.has(slug));

  await db.transaction(async (tx) => {
    await tx.delete(userDisabledToolkits).where(eq(userDisabledToolkits.userId, userId));
    if (disabled.length > 0) {
      await tx
        .insert(userDisabledToolkits)
        .values(disabled.map((toolkit) => ({ userId, toolkit })));
    }
  });
}

/** Toolkits this user can see, connect and have the agent use right now: on platform wide, and allowed for them. */
export async function getAllowedToolkits(userId: string): Promise<ToolkitSlug[]> {
  const [enabled, userDisabled] = await Promise.all([
    getEnabledToolkits(),
    getUserDisabledToolkits(userId),
  ]);
  return enabled.filter((slug) => !userDisabled.has(slug));
}

/** Switched off platform wide, or not allowed for this user: either way it is reported as missing. */
async function requireAllowedToolkit(userId: string, toolkit: ToolkitSlug): Promise<void> {
  const allowed = await getAllowedToolkits(userId);
  if (!allowed.includes(toolkit)) {
    throw notFound('This integration is not available');
  }
}

/** Connected users per supported toolkit. Rows for toolkits no longer offered are ignored. */
async function countConnectedUsers(): Promise<Map<string, number>> {
  const rows = await db
    .select({ toolkit: userIntegrations.toolkit, total: count() })
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.status, 'connected'),
        inArray(userIntegrations.toolkit, TOOLKIT_SLUGS),
      ),
    )
    .groupBy(userIntegrations.toolkit);
  return new Map(rows.map((row) => [row.toolkit, row.total]));
}

/** Every supported toolkit with its switch and how many users have it connected. */
export async function listIntegrationSettings(): Promise<IntegrationSettingView[]> {
  const [disabled, connectedUsers] = await Promise.all([
    getDisabledToolkits(),
    countConnectedUsers(),
  ]);

  return SUPPORTED_TOOLKITS.map((toolkit) => ({
    slug: toolkit.slug,
    name: toolkit.name,
    description: toolkit.description,
    enabled: !disabled.has(toolkit.slug),
    connectedUsers: connectedUsers.get(toolkit.slug) ?? 0,
  }));
}

/**
 * Only the switch changes. Users' connections are left alone, so turning a
 * toolkit back on restores it for everyone without reconnecting.
 */
export async function setIntegrationEnabled(
  actingAdminId: string,
  toolkit: ToolkitSlug,
  enabled: boolean,
): Promise<IntegrationSettingView> {
  await db
    .insert(integrationSettings)
    .values({ toolkit, enabled })
    .onConflictDoUpdate({
      target: integrationSettings.toolkit,
      set: { enabled, updatedAt: new Date() },
    });

  logger.info({ toolkit, enabled, actingAdminId }, 'Admin switched an integration');

  const settings = await listIntegrationSettings();
  const updated = settings.find((setting) => setting.slug === toolkit);
  if (!updated) {
    throw new Error(`Unsupported toolkit: ${toolkit}`);
  }
  return updated;
}

// ---------- A user's own integrations ----------

export async function listIntegrations(userId: string): Promise<IntegrationView[]> {
  const [active, allowed] = await Promise.all([
    syncFromComposio(userId),
    getAllowedToolkits(userId),
  ]);
  const rows = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, userId));

  return SUPPORTED_TOOLKITS.filter((toolkit) => allowed.includes(toolkit.slug)).map((toolkit) => {
    const connected = active.has(toolkit.slug);
    const row = rows.find((item) => item.toolkit === toolkit.slug);
    return {
      slug: toolkit.slug,
      name: toolkit.name,
      description: toolkit.description,
      status: connected ? 'connected' : row?.status === 'pending' ? 'pending' : 'not_connected',
      connected,
    };
  });
}

/**
 * Toolkits the current user can actually act on: connected and switched on.
 * Used to scope the agent's tools, so a switched off toolkit is never loaded.
 */
export async function getConnectedToolkits(userId: string): Promise<ToolkitSlug[]> {
  const [active, allowed] = await Promise.all([
    syncFromComposio(userId),
    getAllowedToolkits(userId),
  ]);
  return allowed.filter((slug) => active.has(slug));
}

async function findOrCreateAuthConfig(toolkit: ToolkitSlug): Promise<string> {
  const existing = await composio.authConfigs.list({ toolkit });
  const found = existing.items?.[0];
  if (found) {
    return found.id;
  }

  const created = await composio.authConfigs.create(toolkit, {
    type: 'use_composio_managed_auth',
    name: `agentverse-${toolkit}`,
  });
  logger.info({ toolkit, authConfigId: created.id }, 'Created Composio auth config');
  return created.id;
}

export async function connectIntegration(
  userId: string,
  toolkit: ToolkitSlug,
): Promise<ConnectResult> {
  getToolkit(toolkit);
  await requireAllowedToolkit(userId, toolkit);

  const authConfigId = await findOrCreateAuthConfig(toolkit);
  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
    callbackUrl: config.composio.callbackUrl,
  });

  if (!connectionRequest.redirectUrl) {
    throw badRequest('Composio did not return a connection URL for this integration');
  }

  await upsertStatus(userId, toolkit, 'pending', null);
  logger.info({ userId, toolkit }, 'Integration connection started');

  return { redirectUrl: connectionRequest.redirectUrl, connectionRequestId: connectionRequest.id };
}

export async function disconnectIntegration(userId: string, toolkit: ToolkitSlug): Promise<void> {
  await requireAllowedToolkit(userId, toolkit);

  const [row] = await db
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.toolkit, toolkit)))
    .limit(1);

  if (!row) {
    throw notFound('This integration is not connected');
  }

  if (row.connectedAccountId) {
    try {
      await composio.connectedAccounts.delete(row.connectedAccountId);
    } catch (error) {
      logger.error({ err: error, userId, toolkit }, 'Composio disconnect failed');
    }
  }

  await db.delete(userIntegrations).where(eq(userIntegrations.id, row.id));
  logger.info({ userId, toolkit }, 'Integration disconnected');
}
