import { z } from 'zod';

export const conversationIdParamsSchema = z.object({
  id: z.string().uuid('A valid conversation id is required'),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // Omitted means the user's default agent.
  agentId: z.string().uuid('A valid agent id is required').optional(),
});

export const createMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
