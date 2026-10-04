import { Router } from 'express';
import { requireAdmin } from '../../common/middleware/requireAdmin.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as llmController from './llm.controller.js';
import {
  chatSchema,
  embeddingSchema,
  previewVoiceSchema,
  sttSchema,
  ttsSchema,
  voiceSchema,
} from './llm.schema.js';

/** What every signed in user may know: which features are unavailable. */
export const llmRouter = Router();
llmRouter.use(requireAuth);
llmRouter.get('/status', llmController.status);

export const llmAdminRouter = Router();
llmAdminRouter.use(requireAuth, requireAdmin);

llmAdminRouter.get('/', llmController.getSettings);
llmAdminRouter.put('/chat', validate({ body: chatSchema }), asyncHandler(llmController.saveChat));
llmAdminRouter.put(
  '/voice',
  validate({ body: voiceSchema }),
  asyncHandler(llmController.saveVoice),
);
llmAdminRouter.put('/stt', validate({ body: sttSchema }), asyncHandler(llmController.saveStt));
llmAdminRouter.put('/tts', validate({ body: ttsSchema }), asyncHandler(llmController.saveTts));
llmAdminRouter.put(
  '/embedding',
  validate({ body: embeddingSchema }),
  asyncHandler(llmController.saveEmbedding),
);
// Each test takes the same body as its save, so the button tries what is on screen.
llmAdminRouter.post(
  '/test/chat',
  validate({ body: chatSchema }),
  asyncHandler(llmController.testChat),
);
llmAdminRouter.post(
  '/test/voice',
  validate({ body: voiceSchema }),
  asyncHandler(llmController.testVoice),
);
llmAdminRouter.post(
  '/test/stt',
  validate({ body: sttSchema }),
  asyncHandler(llmController.testStt),
);
llmAdminRouter.post(
  '/test/tts',
  validate({ body: ttsSchema }),
  asyncHandler(llmController.testTts),
);
llmAdminRouter.post(
  '/test/embedding',
  validate({ body: embeddingSchema }),
  asyncHandler(llmController.testEmbedding),
);
llmAdminRouter.get('/tts/voices', asyncHandler(llmController.listTtsVoices));
llmAdminRouter.post(
  '/tts/preview',
  validate({ body: previewVoiceSchema }),
  asyncHandler(llmController.previewTtsVoice),
);
