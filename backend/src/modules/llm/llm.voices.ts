import { AppError, ErrorCode } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { authHeaders } from './llm.constants.js';
import type { SpeechRuntime } from './llm.types.js';

export interface VoiceOption {
  id: string;
  name: string;
  /** ElevenLabs hands back a ready made sample. MiniMax does not, so this is null there. */
  previewUrl: string | null;
}

const VOICES_TIMEOUT_MS = 15_000;

/**
 * ElevenLabs' voice listing lives on a newer API version than the base url an
 * admin configures for text-to-speech calls, so it is not built from that url.
 */
const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v2/voices?page_size=100';

function failed(provider: string, detail: string): never {
  logger.warn({ provider, detail }, 'Could not list voices');
  throw new AppError(
    502,
    ErrorCode.SERVICE_UNAVAILABLE,
    `Could not fetch the voice list from ${provider}`,
  );
}

export async function listVoices(tts: SpeechRuntime): Promise<VoiceOption[]> {
  return tts.provider === 'elevenlabs' ? listElevenLabsVoices(tts) : listMiniMaxVoices(tts);
}

interface ElevenLabsVoice {
  voice_id: string;
  name?: string;
  preview_url?: string | null;
}

async function listElevenLabsVoices(tts: SpeechRuntime): Promise<VoiceOption[]> {
  const response = await fetch(ELEVENLABS_VOICES_URL, {
    headers: authHeaders(tts.provider, tts.apiKey),
    signal: AbortSignal.timeout(VOICES_TIMEOUT_MS),
  }).catch(() => null);

  if (!response || !response.ok) {
    failed('ElevenLabs', response ? `HTTP ${response.status}` : 'could not reach the provider');
  }

  const body = (await response.json().catch(() => null)) as { voices?: ElevenLabsVoice[] } | null;
  return (body?.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name ?? voice.voice_id,
    previewUrl: voice.preview_url ?? null,
  }));
}

interface MiniMaxVoice {
  voice_id: string;
  voice_name?: string;
}

interface MiniMaxVoiceList {
  system_voice?: MiniMaxVoice[];
  voice_cloning?: MiniMaxVoice[];
  voice_generation?: MiniMaxVoice[];
  base_resp?: { status_code?: number; status_msg?: string };
}

async function listMiniMaxVoices(tts: SpeechRuntime): Promise<VoiceOption[]> {
  const response = await fetch(`${tts.baseUrl}/get_voice`, {
    method: 'POST',
    headers: { ...authHeaders(tts.provider, tts.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_type: 'all' }),
    signal: AbortSignal.timeout(VOICES_TIMEOUT_MS),
  }).catch(() => null);

  if (!response || !response.ok) {
    failed('MiniMax', response ? `HTTP ${response.status}` : 'could not reach the provider');
  }

  const body = (await response.json().catch(() => null)) as MiniMaxVoiceList | null;
  const status = body?.base_resp?.status_code ?? 0;
  if (status !== 0) {
    failed('MiniMax', body?.base_resp?.status_msg ?? `status ${status}`);
  }

  const named = (body?.system_voice ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.voice_name ?? voice.voice_id,
    previewUrl: null,
  }));
  // Cloned and generated voices carry no display name from the provider, only their id.
  const unnamed = [...(body?.voice_cloning ?? []), ...(body?.voice_generation ?? [])].map(
    (voice) => ({
      id: voice.voice_id,
      name: voice.voice_id,
      previewUrl: null,
    }),
  );
  return [...named, ...unnamed];
}
