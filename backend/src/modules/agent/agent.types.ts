import type { AgentAudience } from '../../db/schema.js';

/** What a user sees of an agent. The system prompt and who else can see it stay server side. */
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  isDefault: boolean;
  /** False while an admin has this agent switched off for everyone. */
  enabled: boolean;
  createdAt: Date;
}

/** Just enough to label a conversation with the agent it belongs to. */
export interface AgentSummary {
  id: string;
  name: string;
  emoji: string;
  enabled: boolean;
}

export interface AdminAgentUser {
  id: string;
  name: string;
  email: string;
}

/** Everything an admin manages on one agent. */
export interface AdminAgent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  isDefault: boolean;
  /** Chief of Staff or AI Coach: always visible to every user, and never deleted. */
  isBuiltIn: boolean;
  enabled: boolean;
  usesIntelligenceHub: boolean;
  usesIntegrations: boolean;
  audience: AgentAudience;
  /** Who can see it when the audience is 'selected'. Empty for 'all'. */
  users: AdminAgentUser[];
  createdAt: Date;
  updatedAt: Date;
}

/** What a turn needs to know about the agent it runs as. */
export interface AgentPersona {
  name: string;
  systemPrompt: string;
  usesIntelligenceHub: boolean;
  usesIntegrations: boolean;
}
