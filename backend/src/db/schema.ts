import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/**
 * Length of every stored embedding. Changing it, or the embedding model, means
 * re-processing every Intelligence Hub document: vectors from different models
 * cannot be compared with each other.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Null for accounts created through Google only.
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  googleId: text('google_id').unique(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    // Same value as the refresh token's jti claim.
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('refresh_tokens_user_id_idx').on(table.userId)],
);

/** Single use, short lived, and stored as a hash so a leaked row cannot be replayed. */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_reset_tokens_user_id_idx').on(table.userId)],
);

/** 'all' includes accounts created later. 'selected' is exactly the users in agent_users. */
export const agentAudienceEnum = pgEnum('agent_audience', ['all', 'selected']);

/**
 * Agents are shared and managed by admins only. The two built in agents carry a
 * template key; they were created once by migration 0009, are always visible to
 * every user and cannot be deleted. The default one is where new chats start and
 * where chats go when their agent is deleted or a user loses access to it.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    description: text('description').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    // Answers knowledge questions only from the admin managed Intelligence Hub.
    usesIntelligenceHub: boolean('uses_intelligence_hub').notNull().default(false),
    // Off means the agent gets no integration tools at all.
    usesIntegrations: boolean('uses_integrations').notNull().default(true),
    // 'chief_of_staff' or 'ai_coach' for the built in agents, null for ones an admin creates.
    template: text('template'),
    enabled: boolean('enabled').notNull().default(true),
    audience: agentAudienceEnum('audience').notNull().default('all'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A partial unique index is what makes "one default agent" a guarantee rather than a hope.
    uniqueIndex('agents_one_default_idx')
      .on(table.isDefault)
      .where(sql`${table.isDefault}`),
    uniqueIndex('agents_template_idx').on(table.template),
  ],
);

/** Who can see an agent whose audience is 'selected'. Unused for 'all'. */
export const agentUsers = pgTable(
  'agent_users',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.userId] }),
    index('agent_users_user_id_idx').on(table.userId),
  ],
);

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'tool']);

/** A document an assistant reply drew on. The title is a snapshot, so it survives the document. */
export interface MessageSource {
  documentId: string;
  title: string;
}

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Restrict, not cascade: deleting an agent moves its chats to the default agent first.
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conversations_user_id_updated_at_idx').on(table.userId, table.updatedAt),
    index('conversations_agent_id_idx').on(table.agentId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources').$type<MessageSource[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
  ],
);

export const integrationStatusEnum = pgEnum('integration_status', [
  'pending',
  'connected',
  'failed',
]);

/**
 * Application level status only. Composio holds the third party credentials,
 * we never store a vendor token.
 */
export const userIntegrations = pgTable(
  'user_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toolkit: text('toolkit').notNull(),
    connectedAccountId: text('connected_account_id'),
    status: integrationStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('user_integrations_user_toolkit_unique').on(table.userId, table.toolkit)],
);

/**
 * Platform wide on/off switch per toolkit, set by admins. A toolkit with no row
 * is enabled, so every supported toolkit starts on without a seed. Turning one
 * off never touches user_integrations, which is what lets it come back on
 * without anyone reconnecting.
 */
export const integrationSettings = pgTable('integration_settings', {
  toolkit: text('toolkit').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A toolkit an admin has switched off for one user, set on Admin > Users. Same
 * "no row = on" idiom as integration_settings: a user with no rows here is
 * allowed every toolkit, so a fresh user needs no rows seeded for it.
 */
export const userDisabledToolkits = pgTable(
  'user_disabled_toolkits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toolkit: text('toolkit').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.toolkit] })],
);

/**
 * A single platform wide flag, set by admins. Same "no row = on" idiom as
 * integration_settings, keyed by a fixed name so a new flag never needs a
 * migration. The first key is 'signup', the on/off switch for self registration.
 */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One API key per provider, set by an admin. The key is only ever stored
 * encrypted (AES-256-GCM, see common/crypto); last6 is what the admin sees.
 * A provider with no row simply has no key yet.
 */
export const llmProviders = pgTable('llm_providers', {
  provider: text('provider').primaryKey(),
  apiKeyCipher: text('api_key_cipher').notNull(),
  apiKeyLast6: text('api_key_last6').notNull(),
  baseUrl: text('base_url').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which provider and model each purpose runs on. Exactly one row, id 'global',
 * created by the first boot from the env seed.
 */
export const llmSettings = pgTable('llm_settings', {
  id: text('id').primaryKey().default('global'),
  chatProvider: text('chat_provider').notNull(),
  chatModel: text('chat_model').notNull(),
  // Null means voice runs on the chat provider and model, with reasoning off.
  voiceProvider: text('voice_provider'),
  voiceModel: text('voice_model'),
  sttProvider: text('stt_provider').notNull().default('groq'),
  sttModel: text('stt_model').notNull(),
  ttsProvider: text('tts_provider').notNull().default('minimax'),
  ttsModel: text('tts_model').notNull(),
  ttsVoice: text('tts_voice').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeSourceTypeEnum = pgEnum('knowledge_source_type', ['file', 'url']);
export const knowledgeStatusEnum = pgEnum('knowledge_status', ['processing', 'ready', 'failed']);

/**
 * One Intelligence Hub entry, managed by admins only. A file's bytes live in
 * object storage under storage_key. Only its text chunks live in the database.
 */
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceType: knowledgeSourceTypeEnum('source_type').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  storageKey: text('storage_key'),
  url: text('url'),
  status: knowledgeStatusEnum('status').notNull().default('processing'),
  error: text('error'),
  chunkCount: integer('chunk_count').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (table) => [
    index('knowledge_chunks_document_id_idx').on(table.documentId),
    index('knowledge_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type AgentAudience = (typeof agentAudienceEnum.enumValues)[number];
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MessageRole = (typeof messageRoleEnum.enumValues)[number];
export type UserIntegrationRow = typeof userIntegrations.$inferSelect;
export type UserDisabledToolkitRow = typeof userDisabledToolkits.$inferSelect;
export type IntegrationStatus = (typeof integrationStatusEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type LlmProviderRow = typeof llmProviders.$inferSelect;
export type LlmSettingsRow = typeof llmSettings.$inferSelect;
export type KnowledgeDocumentRow = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeStatus = (typeof knowledgeStatusEnum.enumValues)[number];
export type KnowledgeSourceType = (typeof knowledgeSourceTypeEnum.enumValues)[number];
