import { z } from 'zod';

export const agentIdParamsSchema = z.object({
  id: z.string().uuid('A valid agent id is required'),
});

/** The admin's agent form, for both creating and editing. */
export const agentFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    emoji: z.string().trim().min(1, 'Pick an emoji').max(16),
    description: z.string().trim().min(1, 'Description is required').max(300),
    systemPrompt: z.string().trim().min(1, 'Instructions are required').max(10_000),
    usesIntelligenceHub: z.boolean(),
    usesIntegrations: z.boolean(),
    audience: z.enum(['all', 'selected']),
    userIds: z.array(z.string().uuid('A valid user id is required')).default([]),
  })
  .refine((value) => value.audience === 'all' || value.userIds.length > 0, {
    message: 'Select at least one user',
    path: ['userIds'],
  });

export type AgentFormInput = z.infer<typeof agentFormSchema>;
