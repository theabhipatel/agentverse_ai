export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  ACCESS_TOKEN_EXPIRED: 'ACCESS_TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  AGENT_DISABLED: 'AGENT_DISABLED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCodeValue, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, AppError);
  }
}

export const badRequest = (message: string, code: ErrorCodeValue = ErrorCode.VALIDATION_ERROR, details?: unknown): AppError =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required', code: ErrorCodeValue = ErrorCode.UNAUTHORIZED): AppError =>
  new AppError(401, code, message);

export const forbidden = (message = 'You do not have access to this resource'): AppError =>
  new AppError(403, ErrorCode.FORBIDDEN, message);

export const notFound = (message = 'Resource not found', code: ErrorCodeValue = ErrorCode.NOT_FOUND): AppError =>
  new AppError(404, code, message);

export const conflict = (message: string, code: ErrorCodeValue): AppError => new AppError(409, code, message);

export const serviceUnavailable = (message: string): AppError =>
  new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, message);
