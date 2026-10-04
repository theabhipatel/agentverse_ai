export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_LABEL = '20 MB';

/** The extension decides how text is read. The content type is stored with the object. */
export const SUPPORTED_FILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
} as const;

export type SupportedExtension = keyof typeof SUPPORTED_FILE_TYPES;

export function extensionOf(fileName: string): SupportedExtension | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extension in SUPPORTED_FILE_TYPES ? (extension as SupportedExtension) : null;
}

/** Its own button and its own, much larger limit: a video is minutes of transcoding and transcription, not seconds. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_LABEL = '200 MB';

export const SUPPORTED_VIDEO_TYPES = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
} as const;

export type SupportedVideoExtension = keyof typeof SUPPORTED_VIDEO_TYPES;

export function videoExtensionOf(fileName: string): SupportedVideoExtension | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extension in SUPPORTED_VIDEO_TYPES ? (extension as SupportedVideoExtension) : null;
}

// About 250 tokens a chunk keeps each one on a single idea. The overlap keeps a
// sentence that falls on a boundary findable from either side.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

export const SEARCH_LIMIT = 5;
// Cosine similarity below this is noise for text-embedding-3 models: the chunk
// shares words with the question but does not answer it.
export const MIN_SIMILARITY = 0.3;

export const URL_FETCH_TIMEOUT_MS = 15_000;
export const URL_MAX_BYTES = 5 * 1024 * 1024;
export const URL_MAX_REDIRECTS = 5;

/** The exact reply an Intelligence Hub agent gives when the hub has no answer. */
export const HUB_NOT_FOUND_REPLY = "I couldn't find this in the Intelligence Hub.";
