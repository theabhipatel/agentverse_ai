import { decryptSecret } from '../../common/crypto/index.js';
import { serviceUnavailable } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { db } from '../../db/index.js';
import { llmProviders, llmSettings, type LlmProviderRow, type LlmSettingsRow } from '../../db/schema.js';
import {
  DEFAULT_STT_PROVIDER,
  DEFAULT_TTS_PROVIDER,
  EMBEDDING_PROVIDER,
  PROVIDER_INFO,
  isChatProvider,
  isSttProvider,
  isTtsProvider,
  type ChatProvider,
  type Provider,
} from './llm.constants.js';
import type { ChatRuntime, LlmWarning, ModelRuntime, SpeechRuntime } from './llm.types.js';

/**
 * The whole LLM configuration, held in memory so a chat turn never waits on the
 * database. Keys stay encrypted in here exactly as they are stored, and are
 * decrypted only for the moment a provider is called.
 */
let providerRows = new Map<Provider, LlmProviderRow>();
let settingsRow: LlmSettingsRow | null = null;
let version = 0;

/** Bumped on every reload, so cached model clients know they are stale. */
export function configVersion(): number {
  return version;
}

export async function loadLlmConfig(): Promise<void> {
  const [providers, [settings]] = await Promise.all([
    db.select().from(llmProviders),
    db.select().from(llmSettings).limit(1),
  ]);

  providerRows = new Map(providers.map((row) => [row.provider as Provider, row]));
  settingsRow = settings ?? null;
  version += 1;

  logger.info(
    { providers: providers.map((row) => row.provider), chatProvider: settings?.chatProvider },
    'LLM configuration loaded',
  );
}

export function listProviderRows(): LlmProviderRow[] {
  return [...providerRows.values()];
}

export function getProviderRow(provider: Provider): LlmProviderRow | undefined {
  return providerRows.get(provider);
}

/** The settings row, which the boot seed guarantees exists. */
export function currentSettings(): LlmSettingsRow {
  if (!settingsRow) {
    throw new Error('LLM settings were read before they were loaded');
  }
  return settingsRow;
}

function runtimeFor(provider: Provider): { apiKey: string; baseUrl: string } | null {
  const row = providerRows.get(provider);
  if (!row) {
    return null;
  }
  return { apiKey: decryptSecret(row.apiKeyCipher), baseUrl: row.baseUrl };
}

export function baseUrlFor(provider: Provider): string {
  return providerRows.get(provider)?.baseUrl ?? PROVIDER_INFO[provider].baseUrl;
}

export function hasKey(provider: Provider): boolean {
  return providerRows.has(provider);
}

export function getChatRuntime(): ChatRuntime | null {
  const settings = currentSettings();
  if (!isChatProvider(settings.chatProvider)) {
    return null;
  }
  const credentials = runtimeFor(settings.chatProvider);
  return credentials ? { provider: settings.chatProvider, model: settings.chatModel, ...credentials } : null;
}

/** Voice runs the chat model unless an admin gave it one of its own. */
export function getVoiceRuntime(): ChatRuntime | null {
  const settings = currentSettings();
  if (!settings.voiceProvider || !settings.voiceModel || !isChatProvider(settings.voiceProvider)) {
    return getChatRuntime();
  }
  const credentials = runtimeFor(settings.voiceProvider);
  return credentials
    ? { provider: settings.voiceProvider as ChatProvider, model: settings.voiceModel, ...credentials }
    : null;
}

export function sttProvider(): Provider {
  const settings = currentSettings();
  return isSttProvider(settings.sttProvider) ? settings.sttProvider : DEFAULT_STT_PROVIDER;
}

export function ttsProvider(): Provider {
  const settings = currentSettings();
  return isTtsProvider(settings.ttsProvider) ? settings.ttsProvider : DEFAULT_TTS_PROVIDER;
}

export function getSttRuntime(): ModelRuntime | null {
  const provider = sttProvider();
  const credentials = runtimeFor(provider);
  return credentials ? { provider, model: currentSettings().sttModel, ...credentials } : null;
}

export function getTtsRuntime(): SpeechRuntime | null {
  const provider = ttsProvider();
  const credentials = runtimeFor(provider);
  const settings = currentSettings();
  return credentials
    ? { provider, model: settings.ttsModel, voice: settings.ttsVoice, ...credentials }
    : null;
}

export function getEmbeddingRuntime(): ModelRuntime | null {
  const credentials = runtimeFor(EMBEDDING_PROVIDER);
  return credentials
    ? { provider: EMBEDDING_PROVIDER, model: currentSettings().embeddingModel, ...credentials }
    : null;
}

/** Used where a feature cannot degrade: no key configured is a 503, not a crash. */
export function requireRuntime<T>(runtime: T | null, feature: string): T {
  if (!runtime) {
    throw serviceUnavailable(`${feature} is not configured. An administrator must add an API key.`);
  }
  return runtime;
}

/**
 * What is missing, in the words every user sees as a toast. Provider names are
 * fine to show, key material never appears here.
 */
export function llmWarnings(): LlmWarning[] {
  const warnings: LlmWarning[] = [];
  const chat = getChatRuntime();

  if (!chat) {
    warnings.push({
      feature: 'chat',
      message: `Chat is unavailable: no ${PROVIDER_INFO[currentSettings().chatProvider as Provider]?.name ?? 'provider'} API key has been set up.`,
    });
  }
  if (!getVoiceRuntime() || !getSttRuntime() || !getTtsRuntime()) {
    warnings.push({
      feature: 'voice',
      message: `Voice chat is unavailable: the ${PROVIDER_INFO[sttProvider()].name} or ${PROVIDER_INFO[ttsProvider()].name} API key has not been set up.`,
    });
  }
  if (!getEmbeddingRuntime()) {
    warnings.push({
      feature: 'knowledge',
      message: `The Intelligence Hub is unavailable: no ${PROVIDER_INFO[EMBEDDING_PROVIDER].name} API key has been set up.`,
    });
  }
  return warnings;
}
