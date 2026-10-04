import { badRequest, AppError, ErrorCode } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { authHeaders } from '../llm/llm.constants.js';
import { getSttRuntime, requireRuntime } from '../llm/llm.state.js';
import type { ModelRuntime } from '../llm/llm.types.js';

/** Groq rejects anything larger, and the route caps the body at the same size. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Whisper picks the decoder from the file extension, so the container has to be named. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

function fileNameFor(mimeType: string): string {
  const container = mimeType.split(';')[0].trim().toLowerCase();
  const extension = EXTENSION_BY_MIME[container];
  if (!extension) {
    throw badRequest(`Unsupported audio format: ${container}`);
  }
  return `speech.${extension}`;
}

/*
 * People speak English here, and sometimes Hindi, which Whisper writes in
 * Devanagari. No prompt is sent to steer it: tried on 2026-09-11, any prompt made
 * Whisper sure of the words it invents over silence ("Thank you."), so they could
 * no longer be told apart and dropped.
 */

/** Whisper's own line for "this part was probably silence", above which its words are made up. */
const NO_SPEECH_THRESHOLD = 0.6;

/** A letter from any script but Latin (English) and Devanagari (Hindi). */
const FOREIGN_LETTER = /(?=\p{L})[^\p{Script=Latin}\p{Script=Devanagari}]/u;

interface TranscriptSegment {
  text: string;
  no_speech_prob: number;
}

/** Languages spoken Hindi gets mistaken for. Urdu above all: spoken, the two are almost the same. */
const SOUNDS_LIKE_HINDI = new Set(['urdu', 'ur', 'punjabi', 'pa', 'nepali', 'ne', 'marathi', 'mr']);

/**
 * What to transcribe again as, when Whisper hears a language other than English
 * or Hindi. A near neighbour of Hindi means Hindi, and anything else was most
 * likely English, the main language.
 */
function correctedLanguage(detected: string): 'en' | 'hi' | null {
  const language = detected.toLowerCase();
  if (['english', 'en', 'hindi', 'hi'].includes(language)) {
    return null;
  }
  return SOUNDS_LIKE_HINDI.has(language) ? 'hi' : 'en';
}

/** Whisper, wherever it runs, reports segments and the language it heard. */
function detailedFormat(model: string): boolean {
  return /whisper/i.test(model);
}

async function requestTranscript(
  stt: ModelRuntime,
  audio: Buffer,
  mimeType: string,
  language?: 'en' | 'hi',
): Promise<{ text: string; language: string }> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), fileNameFor(mimeType));
  form.append('model', stt.model);
  // The detailed format says which language was heard, and how sure it is of each part.
  // Only the Whisper models take it: OpenAI's gpt-4o transcribers answer 400 for it.
  form.append('response_format', detailedFormat(stt.model) ? 'verbose_json' : 'json');
  if (language) {
    form.append('language', language);
  }

  const response = await fetch(`${stt.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(stt.provider, stt.apiKey),
    body: form,
  });

  if (!response.ok) {
    // The provider echoes the key in some error payloads, so the body is logged, never returned.
    logger.error(
      { status: response.status, body: await response.text().catch(() => '') },
      'Transcription request failed',
    );
    throw new AppError(502, ErrorCode.SERVICE_UNAVAILABLE, 'Could not transcribe the recording');
  }

  const payload = (await response.json()) as { text?: unknown; language?: unknown; segments?: unknown };
  return {
    text: Array.isArray(payload.segments)
      ? keptText(payload.segments as TranscriptSegment[])
      : typeof payload.text === 'string'
        ? payload.text.trim()
        : '',
    language: typeof payload.language === 'string' ? payload.language : '',
  };
}

/**
 * The transcript without the parts Whisper made up: words over silence (the
 * classic stray "you" or "Thank you") and anything in a script other than
 * English or Hindi, such as a burst of Japanese over background noise.
 */
function keptText(segments: TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.no_speech_prob <= NO_SPEECH_THRESHOLD && !FOREIGN_LETTER.test(segment.text))
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ');
}

/** Transcribes speech as English or Hindi, and never as any other language. */
export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
  const stt = requireRuntime<ModelRuntime>(getSttRuntime(), 'Voice input');
  if (audio.length === 0) {
    throw badRequest('No audio was received');
  }

  const heard = await requestTranscript(stt, audio, mimeType);
  const language = correctedLanguage(heard.language);
  if (!heard.text || !language) {
    return heard.text;
  }
  logger.info({ detected: heard.language, retriedAs: language }, 'Transcribing again in English or Hindi');
  return (await requestTranscript(stt, audio, mimeType, language)).text;
}
