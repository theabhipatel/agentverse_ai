import { Router } from 'express';
import { requireAdmin } from '../../common/middleware/requireAdmin.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import * as knowledgeController from './knowledge.controller.js';
import {
  addUrlSchema,
  documentIdParamsSchema,
  fileFieldsSchema,
  updateDocumentSchema,
} from './knowledge.schema.js';
import { receiveFile, receiveVideo } from './knowledge.upload.js';

export const knowledgeRouter = Router();

// Admin only, and checked before any upload is read into memory.
knowledgeRouter.use(requireAuth, requireAdmin);

knowledgeRouter.get('/', asyncHandler(knowledgeController.list));
knowledgeRouter.post(
  '/files',
  receiveFile,
  validate({ body: fileFieldsSchema }),
  asyncHandler(knowledgeController.uploadFile),
);
knowledgeRouter.post(
  '/videos',
  receiveVideo,
  validate({ body: fileFieldsSchema }),
  asyncHandler(knowledgeController.uploadVideo),
);
knowledgeRouter.post(
  '/urls',
  validate({ body: addUrlSchema }),
  asyncHandler(knowledgeController.addUrl),
);
knowledgeRouter.patch(
  '/:id',
  validate({ params: documentIdParamsSchema, body: updateDocumentSchema }),
  asyncHandler(knowledgeController.update),
);
knowledgeRouter.put(
  '/:id/file',
  validate({ params: documentIdParamsSchema }),
  receiveFile,
  asyncHandler(knowledgeController.replaceFile),
);
knowledgeRouter.post(
  '/:id/reprocess',
  validate({ params: documentIdParamsSchema }),
  asyncHandler(knowledgeController.reprocess),
);
knowledgeRouter.get(
  '/:id/download',
  validate({ params: documentIdParamsSchema }),
  asyncHandler(knowledgeController.download),
);
knowledgeRouter.delete(
  '/:id',
  validate({ params: documentIdParamsSchema }),
  asyncHandler(knowledgeController.remove),
);
