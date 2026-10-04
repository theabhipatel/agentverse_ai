import type { RequestHandler } from 'express';
import multer from 'multer';
import { badRequest } from '../../common/errors/index.js';
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_LABEL,
} from './knowledge.constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  // Without this, non English file names arrive garbled.
  defParamCharset: 'utf8',
});

/** Reads the single `file` field into memory and turns multer's errors into 400s. */
export const receiveFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        badRequest(
          error.code === 'LIMIT_FILE_SIZE'
            ? `Files can be at most ${MAX_FILE_LABEL}`
            : error.message,
        ),
      );
      return;
    }
    next(error);
  });
};

// A separate multer instance: a video needs a far larger limit than a document,
// and the two must never share one so a big video can't quietly raise the cap
// documents are held to.
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  defParamCharset: 'utf8',
});

export const receiveVideo: RequestHandler = (req, res, next) => {
  uploadVideo.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        badRequest(
          error.code === 'LIMIT_FILE_SIZE'
            ? `Videos can be at most ${MAX_VIDEO_LABEL}`
            : error.message,
        ),
      );
      return;
    }
    next(error);
  });
};
