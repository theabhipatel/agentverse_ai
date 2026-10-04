import express, { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as transcriptionController from './transcription.controller.js';
import { MAX_AUDIO_BYTES } from './transcription.service.js';

export const transcriptionRouter = Router();

transcriptionRouter.use(requireAuth);

// The recording arrives as a raw body rather than multipart, which keeps the
// upload path to one line and avoids a parser dependency for a single route.
transcriptionRouter.post(
  '/',
  express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }),
  asyncHandler(transcriptionController.transcribe),
);
