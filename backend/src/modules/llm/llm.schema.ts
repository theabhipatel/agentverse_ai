import { z } from 'zod';
import { CHAT_PROVIDERS, STT_PROVIDERS, TTS_PROVIDERS } from './llm.constants.js';

/** Left empty means "keep the stored key". A key is never sent back to the browser to be edited. */
const apiKey = z
  .string()
  .trim()
  .min(8, 'That does not look like an API key')
  .max(300)
  .optional()
  .or(z.literal('').transform(() => undefined));

const model = z.string().trim().min(1, 'A model id is required').max(200);

export const chatSchema = z.object({
  provider: z.enum(CHAT_PROVIDERS, { errorMap: () => ({ message: 'Unknown provider' }) }),
  model,
  apiKey,
});

export const voiceSchema = z
  .object({
    sameAsChat: z.boolean(),
    provider: z.enum(CHAT_PROVIDERS).optional(),
    model: model.optional(),
    apiKey,
  })
  .refine((value) => value.sameAsChat || (value.provider && value.model), {
    message: 'Pick a provider and a model for voice',
    path: ['model'],
  })
  .transform((value) =>
    value.sameAsChat
      ? ({ sameAsChat: true, apiKey: value.apiKey } as const)
      : ({
          sameAsChat: false,
          provider: value.provider as (typeof CHAT_PROVIDERS)[number],
          model: value.model as string,
          apiKey: value.apiKey,
        } as const),
  );

export const sttSchema = z.object({
  provider: z.enum(STT_PROVIDERS, { errorMap: () => ({ message: 'Unknown provider' }) }),
  model,
  apiKey,
});

export const ttsSchema = z.object({
  provider: z.enum(TTS_PROVIDERS, { errorMap: () => ({ message: 'Unknown provider' }) }),
  model,
  voice: z.string().trim().min(1, 'A voice is required').max(100),
  apiKey,
});
export const embeddingSchema = z.object({ model, apiKey });

export const previewVoiceSchema = z.object({
  voice: z.string().trim().min(1, 'A voice is required').max(100),
});

export type ChatInput = z.infer<typeof chatSchema>;
export type VoiceInput = z.infer<typeof voiceSchema>;
export type SttInput = z.infer<typeof sttSchema>;
export type TtsInput = z.infer<typeof ttsSchema>;
export type EmbeddingInput = z.infer<typeof embeddingSchema>;
export type PreviewVoiceInput = z.infer<typeof previewVoiceSchema>;
