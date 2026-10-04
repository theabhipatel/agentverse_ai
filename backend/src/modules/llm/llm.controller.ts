import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import type {
  ChatInput,
  EmbeddingInput,
  PreviewVoiceInput,
  SttInput,
  TtsInput,
  VoiceInput,
} from './llm.schema.js';
import * as llmService from './llm.service.js';
import { llmWarnings } from './llm.state.js';

/** Every signed in user: names of what is not configured, never key material. */
export const status: RequestHandler = (_req, res) => {
  sendSuccess(res, { warnings: llmWarnings() });
};

export const getSettings: RequestHandler = (_req, res) => {
  sendSuccess(res, { settings: llmService.getLlmSettingsView() });
};

export const saveChat: RequestHandler<ParamsDictionary, unknown, ChatInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  sendSuccess(res, { settings: await llmService.saveChat(actingAdminId, req.body) });
};

export const saveVoice: RequestHandler<ParamsDictionary, unknown, VoiceInput> = async (
  req,
  res,
) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  sendSuccess(res, { settings: await llmService.saveVoice(actingAdminId, req.body) });
};

export const saveStt: RequestHandler<ParamsDictionary, unknown, SttInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  sendSuccess(res, { settings: await llmService.saveStt(actingAdminId, req.body) });
};

export const saveTts: RequestHandler<ParamsDictionary, unknown, TtsInput> = async (req, res) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  sendSuccess(res, { settings: await llmService.saveTts(actingAdminId, req.body) });
};

export const saveEmbedding: RequestHandler<ParamsDictionary, unknown, EmbeddingInput> = async (
  req,
  res,
) => {
  const { id: actingAdminId } = getAuthenticatedUser(req);
  sendSuccess(res, { settings: await llmService.saveEmbedding(actingAdminId, req.body) });
};

/** Tries what the admin is looking at, saved or not, and writes nothing. */
export const testChat: RequestHandler<ParamsDictionary, unknown, ChatInput> = async (req, res) => {
  await llmService.checkChat(req.body);
  sendSuccess(res, { ok: true });
};

export const testVoice: RequestHandler<ParamsDictionary, unknown, VoiceInput> = async (
  req,
  res,
) => {
  await llmService.checkVoice(req.body);
  sendSuccess(res, { ok: true });
};

export const testStt: RequestHandler<ParamsDictionary, unknown, SttInput> = async (req, res) => {
  await llmService.checkStt(req.body);
  sendSuccess(res, { ok: true });
};

export const testTts: RequestHandler<ParamsDictionary, unknown, TtsInput> = async (req, res) => {
  await llmService.checkTts(req.body);
  sendSuccess(res, { ok: true });
};

export const testEmbedding: RequestHandler<ParamsDictionary, unknown, EmbeddingInput> = async (
  req,
  res,
) => {
  await llmService.checkEmbedding(req.body);
  sendSuccess(res, { ok: true });
};

export const listTtsVoices: RequestHandler = async (_req, res) => {
  const voices = await llmService.listTtsVoices();
  sendSuccess(res, { voices });
};

/** Streams raw PCM at voice.tts.ts's SPEECH_SAMPLE_RATE, same as a chat reply's audio. */
export const previewTtsVoice: RequestHandler<ParamsDictionary, unknown, PreviewVoiceInput> = async (
  req,
  res,
) => {
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      abort.abort();
    }
  });

  res.status(200).set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });

  await llmService.previewTtsVoice(
    req.body.voice,
    (pcm) => {
      if (!res.writableEnded && !abort.signal.aborted) {
        res.write(pcm);
      }
    },
    abort.signal,
  );
  res.end();
};
