import { z } from 'zod';
import { TOOLKIT_SLUGS, isSupportedToolkit } from './integration.constants.js';

export const toolkitParamsSchema = z.object({
  toolkit: z.string().refine(isSupportedToolkit, {
    message: `Unsupported integration. Allowed: ${TOOLKIT_SLUGS.join(', ')}`,
  }),
});
