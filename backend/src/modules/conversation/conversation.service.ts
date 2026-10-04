import { and, asc, desc, eq } from 'drizzle-orm';
import { notFound } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import {
  requireEnabledAgent,
  resolveNewChatAgent,
  runAgentTurn,
  toAgentSummary,
  type AgentTurnInput,
} from '../agent/agent.service.js';
import { db } from '../../db/index.js';
import {
  agents,
  conversations,
  messages,
  type AgentRow,
  type ConversationRow,
  type MessageRow,
  type MessageSource,
} from '../../db/schema.js';
import type { CreateConversationInput } from './conversation.schema.js';
import type {
  Conversation,
  ConversationWithMessages,
  Message,
  SendMessageResult,
  TurnStart,
} from './conversation.types.js';

const DEFAULT_TITLE = 'New chat';
const TITLE_MAX_LENGTH = 60;

function toConversation(row: ConversationRow, agent: Pick<AgentRow, 'id' | 'name' | 'emoji' | 'enabled'>): Conversation {
  return {
    id: row.id,
    title: row.title,
    agent: toAgentSummary(agent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    sources: row.sources ?? [],
    createdAt: row.createdAt,
  };
}

/** Derives a readable title from the first thing the user said. */
function titleFromMessage(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  return flattened.length <= TITLE_MAX_LENGTH
    ? flattened
    : `${flattened.slice(0, TITLE_MAX_LENGTH).trimEnd()}...`;
}

/**
 * Every read of a conversation goes through here. A conversation owned by
 * someone else is reported as missing, never as forbidden.
 */
async function requireOwnedConversation(
  userId: string,
  conversationId: string,
): Promise<{ conversation: ConversationRow; agent: AgentRow }> {
  const [row] = await db
    .select({ conversation: conversations, agent: agents })
    .from(conversations)
    .innerJoin(agents, eq(agents.id, conversations.agentId))
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  if (!row) {
    throw notFound('Conversation not found');
  }
  return row;
}

export async function createConversation(
  userId: string,
  input: CreateConversationInput,
): Promise<Conversation> {
  // Access and the admin switch are checked here, so a chat never starts with an
  // agent this user cannot see or with one that is turned off.
  const agent = await resolveNewChatAgent(userId, input.agentId);

  const [row] = await db
    .insert(conversations)
    .values({ userId, agentId: agent.id, title: input.title ?? DEFAULT_TITLE })
    .returning();

  return toConversation(row, agent);
}

/** Chats with a switched off agent stay listed. They open read only. */
export async function listConversations(userId: string): Promise<Conversation[]> {
  const rows = await db
    .select({
      conversation: conversations,
      agent: { id: agents.id, name: agents.name, emoji: agents.emoji, enabled: agents.enabled },
    })
    .from(conversations)
    .innerJoin(agents, eq(agents.id, conversations.agentId))
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));

  return rows.map((row) => toConversation(row.conversation, row.agent));
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationWithMessages> {
  const { conversation, agent } = await requireOwnedConversation(userId, conversationId);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  return {
    ...toConversation(conversation, agent),
    messages: rows.map(toMessage),
  };
}

export async function listMessages(userId: string, conversationId: string): Promise<Message[]> {
  const { conversation } = await requireOwnedConversation(userId, conversationId);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  return rows.map(toMessage);
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const { conversation } = await requireOwnedConversation(userId, conversationId);
  await db.delete(conversations).where(eq(conversations.id, conversation.id));
}

const AGENT_FAILURE_MESSAGE =
  'I could not reach the agent just now. Your message is saved, please try again in a moment.';

/**
 * The first half of a turn, shared by text and voice: ownership, the admin
 * switch, the history the agent will see, and the stored user message.
 */
export async function startTurn(userId: string, conversationId: string, content: string): Promise<TurnStart> {
  const { conversation, agent } = await requireOwnedConversation(userId, conversationId);
  // Checked before anything is stored, so a refused message leaves no trace.
  requireEnabledAgent(agent);

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, role: 'user', content })
    .returning();

  return {
    userId,
    conversation,
    agent,
    history: history.map((row) => ({ role: row.role, content: row.content })),
    content,
    userMessage: toMessage(userMessage),
  };
}

/** The second half: run the agent, store what it produced, bump the conversation. */
export async function completeTurn(
  turn: TurnStart,
  options: Pick<AgentTurnInput, 'mode' | 'onTextDelta' | 'onToolCall' | 'signal'> = {},
): Promise<SendMessageResult> {
  const { conversation, agent } = turn;

  /**
   * A failed agent turn still gets an assistant row, so a conversation never
   * reloads with a user message that has no reply under it.
   */
  let produced: Array<{ role: 'assistant' | 'tool'; content: string; sources: MessageSource[] | null }>;
  try {
    const messagesFromAgent = await runAgentTurn({
      userId: turn.userId,
      conversationId: conversation.id,
      agent: {
        name: agent.name,
        systemPrompt: agent.systemPrompt,
        usesIntelligenceHub: agent.usesIntelligenceHub,
        usesIntegrations: agent.usesIntegrations,
      },
      history: turn.history,
      userMessage: turn.content,
      ...options,
    });
    produced = messagesFromAgent.map((message) => ({
      role: message.role === 'tool' ? 'tool' : 'assistant',
      content: message.content,
      sources: message.sources?.length ? message.sources : null,
    }));
  } catch (error) {
    if (options.signal?.aborted) {
      // Cancelled before it said or did anything, so the turn is taken back entirely.
      await db.delete(messages).where(eq(messages.id, turn.userMessage.id));
      throw error;
    }
    logger.error({ err: error, userId: turn.userId, conversationId: conversation.id }, 'Agent turn failed');
    produced = [{ role: 'assistant', content: AGENT_FAILURE_MESSAGE, sources: null }];
  }

  const inserted = await db
    .insert(messages)
    .values(produced.map((message) => ({ conversationId: conversation.id, ...message })))
    .returning();

  const shouldTitle = conversation.title === DEFAULT_TITLE;
  const [updated] = await db
    .update(conversations)
    .set({
      updatedAt: new Date(),
      ...(shouldTitle ? { title: titleFromMessage(turn.content) } : {}),
    })
    .where(eq(conversations.id, conversation.id))
    .returning();

  return {
    userMessage: turn.userMessage,
    replies: inserted.map(toMessage),
    conversation: toConversation(updated, agent),
  };
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  return completeTurn(await startTurn(userId, conversationId, content));
}
