package middleware

import (
	"context"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
)

// contextKey is an unexported type for context keys in this package,
// preventing collisions with keys defined in other packages.
type contextKey string

// UserIDKey is the context key under which the authenticated user's UUID is stored.
// Handlers retrieve it with: userID := middleware.UserIDFromCtx(r.Context())
const UserIDKey contextKey = "userID"

// UserIDFromCtx retrieves the authenticated user's UUID from the request context.
// Returns ("", false) if the middleware was not applied or authentication failed.
func UserIDFromCtx(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UserIDKey).(string)
	return id, ok && id != ""
}

// RequireAuth returns a middleware that:
//  1. Extracts the "token" HTTP-only cookie from the request.
//  2. Verifies the JWT signature using HMAC-SHA256 and jwtSecret.
//  3. Stores the subject claim (user UUID) in the request context.
//
// On failure, it responds with 401 and clears the invalid cookie so
// the browser does not keep replaying a bad token.
func RequireAuth(jwtSecret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("token")
			if err != nil {
				sendUnauthorized(w, "Authentication required.")
				return
			}

			token, err := jwt.ParseWithClaims(
				cookie.Value,
				&jwt.RegisteredClaims{},
				func(_ *jwt.Token) (interface{}, error) {
					return jwtSecret, nil
				},
				jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			)
			if err != nil || !token.Valid {
				// Clear the stale/tampered cookie
				http.SetCookie(w, &http.Cookie{
					Name:     "token",
					Value:    "",
					MaxAge:   -1,
					HttpOnly: true,
					Path:     "/",
				})
				sendUnauthorized(w, "Session expired or invalid. Please log in again.")
				return
			}

			claims, ok := token.Claims.(*jwt.RegisteredClaims)
			if !ok || claims.Subject == "" {
				sendUnauthorized(w, "Malformed token claims.")
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func sendUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"ok":false,"error":"` + msg + `"}`))
}
