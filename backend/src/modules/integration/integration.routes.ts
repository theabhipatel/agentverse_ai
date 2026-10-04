import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as integrationController from './integration.controller.js';
import { toolkitParamsSchema } from './integration.schema.js';

export const integrationRouter = Router();

// Composio redirects a browser here, so this one route cannot require a token.
integrationRouter.get('/callback', asyncHandler(integrationController.callback));

integrationRouter.use(requireAuth);

integrationRouter.get('/', asyncHandler(integrationController.list));
integrationRouter.post(
  '/:toolkit/connect',
  validate({ params: toolkitParamsSchema }),
  asyncHandler(integrationController.connect),
);
integrationRouter.delete(
  '/:toolkit',
  validate({ params: toolkitParamsSchema }),
  asyncHandler(integrationController.disconnect),
);
