import type { KnowledgeSourceType, KnowledgeStatus } from '../../db/schema.js';

/** What an admin sees of a document. Its text and storage key stay server side. */
export interface KnowledgeDocument {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  fileName: string | null;
  fileSize: number | null;
  url: string | null;
  status: KnowledgeStatus;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One chunk the search found for a question, with the document it came from. */
export interface KnowledgeMatch {
  documentId: string;
  title: string;
  content: string;
  similarity: number;
}

export interface UploadedFile {
  originalName: string;
  size: number;
  buffer: Buffer;
}

export interface DownloadedFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}
