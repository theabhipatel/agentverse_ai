import type { ChatProvider, Provider, SttProvider, TtsProvider } from './llm.constants.js';

/** What an admin sees of a stored key: never the key itself. */
export interface ProviderKeyView {
  provider: Provider;
  name: string;
  hasKey: boolean;
  /** The last 6 characters, so a key can be recognised without being readable. */
  last6: string | null;
  updatedAt: Date | null;
}

export interface LlmSettingsView {
  chat: { provider: ChatProvider; model: string };
  /** sameAsChat means voice runs the chat model with its reasoning switched off. */
  voice: { sameAsChat: boolean; provider: ChatProvider | null; model: string | null };
  stt: { provider: SttProvider; model: string };
  tts: { provider: TtsProvider; model: string; voice: string };
  embedding: { provider: Provider; model: string };
  providers: ProviderKeyView[];
}

/** A provider ready to be called: a decrypted key and where to send it. */
export interface ProviderRuntime {
  provider: Provider;
  apiKey: string;
  baseUrl: string;
}

export interface ChatRuntime extends ProviderRuntime {
  provider: ChatProvider;
  model: string;
}

export interface SpeechRuntime extends ProviderRuntime {
  model: string;
  voice: string;
}

export interface ModelRuntime extends ProviderRuntime {
  model: string;
}

export type LlmFeature = 'chat' | 'voice' | 'knowledge';

/** Shown to every user as a toast when something the app needs is not configured. */
export interface LlmWarning {
  feature: LlmFeature;
  message: string;
}
