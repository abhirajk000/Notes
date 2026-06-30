package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Config holds all runtime configuration values loaded from environment variables.
// All sensitive values (JWT secret, DB URL) must be present or the server refuses to start.
type Config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    []byte
	JWTExpiry    time.Duration
	// CORSOrigins is the comma-separated list of allowed frontend origins.
	// Example: "https://my-app.vercel.app,https://notes.example.com"
	CORSOrigins  []string
	CookieDomain string
	Production   bool
}

// Load reads all required environment variables and returns a validated Config.
// Returns an error if any required variable is missing.
func Load() (*Config, error) {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required")
	}
	if len(jwtSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	corsRaw := os.Getenv("CORS_ORIGINS")
	if corsRaw == "" {
		corsRaw = "http://localhost:3000"
	}
	var origins []string
	for _, o := range strings.Split(corsRaw, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	jwtExpiryRaw := os.Getenv("JWT_EXPIRY")
	if jwtExpiryRaw == "" {
		jwtExpiryRaw = "168h" // 7 days
	}
	jwtExpiry, err := time.ParseDuration(jwtExpiryRaw)
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_EXPIRY value %q: %w", jwtExpiryRaw, err)
	}

	env := os.Getenv("APP_ENV")

	return &Config{
		Port:         getEnv("PORT", "4000"),
		DatabaseURL:  dbURL,
		JWTSecret:    []byte(jwtSecret),
		JWTExpiry:    jwtExpiry,
		CORSOrigins:  origins,
		CookieDomain: os.Getenv("COOKIE_DOMAIN"),
		Production:   env == "production",
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
