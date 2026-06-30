import type { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import type { AuthenticatedRequest } from '../types';

/**
 * Middleware: validates the HTTP-only JWT cookie and attaches
 * the decoded payload to `req.user`. Rejects with 401 otherwise.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token: string | undefined = req.cookies?.token;

  if (!token) {
    sendError(res, 'Authentication required.', 401);
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    // Handles expired, tampered, or malformed tokens
    res.clearCookie('token');
    sendError(res, 'Session expired or invalid. Please log in again.', 401);
  }
}
