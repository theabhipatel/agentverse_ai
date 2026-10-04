import type { IntegrationStatus } from '../../db/schema.js';
import type { ToolkitSlug } from './integration.constants.js';

export interface IntegrationView {
  slug: ToolkitSlug;
  name: string;
  description: string;
  status: IntegrationStatus | 'not_connected';
  connected: boolean;
}

/** The admin view of one toolkit: its platform wide switch and how widely it is used. */
export interface IntegrationSettingView {
  slug: ToolkitSlug;
  name: string;
  description: string;
  enabled: boolean;
  connectedUsers: number;
}

export interface ConnectResult {
  redirectUrl: string;
  connectionRequestId: string;
}
