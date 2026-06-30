import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err);
  }

  sendError(res, message, statusCode);
}
