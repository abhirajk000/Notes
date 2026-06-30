package handler

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/securenotes/backend/internal/middleware"
)

// NotesHandler groups all HTTP handlers for note endpoints.
type NotesHandler struct {
	db *sql.DB
}

func NewNotesHandler(db *sql.DB) *NotesHandler {
	return &NotesHandler{db: db}
}

// ── Model types ───────────────────────────────────────────────────

// noteRow mirrors the full notes table row.
type noteRow struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	EncryptedTitle   string    `json:"encrypted_title"`
	EncryptedContent string    `json:"encrypted_content"`
	IV               string    `json:"iv"`
	SyncStatus       string    `json:"sync_status"`
	IsPinned         bool      `json:"is_pinned"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// noteMeta carries just the reconciliation fields (no ciphertext).
type noteMeta struct {
	ID        string    `json:"id"`
	UpdatedAt time.Time `json:"updated_at"`
}

// syncItem is a single operation in the client's sync payload.
type syncItem struct {
	ID               string    `json:"id"`
	EncryptedTitle   string    `json:"encrypted_title"`
	EncryptedContent string    `json:"encrypted_content"`
	IV               string    `json:"iv"`
	IsPinned         bool      `json:"is_pinned"`
	UpdatedAt        time.Time `json:"updated_at"`
	// Deleted signals the server to hard-delete this note.
	// LWW applies: deletion is only committed if the server version is not newer.
	Deleted bool `json:"deleted"`
}

// ── GET /api/notes ────────────────────────────────────────────────

// List returns all notes for the authenticated user, ordered by pinned ↓ then
// updated_at ↓. The response contains full ciphertext payloads.
func (h *NotesHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, user_id, encrypted_title, encrypted_content, iv,
		       sync_status, is_pinned, created_at, updated_at
		FROM   notes
		WHERE  user_id = $1
		ORDER  BY is_pinned DESC, updated_at DESC`, userID)
	if err != nil {
		log.Printf("[notes] list query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	notes := make([]noteRow, 0)
	for rows.Next() {
		var n noteRow
		if err = rows.Scan(&n.ID, &n.UserID, &n.EncryptedTitle, &n.EncryptedContent,
			&n.IV, &n.SyncStatus, &n.IsPinned, &n.CreatedAt, &n.UpdatedAt); err != nil {
			log.Printf("[notes] list scan: %v", err)
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
		notes = append(notes, n)
	}
	if err = rows.Err(); err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]any{"notes": notes})
}

// ── GET /api/notes/meta ───────────────────────────────────────────

// Meta returns lightweight reconciliation metadata: only {id, updated_at} for
// each note. The frontend uses this to decide which notes to download and which
// to push, without transferring ciphertext it doesn't need.
func (h *NotesHandler) Meta(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(),
		"SELECT id, updated_at FROM notes WHERE user_id = $1 ORDER BY updated_at DESC",
		userID)
	if err != nil {
		log.Printf("[notes] meta query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	metas := make([]noteMeta, 0)
	for rows.Next() {
		var m noteMeta
		if err = rows.Scan(&m.ID, &m.UpdatedAt); err != nil {
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
		metas = append(metas, m)
	}

	sendSuccess(w, map[string]any{"notes": metas})
}

// ── POST /api/notes/batch ─────────────────────────────────────────

// Batch fetches full payloads for a specific list of note IDs.
// Used by the client after Meta() to download notes that are newer on the server.
// Only returns notes that actually belong to the authenticated user.
func (h *NotesHandler) Batch(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	var body struct {
		IDs []string `json:"ids"`
	}
	if err := readJSON(w, r, &body); err != nil || len(body.IDs) == 0 {
		sendError(w, "ids array is required.", http.StatusBadRequest)
		return
	}
	if len(body.IDs) > 500 {
		sendError(w, "Maximum 500 IDs per batch request.", http.StatusBadRequest)
		return
	}

	// Validate UUIDs before passing to SQL to prevent injection
	for _, id := range body.IDs {
		if _, err := uuid.Parse(id); err != nil {
			sendError(w, "Invalid UUID in ids array.", http.StatusBadRequest)
			return
		}
	}

	// Build a parameterised ANY($1) query using PostgreSQL's array syntax
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, user_id, encrypted_title, encrypted_content, iv,
		       sync_status, is_pinned, created_at, updated_at
		FROM   notes
		WHERE  user_id = $1
		  AND  id = ANY($2::uuid[])`, userID, stringSliceToPGArray(body.IDs))
	if err != nil {
		log.Printf("[notes] batch query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	notes := make([]noteRow, 0)
	for rows.Next() {
		var n noteRow
		if err = rows.Scan(&n.ID, &n.UserID, &n.EncryptedTitle, &n.EncryptedContent,
			&n.IV, &n.SyncStatus, &n.IsPinned, &n.CreatedAt, &n.UpdatedAt); err != nil {
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
		notes = append(notes, n)
	}

	sendSuccess(w, map[string]any{"notes": notes})
}

// ── POST /api/notes/sync ─────────────────────────────────────────
//
// Zero-Knowledge Bulk Sync with Last-Write-Wins (LWW) conflict resolution.
//
// The server acts as a "blind vault" — it stores and compares timestamps on
// ciphertext blobs. It never decrypts, derives keys, or sees plaintext.
//
// LWW rules:
//   - UPSERT: Only overwrite a row when the incoming updated_at is strictly
//     NEWER than the stored one. If the server's copy is newer, that note is
//     added to the `conflicts` list so the client can reconcile.
//   - DELETE: Only hard-delete if the incoming updated_at is >= the server
//     copy's updated_at. Otherwise the server's copy is newer (a concurrent
//     update happened), so the deletion is rejected as a conflict.
//
// The entire operation runs inside a SERIALIZABLE transaction for atomicity.
func (h *NotesHandler) Sync(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	var body struct {
		Notes []syncItem `json:"notes"`
	}
	if err := readJSON(w, r, &body); err != nil {
		sendError(w, "Invalid request body.", http.StatusBadRequest)
		return
	}
	if len(body.Notes) == 0 {
		sendError(w, "notes array must not be empty.", http.StatusBadRequest)
		return
	}
	if len(body.Notes) > 500 {
		sendError(w, "Maximum 500 notes per sync request.", http.StatusBadRequest)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		log.Printf("[notes] sync begin tx: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	processed := make([]string, 0)
	conflicts := make([]noteRow, 0)
	skipped := make([]string, 0)

	for _, item := range body.Notes {
		// Validate UUID
		if _, parseErr := uuid.Parse(item.ID); parseErr != nil {
			skipped = append(skipped, item.ID)
			continue
		}

		if item.Deleted {
			err = h.processDeletion(r, tx, userID, item, &processed, &skipped, &conflicts)
		} else {
			err = h.processUpsert(r, tx, userID, item, &processed, &skipped, &conflicts)
		}

		if err != nil {
			log.Printf("[notes] sync item %s: %v", item.ID, err)
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
	}

	if err = tx.Commit(); err != nil {
		log.Printf("[notes] sync commit: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]any{
		"processed": processed,
		"conflicts": conflicts,
		"skipped":   skipped,
	})
}

// processUpsert handles an "upsert" sync item inside an open transaction.
//
// The critical SQL uses ON CONFLICT ... WHERE to implement LWW atomically:
//   - If the row does NOT exist: INSERT it.
//   - If the row exists AND client's updated_at > server's updated_at: UPDATE it.
//   - If the row exists AND client's updated_at <= server's updated_at: no-op
//     (the WHERE clause prevents the update). Fetch and return the server row
//     in the conflicts list.
func (h *NotesHandler) processUpsert(
	r *http.Request,
	tx *sql.Tx,
	userID string,
	item syncItem,
	processed, skipped *[]string,
	conflicts *[]noteRow,
) error {
	if item.EncryptedTitle == "" || item.EncryptedContent == "" || item.IV == "" {
		*skipped = append(*skipped, item.ID)
		return nil
	}

	var returnedID string
	err := tx.QueryRowContext(r.Context(), `
		INSERT INTO notes (id, user_id, encrypted_title, encrypted_content, iv, sync_status, is_pinned, updated_at)
		VALUES            ($1, $2,      $3,               $4,                $5, 'synced',     $6,        $7)
		ON CONFLICT (id) DO UPDATE
		  SET encrypted_title   = EXCLUDED.encrypted_title,
		      encrypted_content = EXCLUDED.encrypted_content,
		      iv                = EXCLUDED.iv,
		      sync_status       = 'synced',
		      is_pinned         = EXCLUDED.is_pinned,
		      updated_at        = EXCLUDED.updated_at
		  -- LWW gate: only overwrite if client version is strictly newer
		  WHERE notes.user_id   = $2
		    AND EXCLUDED.updated_at > notes.updated_at
		RETURNING id`,
		item.ID, userID,
		item.EncryptedTitle, item.EncryptedContent, item.IV,
		item.IsPinned, item.UpdatedAt,
	).Scan(&returnedID)

	switch err {
	case nil:
		// Row was inserted or updated — client version won
		*processed = append(*processed, returnedID)
	case sql.ErrNoRows:
		// No row returned: server copy is newer or note belongs to another user
		var serverNote noteRow
		qErr := tx.QueryRowContext(r.Context(), `
			SELECT id, user_id, encrypted_title, encrypted_content, iv,
			       sync_status, is_pinned, created_at, updated_at
			FROM   notes
			WHERE  id = $1 AND user_id = $2 LIMIT 1`,
			item.ID, userID,
		).Scan(&serverNote.ID, &serverNote.UserID, &serverNote.EncryptedTitle,
			&serverNote.EncryptedContent, &serverNote.IV, &serverNote.SyncStatus,
			&serverNote.IsPinned, &serverNote.CreatedAt, &serverNote.UpdatedAt)
		if qErr == sql.ErrNoRows {
			// Note doesn't exist server-side at all (e.g. race condition)
			*skipped = append(*skipped, item.ID)
		} else if qErr != nil {
			return qErr
		} else {
			// Server note exists and is newer → conflict
			*conflicts = append(*conflicts, serverNote)
		}
	default:
		return err
	}
	return nil
}

// processDeletion handles a "delete" sync item inside an open transaction.
//
// LWW deletion rule: Only delete when the client's updated_at is >= server's.
// If the server's copy is newer, the deletion is refused and the server's
// current version is returned as a conflict.
func (h *NotesHandler) processDeletion(
	r *http.Request,
	tx *sql.Tx,
	userID string,
	item syncItem,
	processed, skipped *[]string,
	conflicts *[]noteRow,
) error {
	result, err := tx.ExecContext(r.Context(), `
		DELETE FROM notes
		WHERE  id = $1
		  AND  user_id = $2
		  AND  updated_at <= $3`,
		item.ID, userID, item.UpdatedAt,
	)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if affected == 1 {
		*processed = append(*processed, item.ID)
		return nil
	}

	// Zero rows deleted: either doesn't exist or server is newer
	var serverNote noteRow
	qErr := tx.QueryRowContext(r.Context(), `
		SELECT id, user_id, encrypted_title, encrypted_content, iv,
		       sync_status, is_pinned, created_at, updated_at
		FROM   notes
		WHERE  id = $1 AND user_id = $2 LIMIT 1`,
		item.ID, userID,
	).Scan(&serverNote.ID, &serverNote.UserID, &serverNote.EncryptedTitle,
		&serverNote.EncryptedContent, &serverNote.IV, &serverNote.SyncStatus,
		&serverNote.IsPinned, &serverNote.CreatedAt, &serverNote.UpdatedAt)

	switch qErr {
	case nil:
		// Note exists on server with a newer updated_at — reject deletion
		*conflicts = append(*conflicts, serverNote)
	case sql.ErrNoRows:
		// Note was already deleted server-side — treat as success
		*processed = append(*processed, item.ID)
	default:
		return qErr
	}
	return nil
}

// ── DELETE /api/notes/{id} ────────────────────────────────────────

// Delete hard-deletes a single note.
func (h *NotesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())
	noteID := r.PathValue("id")

	if _, err := uuid.Parse(noteID); err != nil {
		sendError(w, "Invalid note ID.", http.StatusBadRequest)
		return
	}

	result, err := h.db.ExecContext(r.Context(),
		"DELETE FROM notes WHERE id = $1 AND user_id = $2", noteID, userID)
	if err != nil {
		log.Printf("[notes] delete: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		sendError(w, "Note not found.", http.StatusNotFound)
		return
	}

	sendSuccess(w, map[string]any{"deleted": noteID})
}

// ── Utility ───────────────────────────────────────────────────────

// stringSliceToPGArray converts []string → PostgreSQL text-array literal
// e.g. {"uuid1","uuid2"} suitable for use with $N::uuid[]
func stringSliceToPGArray(ss []string) string {
	if len(ss) == 0 {
		return "{}"
	}
	b := make([]byte, 0, 2+len(ss)*38)
	b = append(b, '{')
	for i, s := range ss {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, '"')
		b = append(b, []byte(s)...)
		b = append(b, '"')
	}
	b = append(b, '}')
	return string(b)
}
