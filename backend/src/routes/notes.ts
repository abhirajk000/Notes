import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import type { AuthenticatedRequest, NoteRow, SyncNoteItem } from '../types';

const router = Router();

// All notes routes require a valid session cookie
router.use(requireAuth as unknown as (req: Request, res: Response, next: () => void) => void);

// ── Validation schemas ─────────────────────────────────────────

/**
 * Base64-encoded 12-byte IV: exactly 16 characters in standard Base64.
 * We accept both standard and URL-safe Base64 variants.
 */
const ivSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/\-_]{16}={0,2}$/, 'IV must be a valid base64-encoded 12-byte value.');

const syncItemSchema = z.object({
  id: z.string().uuid('Note ID must be a valid UUID.'),
  operation: z.enum(['upsert', 'delete']),
  encrypted_title: z.string().optional(),
  encrypted_content: z.string().optional(),
  iv: ivSchema.optional(),
  is_pinned: z.boolean().optional(),
  updated_at: z.string().datetime({ message: 'updated_at must be a valid ISO-8601 datetime.' }),
});

const syncBodySchema = z.object({
  notes: z
    .array(syncItemSchema)
    .min(1, 'notes array must not be empty.')
    .max(500, 'Maximum 500 notes per sync request.'),
});

// ── GET /api/notes ─────────────────────────────────────────────
// Returns all notes for the authenticated user, ordered by pinned
// status then last-updated descending.

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { sub: userId } = (req as AuthenticatedRequest).user;

  const result = await pool.query<NoteRow>(
    `SELECT id, user_id, encrypted_title, encrypted_content, iv,
            is_pinned, created_at, updated_at
     FROM notes
     WHERE user_id = $1
     ORDER BY is_pinned DESC, updated_at DESC`,
    [userId],
  );

  sendSuccess(res, { notes: result.rows });
});

// ── POST /api/notes/sync ───────────────────────────────────────
// Bulk-sync endpoint implementing Last-Write-Wins (LWW) conflict
// resolution using the `updated_at` timestamp.
//
// Processing logic per item:
//  • operation = "delete"  → hard-delete the note if it belongs to this user.
//  • operation = "upsert"  → INSERT or UPDATE using ON CONFLICT.
//      – For UPDATE: the server row is only replaced when the client's
//        `updated_at` is NEWER than (or equal to) the stored `updated_at`.
//        If the server copy is newer, the item is skipped and added to the
//        `conflicts` list in the response so the client can reconcile.
//
// Everything runs inside a single serializable transaction for atomicity.

router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  const { sub: userId } = (req as AuthenticatedRequest).user;

  const parsed = syncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'Validation failed.', 422, parsed.error.flatten().fieldErrors);
    return;
  }

  const { notes } = parsed.data as { notes: SyncNoteItem[] };

  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const processedIds: string[] = [];
    const skippedIds: string[] = [];
    const conflicts: NoteRow[] = [];

    for (const item of notes) {
      if (item.operation === 'delete') {
        // Only delete notes that belong to this user
        await client.query(
          'DELETE FROM notes WHERE id = $1 AND user_id = $2',
          [item.id, userId],
        );
        processedIds.push(item.id);
        continue;
      }

      // --- operation === 'upsert' ---

      if (!item.encrypted_title || !item.encrypted_content || !item.iv) {
        // Missing required cipher fields — skip this item
        skippedIds.push(item.id);
        continue;
      }

      const clientUpdatedAt = new Date(item.updated_at);

      const upsertResult = await client.query<NoteRow>(
        `INSERT INTO notes (id, user_id, encrypted_title, encrypted_content, iv, is_pinned, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET encrypted_title   = EXCLUDED.encrypted_title,
               encrypted_content = EXCLUDED.encrypted_content,
               iv                = EXCLUDED.iv,
               is_pinned         = EXCLUDED.is_pinned,
               updated_at        = EXCLUDED.updated_at
           -- Last-Write-Wins: only update if client timestamp is newer
           WHERE notes.user_id = $2
             AND EXCLUDED.updated_at >= notes.updated_at
         RETURNING id, user_id, encrypted_title, encrypted_content, iv,
                   is_pinned, created_at, updated_at`,
        [
          item.id,
          userId,
          item.encrypted_title,
          item.encrypted_content,
          item.iv,
          item.is_pinned ?? false,
          clientUpdatedAt.toISOString(),
        ],
      );

      if (upsertResult.rowCount && upsertResult.rowCount > 0) {
        processedIds.push(item.id);
      } else {
        // Either the note belongs to another user, or the server version is newer.
        // Return the current server copy so the client can update its local state.
        const serverRow = await client.query<NoteRow>(
          `SELECT id, user_id, encrypted_title, encrypted_content, iv,
                  is_pinned, created_at, updated_at
           FROM notes WHERE id = $1 AND user_id = $2 LIMIT 1`,
          [item.id, userId],
        );

        if (serverRow.rows[0]) {
          conflicts.push(serverRow.rows[0]);
        } else {
          // Note doesn't exist on server (possible race condition or wrong user_id)
          skippedIds.push(item.id);
        }
      }
    }

    await client.query('COMMIT');

    sendSuccess(res, {
      processed: processedIds,
      conflicts,
      skipped: skippedIds,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── DELETE /api/notes/:id ──────────────────────────────────────
// Convenience single-note delete endpoint.

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { sub: userId } = (req as AuthenticatedRequest).user;
  const id = req.params['id'] as string;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    sendError(res, 'Invalid note ID.', 400);
    return;
  }

  const result = await pool.query(
    'DELETE FROM notes WHERE id = $1 AND user_id = $2',
    [id, userId],
  );

  if (!result.rowCount || result.rowCount === 0) {
    sendError(res, 'Note not found.', 404);
    return;
  }

  sendSuccess(res, { deleted: id });
});

export default router;
