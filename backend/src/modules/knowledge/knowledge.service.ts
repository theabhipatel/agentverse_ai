import { randomUUID } from 'node:crypto';
import { cosineDistance, desc, eq } from 'drizzle-orm';
import { badRequest, notFound, serviceUnavailable } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { deleteObject, getObject, putObject } from '../../common/storage/index.js';
import { config } from '../../config/env.js';
import { db } from '../../db/index.js';
import { knowledgeChunks, knowledgeDocuments, type KnowledgeDocumentRow } from '../../db/schema.js';
import {
  MIN_SIMILARITY,
  SEARCH_LIMIT,
  SUPPORTED_FILE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  extensionOf,
  videoExtensionOf,
  type SupportedExtension,
  type SupportedVideoExtension,
} from './knowledge.constants.js';
import { getEmbeddingRuntime, getSttRuntime } from '../llm/llm.state.js';
import { embedQuery } from './knowledge.embeddings.js';
import { enqueueDocument, enqueueVideoDocument } from './knowledge.processor.js';
import type { AddUrlInput, FileFieldsInput, UpdateDocumentInput } from './knowledge.schema.js';
import type {
  DownloadedFile,
  KnowledgeDocument,
  KnowledgeMatch,
  UploadedFile,
} from './knowledge.types.js';

function toKnowledgeDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.sourceType,
    fileName: row.fileName,
    fileSize: row.fileSize,
    url: row.url,
    status: row.status,
    error: row.error,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireEmbeddings(): void {
  if (!getEmbeddingRuntime()) {
    throw serviceUnavailable('The Intelligence Hub is not configured on this server');
  }
}

function requireStorage(): void {
  if (!config.storage.enabled) {
    throw serviceUnavailable('File storage is not configured on this server');
  }
}

function requireStt(): void {
  if (!getSttRuntime()) {
    throw serviceUnavailable('Speech to text is not configured on this server');
  }
}

async function requireDocument(documentId: string): Promise<KnowledgeDocumentRow> {
  const [row] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, documentId))
    .limit(1);
  if (!row) {
    throw notFound('Document not found');
  }
  return row;
}

function requireSupportedFile(file: UploadedFile | undefined): {
  file: UploadedFile;
  extension: SupportedExtension;
} {
  if (!file) {
    throw badRequest('Choose a file to upload');
  }
  const extension = extensionOf(file.originalName);
  if (!extension) {
    throw badRequest('Only PDF, DOCX, TXT and MD files are supported');
  }
  if (file.size === 0) {
    throw badRequest('This file is empty');
  }
  return { file, extension };
}

function requireSupportedVideo(file: UploadedFile | undefined): {
  file: UploadedFile;
  extension: SupportedVideoExtension;
} {
  if (!file) {
    throw badRequest('Choose a video to upload');
  }
  const extension = videoExtensionOf(file.originalName);
  if (!extension) {
    throw badRequest('Only MP4, MOV and WEBM videos are supported');
  }
  if (file.size === 0) {
    throw badRequest('This file is empty');
  }
  return { file, extension };
}

/** A fresh key per upload, so replacing a file never overwrites the one still being read. */
function storageKeyFor(documentId: string, extension: string): string {
  return `knowledge/${documentId}/${randomUUID()}.${extension}`;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || fileName;
}

/** The database is the source of truth. An object left behind by a failed delete is harmless. */
async function removeStoredFile(storageKey: string | null): Promise<void> {
  if (!storageKey) {
    return;
  }
  try {
    await deleteObject(storageKey);
  } catch (error) {
    logger.warn({ err: error, storageKey }, 'Could not delete a stored Intelligence Hub file');
  }
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const rows = await db
    .select()
    .from(knowledgeDocuments)
    .orderBy(desc(knowledgeDocuments.createdAt));
  return rows.map(toKnowledgeDocument);
}

export async function createFileDocument(
  adminId: string,
  upload: UploadedFile | undefined,
  input: FileFieldsInput,
): Promise<KnowledgeDocument> {
  requireEmbeddings();
  requireStorage();
  const { file, extension } = requireSupportedFile(upload);

  const id = randomUUID();
  const storageKey = storageKeyFor(id, extension);
  await putObject(storageKey, file.buffer, SUPPORTED_FILE_TYPES[extension]);

  let row: KnowledgeDocumentRow | undefined;
  try {
    [row] = await db
      .insert(knowledgeDocuments)
      .values({
        id,
        title: input.title ?? titleFromFileName(file.originalName),
        sourceType: 'file',
        fileName: file.originalName,
        mimeType: SUPPORTED_FILE_TYPES[extension],
        fileSize: file.size,
        storageKey,
        createdBy: adminId,
      })
      .returning();
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }
  if (!row) {
    throw new Error('Insert returned no document');
  }

  enqueueDocument(row.id);
  logger.info({ documentId: row.id, adminId, extension }, 'Intelligence Hub file added');
  return toKnowledgeDocument(row);
}

/** A video's own upload path: its own size limit, its own queue, and the STT provider must be configured too. */
export async function createVideoDocument(
  adminId: string,
  upload: UploadedFile | undefined,
  input: FileFieldsInput,
): Promise<KnowledgeDocument> {
  requireEmbeddings();
  requireStt();
  requireStorage();
  const { file, extension } = requireSupportedVideo(upload);

  const id = randomUUID();
  const storageKey = storageKeyFor(id, extension);
  await putObject(storageKey, file.buffer, SUPPORTED_VIDEO_TYPES[extension]);

  let row: KnowledgeDocumentRow | undefined;
  try {
    [row] = await db
      .insert(knowledgeDocuments)
      .values({
        id,
        title: input.title ?? titleFromFileName(file.originalName),
        sourceType: 'file',
        fileName: file.originalName,
        mimeType: SUPPORTED_VIDEO_TYPES[extension],
        fileSize: file.size,
        storageKey,
        createdBy: adminId,
      })
      .returning();
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }
  if (!row) {
    throw new Error('Insert returned no document');
  }

  enqueueVideoDocument(row.id);
  logger.info({ documentId: row.id, adminId, extension }, 'Intelligence Hub video added');
  return toKnowledgeDocument(row);
}

export async function createUrlDocument(
  adminId: string,
  input: AddUrlInput,
): Promise<KnowledgeDocument> {
  requireEmbeddings();

  const [row] = await db
    .insert(knowledgeDocuments)
    .values({
      title: input.title ?? input.url,
      sourceType: 'url',
      url: input.url,
      createdBy: adminId,
    })
    .returning();
  if (!row) {
    throw new Error('Insert returned no document');
  }

  enqueueDocument(row.id);
  logger.info({ documentId: row.id, adminId }, 'Intelligence Hub link added');
  return toKnowledgeDocument(row);
}

/** Renames a document. A link given a new URL is fetched again. */
export async function updateDocument(
  documentId: string,
  input: UpdateDocumentInput,
): Promise<KnowledgeDocument> {
  const document = await requireDocument(documentId);
  if (input.url !== undefined && document.sourceType !== 'url') {
    throw badRequest('Only link documents have a URL');
  }

  const newUrl = input.url !== undefined && input.url !== document.url ? input.url : null;
  if (newUrl) {
    requireEmbeddings();
  }
  // A title that was only ever the old URL follows the URL, so the page can name it again.
  const title =
    input.title ?? (newUrl && document.title === document.url ? newUrl : document.title);

  const [row] = await db
    .update(knowledgeDocuments)
    .set({
      title,
      ...(newUrl ? { url: newUrl, status: 'processing' as const, error: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.id, documentId))
    .returning();
  if (!row) {
    throw notFound('Document not found');
  }

  if (newUrl) {
    enqueueDocument(row.id);
  }
  return toKnowledgeDocument(row);
}

export async function replaceFile(
  documentId: string,
  upload: UploadedFile | undefined,
): Promise<KnowledgeDocument> {
  requireEmbeddings();
  requireStorage();
  const document = await requireDocument(documentId);
  if (document.sourceType !== 'file') {
    throw badRequest('Only file documents can have their file replaced');
  }
  const { file, extension } = requireSupportedFile(upload);

  const storageKey = storageKeyFor(documentId, extension);
  await putObject(storageKey, file.buffer, SUPPORTED_FILE_TYPES[extension]);

  const [row] = await db
    .update(knowledgeDocuments)
    .set({
      fileName: file.originalName,
      mimeType: SUPPORTED_FILE_TYPES[extension],
      fileSize: file.size,
      storageKey,
      status: 'processing',
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.id, documentId))
    .returning();
  if (!row) {
    await removeStoredFile(storageKey);
    throw notFound('Document not found');
  }

  await removeStoredFile(document.storageKey);
  enqueueDocument(row.id);
  return toKnowledgeDocument(row);
}

/** Retry after a failure, or refresh a link whose page has changed. */
export async function reprocessDocument(documentId: string): Promise<KnowledgeDocument> {
  requireEmbeddings();
  const document = await requireDocument(documentId);
  if (document.status === 'processing') {
    throw badRequest('This document is already being processed');
  }
  const isVideo = videoExtensionOf(document.fileName ?? '') !== null;
  if (isVideo) {
    requireStt();
  }
  if (document.sourceType === 'file') {
    requireStorage();
  }

  const [row] = await db
    .update(knowledgeDocuments)
    .set({ status: 'processing', error: null, updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, documentId))
    .returning();
  if (!row) {
    throw notFound('Document not found');
  }

  if (isVideo) {
    enqueueVideoDocument(row.id);
  } else {
    enqueueDocument(row.id);
  }
  return toKnowledgeDocument(row);
}

export async function deleteDocument(adminId: string, documentId: string): Promise<void> {
  const document = await requireDocument(documentId);
  // Chunks cascade with the document.
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId));
  await removeStoredFile(document.storageKey);
  logger.info({ documentId, adminId }, 'Intelligence Hub document deleted');
}

export async function downloadDocument(documentId: string): Promise<DownloadedFile> {
  requireStorage();
  const document = await requireDocument(documentId);
  if (document.sourceType !== 'file' || !document.storageKey) {
    throw badRequest('Only file documents can be downloaded');
  }
  return {
    fileName: document.fileName ?? 'document',
    contentType: document.mimeType ?? 'application/octet-stream',
    body: await getObject(document.storageKey),
  };
}

/**
 * The chunks closest in meaning to a question, from ready documents only. Weak
 * matches are dropped, so an empty result means the hub does not cover it.
 */
export async function searchKnowledge(query: string): Promise<KnowledgeMatch[]> {
  if (!getEmbeddingRuntime() || query.trim().length === 0) {
    return [];
  }

  const distance = cosineDistance(knowledgeChunks.embedding, await embedQuery(query));
  const rows = await db
    .select({
      documentId: knowledgeChunks.documentId,
      title: knowledgeDocuments.title,
      content: knowledgeChunks.content,
      distance: distance.mapWith(Number),
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
    .where(eq(knowledgeDocuments.status, 'ready'))
    .orderBy(distance)
    .limit(SEARCH_LIMIT);

  return rows
    .map((row) => ({
      documentId: row.documentId,
      title: row.title,
      content: row.content,
      similarity: 1 - row.distance,
    }))
    .filter((match) => match.similarity >= MIN_SIMILARITY);
}
