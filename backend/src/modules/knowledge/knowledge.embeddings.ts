import { OpenAIEmbeddings } from '@langchain/openai';
import { EMBEDDING_DIMENSIONS } from '../../db/schema.js';
import { configVersion, getEmbeddingRuntime, requireRuntime } from '../llm/llm.state.js';
import type { ModelRuntime } from '../llm/llm.types.js';

let cached: { version: number; embeddings: OpenAIEmbeddings } | null = null;

/**
 * The one place embeddings are created. Asking for a fixed dimension keeps every
 * stored vector the same length whichever text-embedding-3 model an admin picked.
 * The client is rebuilt when the admin changes the key or the model.
 */
function getEmbeddings(): OpenAIEmbeddings {
  const runtime = requireRuntime<ModelRuntime>(getEmbeddingRuntime(), 'The Intelligence Hub');
  const version = configVersion();
  if (cached?.version !== version) {
    cached = {
      version,
      embeddings: new OpenAIEmbeddings({
        apiKey: runtime.apiKey,
        model: runtime.model,
        configuration: { baseURL: runtime.baseUrl },
        dimensions: EMBEDDING_DIMENSIONS,
        maxRetries: 3,
      }),
    };
  }
  return cached.embeddings;
}

export function embedTexts(texts: string[]): Promise<number[][]> {
  return getEmbeddings().embedDocuments(texts);
}

export function embedQuery(text: string): Promise<number[]> {
  return getEmbeddings().embedQuery(text);
}
