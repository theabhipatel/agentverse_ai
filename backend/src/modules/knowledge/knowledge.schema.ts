import { z } from 'zod';

/** A blank form field means "not given", the same as leaving it out. */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const title = z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional());

const webUrl = z
  .string()
  .trim()
  .url('A valid URL is required')
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links are supported');

export const documentIdParamsSchema = z.object({
  id: z.string().uuid('A valid document id is required'),
});

/** The text fields that travel with an uploaded file. The file itself is read by multer. */
export const fileFieldsSchema = z.object({ title });

export const addUrlSchema = z.object({ url: webUrl, title });

export const updateDocumentSchema = z
  .object({ title, url: webUrl.optional() })
  .refine((value) => value.title !== undefined || value.url !== undefined, { message: 'Nothing to update' });

export type FileFieldsInput = z.infer<typeof fileFieldsSchema>;
export type AddUrlInput = z.infer<typeof addUrlSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
