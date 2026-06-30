import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import pool from '../db/pool';
import { signToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { requireAuth } from '../middleware/auth';
import type { AuthenticatedRequest, UserRow } from '../types';

const router = Router();

// ── Validation schemas ─────────────────────────────────────────

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.')
    .max(64, 'Username must be at most 64 characters.')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -.'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(128, 'Password must be at most 128 characters.'),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// ── Cookie helper ──────────────────────────────────────────────

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });
}

// ── Argon2id configuration (OWASP recommended minimums) ────────

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,
};

// ── POST /api/auth/register ────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'Validation failed.', 422, parsed.error.flatten().fieldErrors);
    return;
  }

  const { username, password } = parsed.data;

  // Check uniqueness before expensive hashing
  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 LIMIT 1',
    [username],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    sendError(res, 'Username is already taken.', 409);
    return;
  }

  // Hash the login password with Argon2id
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  // Generate a random 32-byte (256-bit) encryption salt.
  // This is sent to the client in plaintext — its only job is to
  // make PBKDF2 key derivation unique per user. It is NOT a secret.
  const encryptionSalt = randomBytes(32).toString('hex');

  const result = await pool.query<UserRow>(
    `INSERT INTO users (username, password_hash, encryption_salt)
     VALUES ($1, $2, $3)
     RETURNING id, username, encryption_salt, created_at`,
    [username, passwordHash, encryptionSalt],
  );

  const user = result.rows[0];
  const token = signToken(user.id);
  setAuthCookie(res, token);

  sendSuccess(
    res,
    {
      user: {
        id: user.id,
        username: user.username,
        // Returned immediately so the client can begin encrypting right away
        encryption_salt: user.encryption_salt,
        created_at: user.created_at,
      },
    },
    201,
  );
});

// ── POST /api/auth/login ───────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    // Generic message to avoid username-enumeration via validation errors
    sendError(res, 'Invalid credentials.', 401);
    return;
  }

  const { username, password } = parsed.data;

  const result = await pool.query<UserRow>(
    `SELECT id, username, password_hash, encryption_salt, created_at
     FROM users WHERE username = $1 LIMIT 1`,
    [username],
  );

  const user = result.rows[0];

  // Always run verifyHash even if user not found to prevent timing attacks
  const dummyHash =
    '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$dGVzdGhhc2g=';
  const hashToVerify = user?.password_hash ?? dummyHash;

  const isValid = await argon2.verify(hashToVerify, password);

  if (!user || !isValid) {
    sendError(res, 'Invalid username or password.', 401);
    return;
  }

  const token = signToken(user.id);
  setAuthCookie(res, token);

  sendSuccess(res, {
    user: {
      id: user.id,
      username: user.username,
      // The client NEEDS the salt to re-derive the encryption key
      encryption_salt: user.encryption_salt,
      created_at: user.created_at,
    },
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────

router.post(
  '/logout',
  requireAuth as unknown as (req: Request, res: Response, next: () => void) => void,
  (_req: Request, res: Response): void => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    sendSuccess(res, { message: 'Logged out successfully.' });
  },
);

// ── GET /api/auth/me ───────────────────────────────────────────
// Lets the client verify its session and retrieve the salt without
// requiring the user to log in again.

router.get(
  '/me',
  requireAuth as unknown as (req: Request, res: Response, next: () => void) => void,
  async (req: Request, res: Response): Promise<void> => {
    const { sub } = (req as AuthenticatedRequest).user;

    const result = await pool.query<Pick<UserRow, 'id' | 'username' | 'encryption_salt' | 'created_at'>>(
      'SELECT id, username, encryption_salt, created_at FROM users WHERE id = $1 LIMIT 1',
      [sub],
    );

    if (!result.rows[0]) {
      res.clearCookie(COOKIE_NAME);
      sendError(res, 'User not found.', 404);
      return;
    }

    sendSuccess(res, { user: result.rows[0] });
  },
);

export default router;
