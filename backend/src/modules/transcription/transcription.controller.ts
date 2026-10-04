import type { RequestHandler } from 'express';
import { badRequest } from '../../common/errors/index.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import * as transcriptionService from './transcription.service.js';

export const transcribe: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    throw badRequest('Send the recording as a raw audio body');
  }

  const text = await transcriptionService.transcribeAudio(req.body, req.headers['content-type'] ?? '');
  sendSuccess(res, { text });
};
