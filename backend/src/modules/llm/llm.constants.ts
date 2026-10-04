/**
 * Providers the admin can configure. Adding a fifth chat provider is one entry
 * here plus, if it reasons, one line in noReasoningKwargs: nothing else changes,
 * because all of them speak the OpenAI wire format.
 */
export const CHAT_PROVIDERS = ['openrouter', 'openai', 'minimax', 'glm'] as const;
export type ChatProvider = (typeof CHAT_PROVIDERS)[number];

/** Speech to text: both speak the OpenAI /audio/transcriptions format. */
export const STT_PROVIDERS = ['groq', 'openai'] as const;
export type SttProvider = (typeof STT_PROVIDERS)[number];

/** Text to speech: MiniMax and ElevenLabs, each with its own API. */
export const TTS_PROVIDERS = ['minimax', 'elevenlabs'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export const PROVIDERS = [...CHAT_PROVIDERS, 'groq', 'elevenlabs'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ProviderInfo {
  readonly name: string;
  readonly baseUrl: string;
  /** Offered in the admin form as a starting point. Any model id is allowed. */
  readonly defaultModel: string;
  /** ElevenLabs authenticates with its own header instead of a bearer token. */
  readonly authHeader?: string;
}

export const PROVIDER_INFO: Readonly<Record<Provider, ProviderInfo>> = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
  },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  minimax: { name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1', defaultModel: 'MiniMax-M3' },
  glm: { name: 'GLM (Z.ai)', baseUrl: 'https://api.z.ai/api/paas/v4', defaultModel: 'glm-4.5-flash' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3' },
  elevenlabs: {
    name: 'ElevenLabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    defaultModel: 'eleven_flash_v2_5',
    authHeader: 'xi-api-key',
  },
};

/**
 * Asks a provider for as little reasoning as it allows. Voice uses it because
 * nothing can be spoken until the thinking ends, and a key test uses it because
 * a test only needs the provider to accept the key and the model id. Each names
 * the setting differently, and a provider missing from here reasons as usual.
 */
export function noReasoningKwargs(provider: ChatProvider, model: string): Record<string, unknown> | undefined {
  switch (provider) {
    case 'minimax':
    case 'glm':
      return { thinking: { type: 'disabled' } };
    case 'openrouter':
      return { reasoning: { enabled: false } };
    case 'openai':
      // Only the reasoning models take this, the rest answer 400 for an unknown parameter.
      return /^(o\d|gpt-5)/.test(model) ? { reasoning_effort: 'minimal' } : undefined;
  }
}

/** How this provider expects the key: a bearer token unless it says otherwise. */
export function authHeaders(provider: Provider, apiKey: string): Record<string, string> {
  const header = PROVIDER_INFO[provider].authHeader;
  return header ? { [header]: apiKey } : { Authorization: `Bearer ${apiKey}` };
}

/** Embeddings stay on OpenAI: changing provider would mean re-indexing the whole hub. */
export const EMBEDDING_PROVIDER = 'openai';

export const DEFAULT_STT_PROVIDER: SttProvider = 'groq';
export const DEFAULT_TTS_PROVIDER: TtsProvider = 'minimax';

/** The single settings row. */
export const SETTINGS_ID = 'global';

export function isChatProvider(value: string): value is ChatProvider {
  return (CHAT_PROVIDERS as readonly string[]).includes(value);
}

export function isSttProvider(value: string): value is SttProvider {
  return (STT_PROVIDERS as readonly string[]).includes(value);
}

export function isTtsProvider(value: string): value is TtsProvider {
  return (TTS_PROVIDERS as readonly string[]).includes(value);
}
