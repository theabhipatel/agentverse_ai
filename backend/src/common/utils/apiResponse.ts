import type { Response } from 'express';
import type { ApiSuccessResponse } from '../types/api.js';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}
