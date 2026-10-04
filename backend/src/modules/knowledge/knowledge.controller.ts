import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import { sendSuccess } from '../../common/utils/apiResponse.js';
import type { AddUrlInput, FileFieldsInput, UpdateDocumentInput } from './knowledge.schema.js';
import * as knowledgeService from './knowledge.service.js';
import type { UploadedFile } from './knowledge.types.js';

interface DocumentParams extends ParamsDictionary {
  id: string;
}

function toUploadedFile(file: Express.Multer.File | undefined): UploadedFile | undefined {
  return file
    ? { originalName: file.originalname, size: file.size, buffer: file.buffer }
    : undefined;
}

export const list: RequestHandler = async (_req, res) => {
  const documents = await knowledgeService.listDocuments();
  sendSuccess(res, { documents });
};

export const uploadFile: RequestHandler<ParamsDictionary, unknown, FileFieldsInput> = async (
  req,
  res,
) => {
  const { id: adminId } = getAuthenticatedUser(req);
  const document = await knowledgeService.createFileDocument(
    adminId,
    toUploadedFile(req.file),
    req.body,
  );
  sendSuccess(res, { document }, 201);
};

export const uploadVideo: RequestHandler<ParamsDictionary, unknown, FileFieldsInput> = async (
  req,
  res,
) => {
  const { id: adminId } = getAuthenticatedUser(req);
  const document = await knowledgeService.createVideoDocument(
    adminId,
    toUploadedFile(req.file),
    req.body,
  );
  sendSuccess(res, { document }, 201);
};

export const addUrl: RequestHandler<ParamsDictionary, unknown, AddUrlInput> = async (req, res) => {
  const { id: adminId } = getAuthenticatedUser(req);
  const document = await knowledgeService.createUrlDocument(adminId, req.body);
  sendSuccess(res, { document }, 201);
};

export const update: RequestHandler<DocumentParams, unknown, UpdateDocumentInput> = async (
  req,
  res,
) => {
  const document = await knowledgeService.updateDocument(req.params.id, req.body);
  sendSuccess(res, { document });
};

export const replaceFile: RequestHandler<DocumentParams> = async (req, res) => {
  const document = await knowledgeService.replaceFile(req.params.id, toUploadedFile(req.file));
  sendSuccess(res, { document });
};

export const reprocess: RequestHandler<DocumentParams> = async (req, res) => {
  const document = await knowledgeService.reprocessDocument(req.params.id);
  sendSuccess(res, { document });
};

export const remove: RequestHandler<DocumentParams> = async (req, res) => {
  const { id: adminId } = getAuthenticatedUser(req);
  await knowledgeService.deleteDocument(adminId, req.params.id);
  sendSuccess(res, { deleted: true });
};

/** The one response here that is a file rather than the JSON envelope. */
export const download: RequestHandler<DocumentParams> = async (req, res) => {
  const file = await knowledgeService.downloadDocument(req.params.id);
  res.attachment(file.fileName);
  res.type(file.contentType);
  res.send(file.body);
};
