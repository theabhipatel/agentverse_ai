import type { ErrorRequestHandler } from 'express';
import { AppError, ErrorCode } from '../errors/index.js';
import { logger } from '../logger/index.js';
import type { ApiErrorResponse } from '../types/api.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    const logPayload = {
      requestId: req.requestId,
      code: error.code,
      status: error.statusCode,
      path: req.originalUrl,
    };
    if (error.statusCode >= 500) {
      logger.error({ ...logPayload, err: error }, error.message);
    } else {
      logger.warn(logPayload, error.message);
    }

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
    res.status(error.statusCode).json(body);
    return;
  }

  logger.error({ requestId: req.requestId, err: error, path: req.originalUrl }, 'Unhandled error');

  const body: ApiErrorResponse = {
    success: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' },
  };
  res.status(500).json(body);
};
