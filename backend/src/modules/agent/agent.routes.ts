import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as agentController from './agent.controller.js';

export const agentRouter = Router();

agentRouter.use(requireAuth);

agentRouter.get('/', asyncHandler(agentController.list));
