package middleware

import (
	"net/http"
	"slices"
)

// CORS returns a middleware that enforces a strict, explicit-origin CORS policy.
//
// Security properties:
//   - Uses an allowlist rather than a wildcard ("*") — credentials require this.
//   - Sets Vary: Origin so caches do not serve one origin's response to another.
//   - Only permits the exact methods and headers the frontend uses.
//   - Handles preflight OPTIONS requests inline, returning 204 No Content.
//
// allowedOrigins is read from the CORS_ORIGINS env variable (comma-separated).
// Example value: "https://notes.example.com,https://my-app.vercel.app"
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// Always set Vary regardless of whether the origin matches,
			// so intermediate caches understand this response is origin-specific.
			w.Header().Add("Vary", "Origin")

			if origin != "" && slices.Contains(allowedOrigins, origin) {
				// Reflect the exact origin (never "*") — required when
				// credentials: 'include' is used by the browser.
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				// Cache preflight result for 1 hour
				w.Header().Set("Access-Control-Max-Age", "3600")
			}

			// Short-circuit preflight requests — no body, just headers.
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
