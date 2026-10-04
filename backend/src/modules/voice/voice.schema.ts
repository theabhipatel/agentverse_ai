import { z } from 'zod';

export const voiceTurnParamsSchema = z.object({
  id: z.string().uuid('A valid conversation id is required'),
});

export const voiceTurnSchema = z.object({
  /** What the user said, already transcribed by POST /api/transcribe. */
  content: z.string().trim().min(1, 'Nothing was said').max(4000),
});

export type VoiceTurnInput = z.infer<typeof voiceTurnSchema>;
