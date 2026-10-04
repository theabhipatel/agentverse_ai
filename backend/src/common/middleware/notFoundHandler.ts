import type { RequestHandler } from 'express';
import { ErrorCode, notFound } from '../errors/index.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`, ErrorCode.ROUTE_NOT_FOUND));
};
