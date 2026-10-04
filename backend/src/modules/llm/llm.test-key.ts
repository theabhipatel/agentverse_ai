import { badRequest } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { PROVIDER_INFO, authHeaders, noReasoningKwargs, type Provider } from './llm.constants.js';
import type { ChatRuntime, ModelRuntime, ProviderRuntime, SpeechRuntime } from './llm.types.js';

/**
 * Every key is tried against the provider before it is stored, so a wrong key
 * or a wrong model id is refused here instead of breaking a user's chat later.
 */
const TEST_TIMEOUT_MS = 30_000;

function failed(provider: Provider, detail: string): never {
  throw badRequest(`${PROVIDER_INFO[provider].name} rejected the request: ${detail}`);
}

interface ErrorBody {
  error?: { message?: unknown };
  message?: unknown;
  base_resp?: { status_msg?: unknown };
  detail?: unknown;
}

const MAX_PROVIDER_MESSAGE = 200;

/**
 * What the provider itself said, which is the only thing that explains a refusal:
 * GLM answers 429 both for throttling and for an empty balance, for instance.
 * Providers quote the request back in some payloads, so the key is redacted and
 * the full body only ever goes to the log.
 */
function providerMessage(body: string, apiKey: string): string | null {
  let parsed: ErrorBody | null = null;
  try {
    parsed = JSON.parse(body) as ErrorBody;
  } catch {
    return null;
  }

  const candidates = [parsed.error?.message, parsed.message, parsed.base_resp?.status_msg, parsed.detail];
  const message = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  if (typeof message !== 'string') {
    return null;
  }
  return message.replaceAll(apiKey, '[key]').trim().slice(0, MAX_PROVIDER_MESSAGE);
}

async function readError(runtime: ProviderRuntime, response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  logger.warn(
    { provider: runtime.provider, status: response.status, body: body.slice(0, 500) },
    'Provider key test failed',
  );

  const message = providerMessage(body, runtime.apiKey);
  if (message) {
    return message;
  }
  if (response.status === 401 || response.status === 403) {
    return 'the API key was not accepted';
  }
  if (response.status === 404) {
    return 'that model id was not found';
  }
  if (response.status === 429) {
    return 'rate limited, try again in a moment';
  }
  return `HTTP ${response.status}`;
}

/** A dropped connection says nothing about the key, so it is tried once more. A timeout is not: */
async function send(runtime: ProviderRuntime, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
    } catch (error) {
      logger.warn({ provider: runtime.provider, attempt, err: error }, 'Provider key test could not connect');
      if (error instanceof Error && error.name === 'TimeoutError') {
        failed(runtime.provider, `no answer within ${TEST_TIMEOUT_MS / 1000} seconds, the key was not checked`);
      }
    }
  }

  return failed(runtime.provider, 'could not reach the provider, check the server\'s internet connection');
}

async function post(runtime: ProviderRuntime, path: string, body: unknown): Promise<Response> {
  return send(runtime, `${runtime.baseUrl}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(runtime.provider, runtime.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** One token and no reasoning, so testing a key is as quick and cheap as the provider allows. */
export async function testChatKey(runtime: ChatRuntime): Promise<void> {
  const messages = [{ role: 'user', content: 'ping' }];
  let response = await post(runtime, '/chat/completions', {
    model: runtime.model,
    messages,
    max_tokens: 1,
    ...noReasoningKwargs(runtime.provider, runtime.model),
  });

  // A 400 can be the reasoning switch or max_tokens: the OpenAI reasoning models
  // want max_completion_tokens. Plainest possible request, then believe the answer.
  if (response.status === 400) {
    response = await post(runtime, '/chat/completions', {
      model: runtime.model,
      messages,
      max_completion_tokens: 1,
    });
  }

  if (!response.ok) {
    failed(runtime.provider, await readError(runtime, response));
  }
}

/** Speech to text needs audio to try properly, so the key alone is checked. */
export async function testSttKey(runtime: ModelRuntime): Promise<void> {
  const response = await send(runtime, `${runtime.baseUrl}/models`, {
    headers: authHeaders(runtime.provider, runtime.apiKey),
  });

  if (!response.ok) {
    failed(runtime.provider, await readError(runtime, response));
  }

  const body = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
  const models = body?.data?.map((entry) => entry.id) ?? [];
  if (models.length > 0 && !models.includes(runtime.model)) {
    failed(runtime.provider, `that model id was not found (${runtime.model})`);
  }
}

interface SpeechResponse {
  base_resp?: { status_code?: number; status_msg?: string };
}

/** A word of speech, which is the only way to know the voice id is real too. */
export async function testTtsKey(runtime: SpeechRuntime): Promise<void> {
  if (runtime.provider === 'elevenlabs') {
    return testElevenLabsKey(runtime);
  }

  const response = await post(runtime, '/t2a_v2', {
    model: runtime.model,
    text: 'ok',
    stream: false,
    output_format: 'hex',
    voice_setting: { voice_id: runtime.voice, speed: 1, vol: 1, pitch: 0 },
    audio_setting: { sample_rate: 24000, bitrate: 128000, format: 'pcm', channel: 1 },
  });

  if (!response.ok) {
    failed(runtime.provider, await readError(runtime, response));
  }

  // MiniMax answers 200 with the failure inside the body.
  const body = (await response.json().catch(() => null)) as SpeechResponse | null;
  const status = body?.base_resp?.status_code ?? 0;
  if (status !== 0) {
    logger.warn({ provider: runtime.provider, status }, 'Speech key test failed');
    failed(runtime.provider, body?.base_resp?.status_msg ?? `status ${status}`);
  }
}

/** The voice is part of the address here, so a wrong voice id shows up as a 404. */
async function testElevenLabsKey(runtime: SpeechRuntime): Promise<void> {
  const response = await post(
    runtime,
    `/text-to-speech/${encodeURIComponent(runtime.voice)}?output_format=pcm_24000`,
    { text: 'ok', model_id: runtime.model },
  );
  if (!response.ok) {
    failed(runtime.provider, await readError(runtime, response));
  }
}

export async function testEmbeddingKey(runtime: ModelRuntime): Promise<void> {
  const response = await post(runtime, '/embeddings', { model: runtime.model, input: 'ok' });
  if (!response.ok) {
    failed(runtime.provider, await readError(runtime, response));
  }
}
