import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import { config } from '../../config/env.js';
import { logger } from '../../common/logger/index.js';
import type { ToolkitSlug } from './integration.constants.js';
import * as integrationService from './integration.service.js';

interface ToolkitParams extends ParamsDictionary {
  toolkit: ToolkitSlug;
}

export const list: RequestHandler = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const integrations = await integrationService.listIntegrations(userId);
  sendSuccess(res, { integrations });
};

export const connect: RequestHandler<ToolkitParams> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const result = await integrationService.connectIntegration(userId, req.params.toolkit);
  sendSuccess(res, result);
};

export const disconnect: RequestHandler<ToolkitParams> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  await integrationService.disconnectIntegration(userId, req.params.toolkit);
  sendSuccess(res, { disconnected: true });
};

/**
 * Public: Composio redirects the browser here after the user approves access.
 * The connected account carries no user id, so nothing is trusted from the query
 * string. The integrations page reloads and listIntegrations reconciles with Composio.
 */
export const callback: RequestHandler = async (req, res) => {
  logger.info({ requestId: req.requestId }, 'Composio callback received');
  res.redirect(`${config.app.clientUrl}/integrations`);
};
