import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { eq } from 'drizzle-orm';
import { logger } from '../../common/logger/index.js';
import { getObject } from '../../common/storage/index.js';
import { db } from '../../db/index.js';
import { knowledgeChunks, knowledgeDocuments, type KnowledgeDocumentRow } from '../../db/schema.js';
import { CHUNK_OVERLAP, CHUNK_SIZE, extensionOf, videoExtensionOf } from './knowledge.constants.js';
import { embedTexts } from './knowledge.embeddings.js';
import { KnowledgeProcessingError, extractFileText, fetchUrlText } from './knowledge.extract.js';
import { extractVideoText } from './knowledge.video.js';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});
const INSERT_BATCH_SIZE = 200;
const UNKNOWN_FAILURE =
  'Processing failed. Try again, and check the embedding service if it keeps failing.';

/** Collapses layout whitespace, so chunks carry text rather than spacing. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readText(
  document: KnowledgeDocumentRow,
): Promise<{ text: string; pageTitle: string | null }> {
  if (document.sourceType === 'url') {
    const page = await fetchUrlText(document.url ?? '');
    return { text: page.text, pageTitle: page.title };
  }

  if (!document.storageKey) {
    throw new KnowledgeProcessingError('The stored file is missing. Replace the file to fix this.');
  }

  const videoExtension = videoExtensionOf(document.fileName ?? '');
  if (videoExtension) {
    return {
      text: await extractVideoText(await getObject(document.storageKey), videoExtension),
      pageTitle: null,
    };
  }

  const extension = extensionOf(document.fileName ?? '');
  if (!extension) {
    throw new KnowledgeProcessingError('The stored file is missing. Replace the file to fix this.');
  }
  return {
    text: await extractFileText(await getObject(document.storageKey), extension),
    pageTitle: null,
  };
}

async function processDocument(documentId: string): Promise<void> {
  const [document] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, documentId))
    .limit(1);
  // Deleted while it waited in the queue.
  if (!document) {
    return;
  }

  try {
    const { text, pageTitle } = await readText(document);
    const content = normalize(text);
    if (!content) {
      throw new KnowledgeProcessingError(
        document.sourceType === 'url'
          ? 'No readable text was found on this page.'
          : videoExtensionOf(document.fileName ?? '')
            ? 'No speech was found in this video.'
            : 'No readable text was found. Scanned PDFs are not supported yet.',
      );
    }

    const pieces = await splitter.splitText(content);
    const vectors = await embedTexts(pieces);

    // A link added without a title is titled with its URL until the page names itself.
    const adoptPageTitle = pageTitle !== null && document.title === document.url;

    await db.transaction(async (tx) => {
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
      for (let start = 0; start < pieces.length; start += INSERT_BATCH_SIZE) {
        await tx.insert(knowledgeChunks).values(
          pieces.slice(start, start + INSERT_BATCH_SIZE).map((piece, offset) => ({
            documentId,
            position: start + offset,
            content: piece,
            embedding: vectors[start + offset] ?? [],
          })),
        );
      }
      await tx
        .update(knowledgeDocuments)
        .set({
          status: 'ready',
          error: null,
          chunkCount: pieces.length,
          updatedAt: new Date(),
          ...(adoptPageTitle ? { title: pageTitle } : {}),
        })
        .where(eq(knowledgeDocuments.id, documentId));
    });

    logger.info({ documentId, chunks: pieces.length }, 'Intelligence Hub document ready');
  } catch (error) {
    logger.error({ err: error, documentId }, 'Intelligence Hub document failed');
    await db
      .update(knowledgeDocuments)
      .set({
        status: 'failed',
        error: error instanceof KnowledgeProcessingError ? error.message : UNKNOWN_FAILURE,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, documentId));
  }
}

let queue: Promise<void> = Promise.resolve();
// A video's own line: extracting and transcribing one can take minutes, and it
// must never make an admin's quick PDF or DOCX upload wait behind it.
let videoQueue: Promise<void> = Promise.resolve();

/**
 * Documents are processed in the background, one at a time, inside this process.
 * No Redis or worker: admins add a handful of files, and one at a time keeps the
 * embedding API well under its rate limits. A restart loses the queue, which is
 * why interrupted documents are marked failed on boot.
 */
export function enqueueDocument(documentId: string): void {
  queue = queue
    .then(() => processDocument(documentId))
    .catch((error: unknown) => {
      logger.error({ err: error, documentId }, 'Intelligence Hub queue step failed');
    });
}

/** Same pattern as enqueueDocument, its own chain so a video never blocks a document, or the other way round. */
export function enqueueVideoDocument(documentId: string): void {
  videoQueue = videoQueue
    .then(() => processDocument(documentId))
    .catch((error: unknown) => {
      logger.error({ err: error, documentId }, 'Intelligence Hub video queue step failed');
    });
}

export async function failInterruptedDocuments(): Promise<void> {
  const rows = await db
    .update(knowledgeDocuments)
    .set({
      status: 'failed',
      error: 'Processing was interrupted by a server restart. Use Retry.',
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.status, 'processing'))
    .returning({ id: knowledgeDocuments.id });

  if (rows.length > 0) {
    logger.warn({ count: rows.length }, 'Marked interrupted Intelligence Hub documents as failed');
  }
}
