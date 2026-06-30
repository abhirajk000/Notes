package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	dbpkg "github.com/securenotes/backend/internal/db"
	"github.com/securenotes/backend/internal/config"
	"github.com/securenotes/backend/internal/handler"
	"github.com/securenotes/backend/internal/middleware"
)

func main() {
	// Load .env file in development (ignored if the file is absent in production)
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[startup] config error: %v", err)
	}

	pool, err := dbpkg.Open(cfg.DatabaseURL, cfg.Production)
	if err != nil {
		log.Fatalf("[startup] database error: %v", err)
	}
	defer pool.Close()
	log.Println("[startup] connected to PostgreSQL")

	// ── Handlers ───────────────────────────────────────────────
	authH := handler.NewAuthHandler(
		pool, cfg.JWTSecret, cfg.JWTExpiry, cfg.CookieDomain, cfg.Production,
	)
	notesH := handler.NewNotesHandler(pool)

	// ── Middleware chain helpers ────────────────────────────────
	corsM := middleware.CORS(cfg.CORSOrigins)
	authM := middleware.RequireAuth(cfg.JWTSecret)

	// chain applies middlewares right-to-left (outermost first in execution)
	chain := func(h http.Handler, ms ...func(http.Handler) http.Handler) http.Handler {
		for i := len(ms) - 1; i >= 0; i-- {
			h = ms[i](h)
		}
		return h
	}
	// requireAuth is a convenience for the common pattern
	authChain := func(h http.HandlerFunc) http.Handler {
		return chain(h, corsM, authM)
	}

	// ── Router (Go 1.22 enhanced ServeMux) ─────────────────────
	mux := http.NewServeMux()

	// Health check (no auth)
	mux.Handle("GET /health", corsM(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"ts":"%s"}`, time.Now().UTC().Format(time.RFC3339))
	})))

	// Preflight handler for all paths — CORS middleware handles the actual response
	mux.Handle("OPTIONS /", corsM(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})))

	// Auth routes (no session required)
	mux.Handle("POST /api/auth/register", chain(http.HandlerFunc(authH.Register), corsM))
	mux.Handle("POST /api/auth/login", chain(http.HandlerFunc(authH.Login), corsM))
	mux.Handle("POST /api/auth/logout", authChain(authH.Logout))
	mux.Handle("GET /api/auth/me", authChain(authH.Me))

	// Notes routes (session required)
	mux.Handle("GET /api/notes", authChain(notesH.List))
	mux.Handle("GET /api/notes/meta", authChain(notesH.Meta))
	mux.Handle("POST /api/notes/batch", authChain(notesH.Batch))
	mux.Handle("POST /api/notes/sync", authChain(notesH.Sync))
	mux.Handle("DELETE /api/notes/{id}", authChain(notesH.Delete))

	// ── HTTP server with hardened timeouts ──────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second, // generous for PBKDF2-heavy sync requests
		IdleTimeout:  120 * time.Second,
	}

	// ── Graceful shutdown ───────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[startup] server listening on :%s (production=%v)", cfg.Port, cfg.Production)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[server] ListenAndServe: %v", err)
		}
	}()

	<-quit
	log.Println("[shutdown] signal received, draining connections…")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[shutdown] forced: %v", err)
	}
	log.Println("[shutdown] complete")
}
