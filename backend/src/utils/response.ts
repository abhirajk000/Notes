import type { Response } from 'express';
import type { ApiResponse } from '../types';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiResponse<T> = { ok: true, data };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  details?: unknown,
): void {
  const body: ApiResponse = { ok: false, error: message, ...(details ? { details } : {}) };
  res.status(statusCode).json(body);
}
