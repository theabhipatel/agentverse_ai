import type { AgentRow, ConversationRow, MessageRole, MessageSource } from '../../db/schema.js';
import type { AgentHistoryMessage } from '../agent/agent.service.js';
import type { AgentSummary } from '../agent/agent.types.js';

export interface Conversation {
  id: string;
  title: string;
  agent: AgentSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Intelligence Hub documents the reply cited. Empty for everything else. */
  sources: MessageSource[];
  createdAt: Date;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

/** A user turn plus everything the agent produced: tool results then the answer. */
export interface SendMessageResult {
  userMessage: Message;
  replies: Message[];
  conversation: Conversation;
}

/** A turn whose user message is stored and checked, waiting for the agent. */
export interface TurnStart {
  userId: string;
  conversation: ConversationRow;
  agent: AgentRow;
  history: AgentHistoryMessage[];
  content: string;
  userMessage: Message;
}
