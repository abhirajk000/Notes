package handler

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"

	"github.com/securenotes/backend/internal/middleware"
)

// ── Argon2id configuration (OWASP 2024 minimums) ────────────────

const (
	argon2Memory      = 64 * 1024 // 64 MiB
	argon2Iterations  = 3
	argon2Parallelism = 4
	argon2SaltLen     = 16
	argon2KeyLen      = 32
)

// ── AuthHandler ──────────────────────────────────────────────────

// AuthHandler groups the HTTP handlers for authentication endpoints.
// Dependencies are constructor-injected for testability.
type AuthHandler struct {
	db              *sql.DB
	jwtSecret       []byte
	jwtExpiry       time.Duration
	cookieDomain    string
	production      bool
	allowedUsername string
	maxUsers        int
}

func NewAuthHandler(
	db *sql.DB,
	jwtSecret []byte,
	jwtExpiry time.Duration,
	cookieDomain string,
	production bool,
	allowedUsername string,
	maxUsers int,
) *AuthHandler {
	return &AuthHandler{
		db:              db,
		jwtSecret:       jwtSecret,
		jwtExpiry:       jwtExpiry,
		cookieDomain:    cookieDomain,
		production:      production,
		allowedUsername: allowedUsername,
		maxUsers:        maxUsers,
	}
}

// ── Input validation ──────────────────────────────────────────────

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,64}$`)

type registerInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (i *registerInput) validate() map[string]string {
	errs := make(map[string]string)
	if !usernameRe.MatchString(i.Username) {
		errs["username"] = "Must be 3–64 chars, letters/numbers/_ only."
	}
	if len(i.Password) < 12 {
		errs["password"] = "Must be at least 12 characters."
	}
	if len(i.Password) > 128 {
		errs["password"] = "Must be at most 128 characters."
	}
	return errs
}

type loginInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// isOwnerUsername returns true when the username matches the configured owner.
// When ALLOWED_USERNAME is unset, all usernames are permitted (dev mode).
func (h *AuthHandler) isOwnerUsername(username string) bool {
	if h.allowedUsername == "" {
		return true
	}
	return strings.EqualFold(username, h.allowedUsername)
}

func (h *AuthHandler) countUsers(ctx context.Context) (int, error) {
	var count int
	err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

// ── Handlers ──────────────────────────────────────────────────────

// Register — POST /api/auth/register
// Private instance: only ALLOWED_USERNAME may register, and only while under MAX_USERS.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var in registerInput
	if err := readJSON(w, r, &in); err != nil {
		sendError(w, "Invalid request body.", http.StatusBadRequest)
		return
	}

	if errs := in.validate(); len(errs) > 0 {
		sendValidationError(w, errs)
		return
	}

	if !h.isOwnerUsername(in.Username) {
		sendError(w, "Registration is disabled for this private instance.", http.StatusForbidden)
		return
	}

	userCount, err := h.countUsers(r.Context())
	if err != nil {
		log.Printf("[auth] register count users: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	if userCount >= h.maxUsers {
		sendError(w, "Registration is closed. This is a private single-user vault.", http.StatusForbidden)
		return
	}

	// Check uniqueness before the expensive hash
	var exists bool
	err = h.db.QueryRowContext(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))", in.Username,
	).Scan(&exists)
	if err != nil {
		log.Printf("[auth] register uniqueness check: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	if exists {
		sendError(w, "Username is already taken.", http.StatusConflict)
		return
	}

	passwordHash, err := hashPassword(in.Password)
	if err != nil {
		log.Printf("[auth] hashPassword: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	// Random 32-byte (256-bit) public salt for client PBKDF2 key derivation.
	saltBytes := make([]byte, 32)
	if _, err = rand.Read(saltBytes); err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	encryptionSalt := hex.EncodeToString(saltBytes)

	var userID, username, salt string
	var createdAt time.Time
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO users (username, password_hash, encryption_salt)
         VALUES ($1, $2, $3)
         RETURNING id, username, encryption_salt, created_at`,
		in.Username, passwordHash, encryptionSalt,
	).Scan(&userID, &username, &salt, &createdAt)
	if err != nil {
		log.Printf("[auth] insert user: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	token, err := h.signToken(userID)
	if err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	h.setAuthCookie(w, token)

	sendCreated(w, map[string]any{
		"user": map[string]any{
			"id":              userID,
			"username":        username,
			"encryption_salt": salt,
			"created_at":      createdAt,
		},
	})
}

// Login — POST /api/auth/login
// Private instance: only ALLOWED_USERNAME may authenticate.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if err := readJSON(w, r, &in); err != nil {
		sendError(w, "Invalid credentials.", http.StatusUnauthorized)
		return
	}

	if !h.isOwnerUsername(in.Username) {
		sendError(w, "Invalid username or password.", http.StatusUnauthorized)
		return
	}

	type userRow struct {
		id             string
		username       string
		passwordHash   string
		encryptionSalt string
		createdAt      time.Time
	}

	var u userRow
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, username, password_hash, encryption_salt, created_at
         FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
		in.Username,
	).Scan(&u.id, &u.username, &u.passwordHash, &u.encryptionSalt, &u.createdAt)

	// Constant-time path: always run verifyPassword to prevent timing attacks.
	// If the user is not found we verify against a dummy hash.
	hashToVerify := u.passwordHash
	if err == sql.ErrNoRows {
		hashToVerify = dummyHash
	} else if err != nil {
		log.Printf("[auth] login query: %v", err)
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	ok, vErr := verifyPassword(in.Password, hashToVerify)
	if vErr != nil {
		log.Printf("[auth] verifyPassword: %v", vErr)
	}

	if err == sql.ErrNoRows || !ok {
		sendError(w, "Invalid username or password.", http.StatusUnauthorized)
		return
	}

	token, err := h.signToken(u.id)
	if err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	h.setAuthCookie(w, token)

	sendSuccess(w, map[string]any{
		"user": map[string]any{
			"id":              u.id,
			"username":        u.username,
			"encryption_salt": u.encryptionSalt,
			"created_at":      u.createdAt,
		},
	})
}

// Logout — POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	c := &http.Cookie{
		Name:     "token",
		Value:    "",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.production,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
	}
	if h.cookieDomain != "" {
		c.Domain = h.cookieDomain
	}
	http.SetCookie(w, c)
	sendSuccess(w, map[string]any{"message": "Logged out successfully."})
}

// Status — GET /api/auth/status (public)
// Tells the frontend whether registration is still open.
func (h *AuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	count, err := h.countUsers(r.Context())
	if err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}
	sendSuccess(w, map[string]any{
		"registrationOpen": count < h.maxUsers,
		"hasAccount":       count > 0,
		"maxUsers":         h.maxUsers,
	})
}

// Me — GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserIDFromCtx(r.Context())

	var id, username, salt string
	var createdAt time.Time
	err := h.db.QueryRowContext(r.Context(),
		"SELECT id, username, encryption_salt, created_at FROM users WHERE id = $1 LIMIT 1",
		userID,
	).Scan(&id, &username, &salt, &createdAt)
	if err == sql.ErrNoRows {
		http.SetCookie(w, &http.Cookie{Name: "token", MaxAge: -1, Path: "/"})
		sendError(w, "User not found.", http.StatusNotFound)
		return
	}
	if err != nil {
		sendError(w, "Internal server error.", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]any{
		"user": map[string]any{
			"id":              id,
			"username":        username,
			"encryption_salt": salt,
			"created_at":      createdAt,
		},
	})
}

// ── JWT helpers ───────────────────────────────────────────────────

func (h *AuthHandler) signToken(userID string) (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(h.jwtExpiry)),
		ID:        uuid.NewString(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(h.jwtSecret)
}

func (h *AuthHandler) setAuthCookie(w http.ResponseWriter, token string) {
	c := &http.Cookie{
		Name:     "token",
		Value:    token,
		MaxAge:   int(h.jwtExpiry.Seconds()),
		HttpOnly: true,
		Secure:   h.production,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
	}
	if h.cookieDomain != "" {
		c.Domain = h.cookieDomain
	}
	http.SetCookie(w, c)
}

// ── Argon2id password hashing ────────────────────────────────────

// dummyHash is used during login for users that don't exist, ensuring
// constant-time verification and preventing username enumeration via timing.
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHRzYWx0$dGVzdGhhc2h0ZXN0aGFzaA"

func hashPassword(password string) (string, error) {
	salt := make([]byte, argon2SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey(
		[]byte(password), salt,
		argon2Iterations, argon2Memory, argon2Parallelism, argon2KeyLen,
	)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argon2Memory, argon2Iterations, argon2Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func verifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// Expected: ["", "argon2id", "v=19", "m=...,t=...,p=...", "<salt>", "<hash>"]
	if len(parts) != 6 {
		return false, fmt.Errorf("invalid hash format: expected 6 parts, got %d", len(parts))
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("parse version: %w", err)
	}

	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false, fmt.Errorf("parse params: %w", err)
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("decode salt: %w", err)
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("decode hash: %w", err)
	}

	actualHash := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(expectedHash)))
	return subtle.ConstantTimeCompare(expectedHash, actualHash) == 1, nil
}
