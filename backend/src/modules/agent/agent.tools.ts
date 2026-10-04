import type { StructuredToolInterface } from '@langchain/core/tools';
import { logger } from '../../common/logger/index.js';
import { composio } from '../integration/composio.client.js';
import { toolSlugsFor, type ToolkitSlug } from '../integration/integration.constants.js';

/**
 * Loads the Composio tools for exactly the toolkits this user has connected,
 * always executed as this user. A user can never reach another user's account
 * because the Composio user id is our internal user id.
 */
export async function loadToolsForUser(
  userId: string,
  connectedToolkits: ToolkitSlug[],
): Promise<StructuredToolInterface[]> {
  if (connectedToolkits.length === 0) {
    return [];
  }

  const slugs = toolSlugsFor(connectedToolkits);

  try {
    const tools = (await composio.tools.get(userId, { tools: slugs })) as StructuredToolInterface[];
    logger.info({ userId, toolkits: connectedToolkits, toolCount: tools.length }, 'Composio tools loaded');
    return tools;
  } catch (error) {
    logger.error({ err: error, userId, toolkits: connectedToolkits }, 'Could not load Composio tools');
    return [];
  }
}
