import { z } from 'zod';
import { TOOLKIT_SLUGS, isSupportedToolkit } from '../integration/integration.constants.js';

export const userIdParamsSchema = z.object({
  id: z.string().uuid('A valid user id is required'),
});

/** Missing on create means every toolkit; missing on update means leave it as it is. */
const toolkits = z
  .array(z.string().refine(isSupportedToolkit, { message: `Allowed: ${TOOLKIT_SLUGS.join(', ')}` }))
  .optional();

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(4, 'Password must be at least 4 characters').max(72),
  role: z.enum(['user', 'admin']).default('user'),
  toolkits,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    password: z.string().min(4).max(72).optional(),
    role: z.enum(['user', 'admin']).optional(),
    toolkits,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

/** The on/off switch for an integration or an agent. */
export const integrationSwitchSchema = z.object({
  enabled: z.boolean({ required_error: 'enabled must be true or false' }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type IntegrationSwitchInput = z.infer<typeof integrationSwitchSchema>;
