import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as conversationController from './conversation.controller.js';
import {
  conversationIdParamsSchema,
  createConversationSchema,
  createMessageSchema,
} from './conversation.schema.js';

export const conversationRouter = Router();

// Nothing here is reachable without a valid access token.
conversationRouter.use(requireAuth);

conversationRouter.post(
  '/',
  validate({ body: createConversationSchema }),
  asyncHandler(conversationController.create),
);
conversationRouter.get('/', asyncHandler(conversationController.list));
conversationRouter.get(
  '/:id',
  validate({ params: conversationIdParamsSchema }),
  asyncHandler(conversationController.getById),
);
conversationRouter.delete(
  '/:id',
  validate({ params: conversationIdParamsSchema }),
  asyncHandler(conversationController.remove),
);
conversationRouter.get(
  '/:id/messages',
  validate({ params: conversationIdParamsSchema }),
  asyncHandler(conversationController.listMessages),
);
conversationRouter.post(
  '/:id/messages',
  validate({ params: conversationIdParamsSchema, body: createMessageSchema }),
  asyncHandler(conversationController.createMessage),
);
