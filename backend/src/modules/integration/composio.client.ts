import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';
import { config } from '../../config/env.js';

/**
 * One Composio client for the whole app, wired to the LangChain provider so
 * tools come back ready to bind to the model. The API key never leaves the server.
 */
export const composio = new Composio({
  apiKey: config.composio.apiKey,
  provider: new LangchainProvider(),
});
