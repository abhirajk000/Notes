package handler

import (
	"encoding/json"
	"log"
	"net/http"
)

// envelope is the standard API response shape: { ok, data } or { ok, error }.
type envelope map[string]any

func sendJSON(w http.ResponseWriter, status int, payload envelope) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("[response] encode error: %v", err)
	}
}

func sendSuccess(w http.ResponseWriter, data any) {
	sendJSON(w, http.StatusOK, envelope{"ok": true, "data": data})
}

func sendCreated(w http.ResponseWriter, data any) {
	sendJSON(w, http.StatusCreated, envelope{"ok": true, "data": data})
}

func sendError(w http.ResponseWriter, message string, status int) {
	sendJSON(w, status, envelope{"ok": false, "error": message})
}

func sendValidationError(w http.ResponseWriter, fields map[string]string) {
	sendJSON(w, http.StatusUnprocessableEntity, envelope{
		"ok":      false,
		"error":   "Validation failed.",
		"details": fields,
	})
}

// readJSON streams the request body directly into v using json.Decoder
// (no intermediate []byte allocation for the full payload).
func readJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // 4 MiB limit
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
