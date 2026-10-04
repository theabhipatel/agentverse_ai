import { AppError, ErrorCode } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { authHeaders } from '../llm/llm.constants.js';
import { getTtsRuntime, requireRuntime } from '../llm/llm.state.js';
import type { SpeechRuntime } from '../llm/llm.types.js';

/** MiniMax is asked for raw 16 bit mono PCM at this rate. The browser player is built for it. */
export const SPEECH_SAMPLE_RATE = 24000;

/** A piece of a reply is a few sentences. A request still open after this has hung. */
const SPEECH_TIMEOUT_MS = 20000;

interface SpeechEvent {
  data?: { audio?: string; status?: number } | null;
  base_resp?: { status_code?: number; status_msg?: string };
}

/**
 * Status 1 events carry the next slice of audio. The closing status 2 event
 * repeats the whole clip, so it is skipped or everything would play twice.
 */
function audioFrom(event: string): Buffer | null {
  const json = event.replace(/^data:\s*/, '').trim();
  if (!json) {
    return null;
  }

  const parsed = JSON.parse(json) as SpeechEvent;
  const statusCode = parsed.base_resp?.status_code ?? 0;
  if (statusCode !== 0) {
    logger.error(
      { statusCode, statusMsg: parsed.base_resp?.status_msg },
      'Speech provider rejected the request',
    );
    throw new AppError(502, ErrorCode.SERVICE_UNAVAILABLE, 'Could not generate speech');
  }

  const audio = parsed.data?.audio;
  return parsed.data?.status === 1 && audio ? Buffer.from(audio, 'hex') : null;
}

/**
 * Streams one piece of text as speech, handing each PCM chunk on as soon as it
 * arrives. `voiceOverride` lets a caller try a voice that is not the saved one,
 * which is how the admin voice library previews a voice before it is selected.
 */
export async function streamSpeech(
  text: string,
  onAudio: (pcm: Buffer) => void,
  signal: AbortSignal,
  voiceOverride?: string,
): Promise<void> {
  const saved = requireRuntime<SpeechRuntime>(getTtsRuntime(), 'Text to speech');
  const tts = voiceOverride ? { ...saved, voice: voiceOverride } : saved;
  const request =
    tts.provider === 'elevenlabs' ? elevenLabsRequest(tts, text) : miniMaxRequest(tts, text);

  const response = await fetch(request.url, {
    method: 'POST',
    headers: { ...authHeaders(tts.provider, tts.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(SPEECH_TIMEOUT_MS)]),
  });

  if (!response.ok || !response.body) {
    // The provider echoes the key in some error payloads, so the body is logged, never returned.
    logger.error(
      {
        provider: tts.provider,
        status: response.status,
        body: await response.text().catch(() => ''),
      },
      'Speech request failed',
    );
    throw new AppError(502, ErrorCode.SERVICE_UNAVAILABLE, 'Could not generate speech');
  }

  // ElevenLabs streams the PCM itself. MiniMax wraps it in server sent events.
  if (tts.provider === 'elevenlabs') {
    await readRawAudio(response.body, onAudio);
    return;
  }
  await readEventAudio(response.body, onAudio);
}

function miniMaxRequest(tts: SpeechRuntime, text: string): { url: string; body: unknown } {
  return {
    url: `${tts.baseUrl}/t2a_v2`,
    body: {
      model: tts.model,
      text,
      stream: true,
      output_format: 'hex',
      voice_setting: { voice_id: tts.voice, speed: 1, vol: 1, pitch: 0 },
      audio_setting: {
        sample_rate: SPEECH_SAMPLE_RATE,
        bitrate: 128000,
        format: 'pcm',
        channel: 1,
      },
    },
  };
}

/** The voice is part of the address, and pcm_24000 is what the browser player expects. */
export function elevenLabsRequest(
  tts: SpeechRuntime,
  text: string,
): { url: string; body: unknown } {
  return {
    url: `${tts.baseUrl}/text-to-speech/${encodeURIComponent(tts.voice)}/stream?output_format=pcm_${SPEECH_SAMPLE_RATE}`,
    body: { text, model_id: tts.model },
  };
}

async function readRawAudio(
  body: ReadableStream<Uint8Array>,
  onAudio: (pcm: Buffer) => void,
): Promise<void> {
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    if (value.length > 0) {
      onAudio(Buffer.from(value));
    }
  }
}

async function readEventAudio(
  body: ReadableStream<Uint8Array>,
  onAudio: (pcm: Buffer) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const events = pending.split('\n\n');
    pending = events.pop() ?? '';
    for (const event of events) {
      const pcm = audioFrom(event);
      if (pcm) {
        onAudio(pcm);
      }
    }
  }

  const last = audioFrom(pending);
  if (last) {
    onAudio(last);
  }
}
