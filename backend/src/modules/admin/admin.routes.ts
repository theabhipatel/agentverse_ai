import { Router } from 'express';
import { requireAdmin } from '../../common/middleware/requireAdmin.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { agentFormSchema, agentIdParamsSchema } from '../agent/agent.schema.js';
import { toolkitParamsSchema } from '../integration/integration.schema.js';
import * as adminController from './admin.controller.js';
import {
  createUserSchema,
  integrationSwitchSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './admin.schema.js';

export const adminRouter = Router();

// Authenticated first, then role checked. Every route below is admin only.
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', asyncHandler(adminController.getStats));
adminRouter.get('/users', asyncHandler(adminController.listUsers));
adminRouter.post(
  '/users',
  validate({ body: createUserSchema }),
  asyncHandler(adminController.createUser),
);
adminRouter.get(
  '/users/:id',
  validate({ params: userIdParamsSchema }),
  asyncHandler(adminController.getUser),
);
adminRouter.patch(
  '/users/:id',
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  asyncHandler(adminController.updateUser),
);
adminRouter.delete(
  '/users/:id',
  validate({ params: userIdParamsSchema }),
  asyncHandler(adminController.deleteUser),
);
adminRouter.get('/agents', asyncHandler(adminController.listAgents));
adminRouter.post('/agents', validate({ body: agentFormSchema }), asyncHandler(adminController.createAgent));
adminRouter.put(
  '/agents/:id',
  validate({ params: agentIdParamsSchema, body: agentFormSchema }),
  asyncHandler(adminController.updateAgent),
);
adminRouter.patch(
  '/agents/:id',
  validate({ params: agentIdParamsSchema, body: integrationSwitchSchema }),
  asyncHandler(adminController.setAgentEnabled),
);
adminRouter.delete(
  '/agents/:id',
  validate({ params: agentIdParamsSchema }),
  asyncHandler(adminController.deleteAgent),
);
adminRouter.get('/integrations', asyncHandler(adminController.listIntegrations));
adminRouter.patch(
  '/integrations/:toolkit',
  validate({ params: toolkitParamsSchema, body: integrationSwitchSchema }),
  asyncHandler(adminController.setIntegrationEnabled),
);
adminRouter.get('/settings/signup', asyncHandler(adminController.getSignupSetting));
adminRouter.patch(
  '/settings/signup',
  validate({ body: integrationSwitchSchema }),
  asyncHandler(adminController.setSignupSetting),
);
