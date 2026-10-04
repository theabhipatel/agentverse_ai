import type { RequestHandler } from 'express';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import * as agentService from './agent.service.js';

export const list: RequestHandler = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const agents = await agentService.listAgents(userId);
  sendSuccess(res, { agents });
};
