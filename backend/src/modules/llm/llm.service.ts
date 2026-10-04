import { eq } from 'drizzle-orm';
import { encryptSecret, lastCharacters } from '../../common/crypto/index.js';
import { badRequest } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { config } from '../../config/env.js';
import { db } from '../../db/index.js';
import { llmProviders, llmSettings } from '../../db/schema.js';
import {
  EMBEDDING_PROVIDER,
  PROVIDERS,
  PROVIDER_INFO,
  SETTINGS_ID,
  type ChatProvider,
  type Provider,
  type SttProvider,
  type TtsProvider,
} from './llm.constants.js';
import type { ChatInput, EmbeddingInput, SttInput, TtsInput, VoiceInput } from './llm.schema.js';
import {
  baseUrlFor,
  currentSettings,
  getChatRuntime,
  getProviderRow,
  getTtsRuntime,
  loadLlmConfig,
  requireRuntime,
  sttProvider,
  ttsProvider,
} from './llm.state.js';
import { testChatKey, testEmbeddingKey, testSttKey, testTtsKey } from './llm.test-key.js';
import type { ChatRuntime, LlmSettingsView, ProviderKeyView, SpeechRuntime } from './llm.types.js';
import { listVoices, type VoiceOption } from './llm.voices.js';
import { streamSpeech } from '../voice/voice.tts.js';
import { decryptSecret } from '../../common/crypto/index.js';

/**
 * Copies the env file's keys and models into the database on the first boot,
 * encrypted. Nothing is ever overwritten, so from then on the admin owns them
 * and the env values are dead weight.
 */
export async function seedLlmConfig(): Promise<void> {
  for (const provider of PROVIDERS) {
    const key = config.llmSeed.keys[provider];
    if (!key) {
      continue;
    }
    await db
      .insert(llmProviders)
      .values({
        provider,
        apiKeyCipher: encryptSecret(key),
        apiKeyLast6: lastCharacters(key),
        baseUrl: seedBaseUrl(provider),
      })
      .onConflictDoNothing();
  }

  const provider = config.llmSeed.provider;
  await db
    .insert(llmSettings)
    .values({
      id: SETTINGS_ID,
      chatProvider: provider,
      chatModel: seedChatModel(provider),
      sttModel: config.llmSeed.sttModel,
      ttsModel: config.llmSeed.ttsModel,
      ttsVoice: config.llmSeed.ttsVoice,
      embeddingModel: config.llmSeed.embeddingModel,
    })
    .onConflictDoNothing();

  await loadLlmConfig();
}

function seedBaseUrl(provider: Provider): string {
  const fromEnv =
    provider === 'minimax' || provider === 'openrouter' || provider === 'groq'
      ? config.llmSeed.baseUrls[provider]
      : '';
  return fromEnv || PROVIDER_INFO[provider].baseUrl;
}

function seedChatModel(provider: ChatProvider): string {
  const fromEnv =
    provider === 'minimax' || provider === 'openrouter' ? config.llmSeed.chatModels[provider] : '';
  return fromEnv || PROVIDER_INFO[provider].defaultModel;
}

// ---------- What the admin sees ----------

function toProviderKeyView(provider: Provider): ProviderKeyView {
  const row = getProviderRow(provider);
  return {
    provider,
    name: PROVIDER_INFO[provider].name,
    hasKey: Boolean(row),
    last6: row?.apiKeyLast6 ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export function getLlmSettingsView(): LlmSettingsView {
  const settings = currentSettings();
  return {
    chat: { provider: settings.chatProvider as ChatProvider, model: settings.chatModel },
    voice: {
      sameAsChat: !settings.voiceProvider,
      provider: (settings.voiceProvider as ChatProvider | null) ?? null,
      model: settings.voiceModel,
    },
    stt: { provider: sttProvider() as SttProvider, model: settings.sttModel },
    tts: {
      provider: ttsProvider() as TtsProvider,
      model: settings.ttsModel,
      voice: settings.ttsVoice,
    },
    embedding: { provider: EMBEDDING_PROVIDER, model: settings.embeddingModel },
    providers: PROVIDERS.map(toProviderKeyView),
  };
}

// ---------- Saving ----------

/** The key to try: the one being pasted, or the stored one when the field was left empty. */
function keyToUse(provider: Provider, apiKey: string | undefined): string {
  if (apiKey) {
    return apiKey;
  }
  const row = getProviderRow(provider);
  if (!row) {
    throw badRequest(`Add a ${PROVIDER_INFO[provider].name} API key first`);
  }
  return decryptSecret(row.apiKeyCipher);
}

/** Only after the provider has accepted the key is anything written down. */
async function storeKey(
  provider: Provider,
  apiKey: string | undefined,
  actingAdminId: string,
): Promise<void> {
  if (!apiKey) {
    return;
  }
  const values = {
    provider,
    apiKeyCipher: encryptSecret(apiKey),
    apiKeyLast6: lastCharacters(apiKey),
    baseUrl: baseUrlFor(provider),
    updatedBy: actingAdminId,
    updatedAt: new Date(),
  };
  await db
    .insert(llmProviders)
    .values(values)
    .onConflictDoUpdate({ target: llmProviders.provider, set: values });
  logger.info({ provider, actingAdminId }, 'Admin stored a provider API key');
}

async function updateSettings(
  values: Partial<typeof llmSettings.$inferInsert>,
  actingAdminId: string,
): Promise<void> {
  await db
    .update(llmSettings)
    .set({ ...values, updatedBy: actingAdminId, updatedAt: new Date() })
    .where(eq(llmSettings.id, SETTINGS_ID));
  await loadLlmConfig();
}

/** Tries the exact configuration the admin is looking at, whether or not it is saved. */
export async function checkChat(input: ChatInput): Promise<void> {
  const apiKey = keyToUse(input.provider, input.apiKey);
  await testChatKey({
    provider: input.provider,
    model: input.model,
    apiKey,
    baseUrl: baseUrlFor(input.provider),
  });
}

export async function saveChat(actingAdminId: string, input: ChatInput): Promise<LlmSettingsView> {
  await checkChat(input);

  await storeKey(input.provider, input.apiKey, actingAdminId);
  await updateSettings({ chatProvider: input.provider, chatModel: input.model }, actingAdminId);
  logger.info(
    { provider: input.provider, model: input.model, actingAdminId },
    'Admin set the chat model',
  );
  return getLlmSettingsView();
}

/** Following the chat model needs no check of its own: the chat tab already tests it. */
export async function checkVoice(input: VoiceInput): Promise<void> {
  if (input.sameAsChat) {
    await testChatKey(requireRuntime<ChatRuntime>(getChatRuntime(), 'Chat'));
    return;
  }
  const apiKey = keyToUse(input.provider, input.apiKey);
  await testChatKey({
    provider: input.provider,
    model: input.model,
    apiKey,
    baseUrl: baseUrlFor(input.provider),
  });
}

export async function saveVoice(
  actingAdminId: string,
  input: VoiceInput,
): Promise<LlmSettingsView> {
  if (input.sameAsChat) {
    await updateSettings({ voiceProvider: null, voiceModel: null }, actingAdminId);
    logger.info({ actingAdminId }, 'Admin set voice to follow the chat model');
    return getLlmSettingsView();
  }

  await checkVoice(input);

  await storeKey(input.provider, input.apiKey, actingAdminId);
  await updateSettings({ voiceProvider: input.provider, voiceModel: input.model }, actingAdminId);
  logger.info(
    { provider: input.provider, model: input.model, actingAdminId },
    'Admin set the voice model',
  );
  return getLlmSettingsView();
}

export async function checkStt(input: SttInput): Promise<void> {
  const apiKey = keyToUse(input.provider, input.apiKey);
  await testSttKey({
    provider: input.provider,
    model: input.model,
    apiKey,
    baseUrl: baseUrlFor(input.provider),
  });
}

export async function saveStt(actingAdminId: string, input: SttInput): Promise<LlmSettingsView> {
  await checkStt(input);

  await storeKey(input.provider, input.apiKey, actingAdminId);
  await updateSettings({ sttProvider: input.provider, sttModel: input.model }, actingAdminId);
  logger.info(
    { provider: input.provider, model: input.model, actingAdminId },
    'Admin set speech to text',
  );
  return getLlmSettingsView();
}

export async function checkTts(input: TtsInput): Promise<void> {
  const apiKey = keyToUse(input.provider, input.apiKey);
  await testTtsKey({
    provider: input.provider,
    model: input.model,
    voice: input.voice,
    apiKey,
    baseUrl: baseUrlFor(input.provider),
  });
}

export async function saveTts(actingAdminId: string, input: TtsInput): Promise<LlmSettingsView> {
  await checkTts(input);

  await storeKey(input.provider, input.apiKey, actingAdminId);
  await updateSettings(
    { ttsProvider: input.provider, ttsModel: input.model, ttsVoice: input.voice },
    actingAdminId,
  );
  logger.info(
    { provider: input.provider, model: input.model, actingAdminId },
    'Admin set text to speech',
  );
  return getLlmSettingsView();
}

export async function checkEmbedding(input: EmbeddingInput): Promise<void> {
  const apiKey = keyToUse(EMBEDDING_PROVIDER, input.apiKey);
  await testEmbeddingKey({
    provider: EMBEDDING_PROVIDER,
    model: input.model,
    apiKey,
    baseUrl: baseUrlFor(EMBEDDING_PROVIDER),
  });
}

export async function saveEmbedding(
  actingAdminId: string,
  input: EmbeddingInput,
): Promise<LlmSettingsView> {
  await checkEmbedding(input);

  await storeKey(EMBEDDING_PROVIDER, input.apiKey, actingAdminId);
  // Existing documents keep vectors from the old model, so the admin is warned in the UI.
  await updateSettings({ embeddingModel: input.model }, actingAdminId);
  return getLlmSettingsView();
}

// ---------- Voice library ----------

const VOICE_PREVIEW_TEXT = 'Hi, this is a quick preview of this voice.';

/** Every voice the currently configured text to speech provider offers. */
export async function listTtsVoices(): Promise<VoiceOption[]> {
  const tts = requireRuntime<SpeechRuntime>(getTtsRuntime(), 'Text to speech');
  return listVoices(tts);
}

/** Speaks a sample line in a voice that is not necessarily the saved one, so an admin can try before selecting it. */
export async function previewTtsVoice(
  voice: string,
  onAudio: (pcm: Buffer) => void,
  signal: AbortSignal,
): Promise<void> {
  await streamSpeech(VOICE_PREVIEW_TEXT, onAudio, signal, voice);
}
