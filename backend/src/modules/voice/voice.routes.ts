import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as voiceController from './voice.controller.js';
import { voiceTurnParamsSchema, voiceTurnSchema } from './voice.schema.js';

export const voiceRouter = Router();

voiceRouter.use(requireAuth);

voiceRouter.post(
  '/conversations/:id/turn',
  validate({ params: voiceTurnParamsSchema, body: voiceTurnSchema }),
  asyncHandler(voiceController.turn),
);
