import type { UserRole } from '../../db/schema.js';
import type { ToolkitSlug } from '../integration/integration.constants.js';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasPassword: boolean;
  googleLinked: boolean;
  conversationCount: number;
  integrationCount: number;
  /** The toolkits an admin has allowed for this user, regardless of the platform wide switch. */
  allowedToolkits: ToolkitSlug[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolkitUsage {
  toolkit: ToolkitSlug;
  name: string;
  enabled: boolean;
  connectedUsers: number;
}

export interface AdminStats {
  totalUsers: number;
  adminUsers: number;
  newUsersLast7Days: number;
  totalConversations: number;
  totalMessages: number;
  toolCalls: number;
  connectedIntegrations: number;
  toolkitUsage: ToolkitUsage[];
}
