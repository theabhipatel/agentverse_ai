import { ChatOpenAI } from '@langchain/openai';
import { serviceUnavailable } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { config } from '../../config/env.js';
import { noReasoningKwargs } from '../llm/llm.constants.js';
import { configVersion, getChatRuntime, getVoiceRuntime } from '../llm/llm.state.js';
import type { ChatRuntime } from '../llm/llm.types.js';

/**
 * The one place a model is created. Every provider we support speaks the OpenAI
 * wire format, so ChatOpenAI is pointed at whichever one the admin selected in
 * Admin > AI models. Provider, model and key all come from the database.
 */
function createModel(runtime: ChatRuntime, forVoice: boolean): ChatOpenAI {
  // Nothing is spoken until the reasoning ends, so a voice turn asks for none of it.
  const kwargs = forVoice ? noReasoningKwargs(runtime.provider, runtime.model) : undefined;

  return new ChatOpenAI({
    apiKey: runtime.apiKey,
    model: runtime.model,
    configuration: {
      baseURL: runtime.baseUrl,
      ...(runtime.provider === 'openrouter'
        ? {
            defaultHeaders: {
              // OpenRouter attribution headers.
              'HTTP-Referer': config.app.clientUrl,
              'X-Title': config.app.name,
            },
          }
        : {}),
    },
    // MiniMax reasoning models are tuned for their own default temperature.
    ...(runtime.provider === 'minimax' ? {} : { temperature: 0 }),
    ...(kwargs ? { modelKwargs: kwargs } : {}),
  });
}

/** Rebuilt only when an admin changes the configuration, not on every turn. */
const cache = new Map<'chat' | 'voice', { version: number; model: ChatOpenAI }>();

function modelFor(kind: 'chat' | 'voice'): ChatOpenAI {
  const runtime = kind === 'chat' ? getChatRuntime() : getVoiceRuntime();
  if (!runtime) {
    throw serviceUnavailable('The chat model is not configured. An administrator must add an API key.');
  }

  const version = configVersion();
  const cached = cache.get(kind);
  if (cached?.version === version) {
    return cached.model;
  }

  const model = createModel(runtime, kind === 'voice');
  cache.set(kind, { version, model });
  logger.info({ kind, provider: runtime.provider, model: runtime.model }, 'Model client created');
  return model;
}

export function getChatModel(): ChatOpenAI {
  return modelFor('chat');
}

export function getVoiceModel(): ChatOpenAI {
  return modelFor('voice');
}

/**
 * MiniMax returns its reasoning inline as <think>...</think>. It stays in the
 * message during a turn, because MiniMax needs it back between tool calls, and
 * is removed from anything a user sees. An unclosed block, from a reply cut off
 * mid thought, is removed to the end.
 */
const THINKING_BLOCK = /<think>[\s\S]*?(?:<\/think>|$)/g;

export function withoutThinking(text: string): string {
  return text.replace(THINKING_BLOCK, '').trim();
}

const MAX_MODEL_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Free OpenRouter models occasionally answer 200 with an error body and no
 * choices, which surfaces as a client side TypeError. Retrying the model call
 * clears it. Only the model call is retried: replaying a whole graph turn could
 * execute a tool, and its side effect, twice.
 */
export async function invokeWithRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      // A cancelled turn stays cancelled.
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) {
        throw error;
      }
      lastError = error;
      logger.warn(
        { attempt, maxAttempts: MAX_MODEL_ATTEMPTS, err: error },
        'Model call failed, retrying',
      );
      if (attempt < MAX_MODEL_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}
