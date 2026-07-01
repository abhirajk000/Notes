package handler

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/securenotes/backend/internal/middleware"
)

// VaultCardsHandler groups HTTP handlers for encrypted vault card endpoints.
type VaultCardsHandler struct {
	db *sql.DB
}

func NewVaultCardsHandler(db *sql.DB) *VaultCardsHandler {
	return &VaultCardsHandler{db: db}
}

type vaultCardRow struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	EncryptedTitle   string    `json:"encrypted_title"`
	EncryptedContent string    `json:"encrypted_content"`
	IV               string    `json:"iv"`
	SyncStatus       string    `json:"sync_status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type vaultCardMeta struct {
	ID        string    `json:"id"`
	UpdatedAt time.Time `json:"updated_at"`
}

type vaultCardSyncItem struct {
	ID               string    `json:"id"`
	EncryptedTitle   string    `json:"encrypted_title"`
	EncryptedContent string    `json:"encrypted_content"`
	IV               string    `json:"iv"`
	UpdatedAt        time.Time `json:"updated_at"`
	Deleted          bool      `json:"deleted"`
}

// Meta — GET /api/vault/cards/meta
func (h *VaultCardsHandler) Meta(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(),
		"SELECT id, updated_at FROM vault_cards WHERE user_id = $1 ORDER BY updated_at DESC",
		userID)
	if err != nil {
		log.Printf("[vault_cards] meta query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	metas := make([]vaultCardMeta, 0)
	for rows.Next() {
		var m vaultCardMeta
		if err = rows.Scan(&m.ID, &m.UpdatedAt); err != nil {
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
		metas = append(metas, m)
	}

	sendSuccess(w, map[string]any{"cards": metas})
}

// Batch — POST /api/vault/cards/batch
func (h *VaultCardsHandler) Batch(w http.ResponseWriter, r *http.Request) {
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

	for _, id := range body.IDs {
		if _, err := uuid.Parse(id); err != nil {
			sendError(w, "Invalid UUID in ids array.", http.StatusBadRequest)
			return
		}
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, user_id, encrypted_title, encrypted_content, iv,
		       sync_status, created_at, updated_at
		FROM   vault_cards
		WHERE  user_id = $1
		  AND  id = ANY($2::uuid[])`, userID, stringSliceToPGArray(body.IDs))
	if err != nil {
		log.Printf("[vault_cards] batch query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	cards := make([]vaultCardRow, 0)
	for rows.Next() {
		var c vaultCardRow
		if err = rows.Scan(&c.ID, &c.UserID, &c.EncryptedTitle, &c.EncryptedContent,
			&c.IV, &c.SyncStatus, &c.CreatedAt, &c.UpdatedAt); err != nil {
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
		cards = append(cards, c)
	}

	sendSuccess(w, map[string]any{"cards": cards})
}

// Sync — POST /api/vault/cards/sync
func (h *VaultCardsHandler) Sync(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	var body struct {
		Cards []vaultCardSyncItem `json:"cards"`
	}
	if err := readJSON(w, r, &body); err != nil {
		sendError(w, "Invalid request body.", http.StatusBadRequest)
		return
	}
	if len(body.Cards) == 0 {
		sendError(w, "cards array must not be empty.", http.StatusBadRequest)
		return
	}
	if len(body.Cards) > 500 {
		sendError(w, "Maximum 500 cards per sync request.", http.StatusBadRequest)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		log.Printf("[vault_cards] sync begin tx: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	processed := make([]string, 0)
	conflicts := make([]vaultCardRow, 0)
	skipped := make([]string, 0)

	for _, item := range body.Cards {
		if _, parseErr := uuid.Parse(item.ID); parseErr != nil {
			skipped = append(skipped, item.ID)
			continue
		}

		if item.Deleted {
			err = h.processCardDeletion(r, tx, userID, item, &processed, &skipped, &conflicts)
		} else {
			err = h.processCardUpsert(r, tx, userID, item, &processed, &skipped, &conflicts)
		}

		if err != nil {
			log.Printf("[vault_cards] sync item %s: %v", item.ID, err)
			sendError(w, "Internal server error.", http.StatusInternalServerError)
			return
		}
	}

	if err = tx.Commit(); err != nil {
		log.Printf("[vault_cards] sync commit: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]any{
		"processed": processed,
		"conflicts": conflicts,
		"skipped":   skipped,
	})
}

func (h *VaultCardsHandler) processCardUpsert(
	r *http.Request,
	tx *sql.Tx,
	userID string,
	item vaultCardSyncItem,
	processed, skipped *[]string,
	conflicts *[]vaultCardRow,
) error {
	if item.EncryptedTitle == "" || item.EncryptedContent == "" || item.IV == "" {
		*skipped = append(*skipped, item.ID)
		return nil
	}

	var returnedID string
	err := tx.QueryRowContext(r.Context(), `
		INSERT INTO vault_cards (id, user_id, encrypted_title, encrypted_content, iv, sync_status, updated_at)
		VALUES                  ($1, $2,      $3,               $4,                $5, 'synced',     $6)
		ON CONFLICT (id) DO UPDATE
		  SET encrypted_title   = EXCLUDED.encrypted_title,
		      encrypted_content = EXCLUDED.encrypted_content,
		      iv                = EXCLUDED.iv,
		      sync_status       = 'synced',
		      updated_at        = EXCLUDED.updated_at
		  WHERE vault_cards.user_id = $2
		    AND EXCLUDED.updated_at > vault_cards.updated_at
		RETURNING id`,
		item.ID, userID,
		item.EncryptedTitle, item.EncryptedContent, item.IV,
		item.UpdatedAt,
	).Scan(&returnedID)

	switch err {
	case nil:
		*processed = append(*processed, returnedID)
	case sql.ErrNoRows:
		var serverCard vaultCardRow
		qErr := tx.QueryRowContext(r.Context(), `
			SELECT id, user_id, encrypted_title, encrypted_content, iv,
			       sync_status, created_at, updated_at
			FROM   vault_cards
			WHERE  id = $1 AND user_id = $2 LIMIT 1`,
			item.ID, userID,
		).Scan(&serverCard.ID, &serverCard.UserID, &serverCard.EncryptedTitle,
			&serverCard.EncryptedContent, &serverCard.IV, &serverCard.SyncStatus,
			&serverCard.CreatedAt, &serverCard.UpdatedAt)
		if qErr == sql.ErrNoRows {
			*skipped = append(*skipped, item.ID)
		} else if qErr != nil {
			return qErr
		} else {
			*conflicts = append(*conflicts, serverCard)
		}
	default:
		return err
	}
	return nil
}

func (h *VaultCardsHandler) processCardDeletion(
	r *http.Request,
	tx *sql.Tx,
	userID string,
	item vaultCardSyncItem,
	processed, skipped *[]string,
	conflicts *[]vaultCardRow,
) error {
	result, err := tx.ExecContext(r.Context(), `
		DELETE FROM vault_cards
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

	var serverCard vaultCardRow
	qErr := tx.QueryRowContext(r.Context(), `
		SELECT id, user_id, encrypted_title, encrypted_content, iv,
		       sync_status, created_at, updated_at
		FROM   vault_cards
		WHERE  id = $1 AND user_id = $2 LIMIT 1`,
		item.ID, userID,
	).Scan(&serverCard.ID, &serverCard.UserID, &serverCard.EncryptedTitle,
		&serverCard.EncryptedContent, &serverCard.IV, &serverCard.SyncStatus,
		&serverCard.CreatedAt, &serverCard.UpdatedAt)

	switch qErr {
	case nil:
		*conflicts = append(*conflicts, serverCard)
	case sql.ErrNoRows:
		*processed = append(*processed, item.ID)
	default:
		return qErr
	}
	return nil
}

// Delete — DELETE /api/vault/cards/{id}
func (h *VaultCardsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())
	cardID := r.PathValue("id")

	if _, err := uuid.Parse(cardID); err != nil {
		sendError(w, "Invalid card ID.", http.StatusBadRequest)
		return
	}

	result, err := h.db.ExecContext(r.Context(),
		"DELETE FROM vault_cards WHERE id = $1 AND user_id = $2", cardID, userID)
	if err != nil {
		log.Printf("[vault_cards] delete: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		sendError(w, "Card not found.", http.StatusNotFound)
		return
	}

	sendSuccess(w, map[string]any{"deleted": cardID})
}
