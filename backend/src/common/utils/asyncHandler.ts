import type { RequestHandler } from 'express';

/** Forwards rejected promises from async handlers to the central error handler. */
export function asyncHandler<P, ResBody, ReqBody, ReqQuery>(
  handler: RequestHandler<P, ResBody, ReqBody, ReqQuery>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
