package main

import (
	"bytes"
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Flashcard struct {
	Question   string `json:"question"`
	Answer     string `json:"answer"`
	TimesWrong int    `json:"times_wrong"`
}

// UserError represents an error record for a user
type UserError struct {
	Question   string `json:"question"`
	ErrorCount int    `json:"error_count"`
}

var db *sql.DB

func initDB() error {
	var err error
	db, err = sql.Open("sqlite", "./flashcards.db")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Create user_errors table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS user_errors (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_name TEXT NOT NULL,
			exercise_type TEXT NOT NULL,
			question TEXT NOT NULL,
			error_count INTEGER DEFAULT 1,
			last_error_date DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_name, exercise_type, question)
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create table: %w", err)
	}

	// Create index for faster lookups
	_, err = db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_user_errors_lookup
		ON user_errors(user_name, exercise_type)
	`)
	if err != nil {
		return fmt.Errorf("failed to create index: %w", err)
	}

	// Create user_results table for storing quiz results
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS user_results (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_name TEXT NOT NULL,
			exercise_type TEXT NOT NULL,
			score INTEGER NOT NULL,
			total INTEGER NOT NULL,
			tables TEXT,
			mean_time_seconds REAL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create user_results table: %w", err)
	}

	// Create index for user results lookup
	_, err = db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_user_results_lookup
		ON user_results(user_name, exercise_type)
	`)
	if err != nil {
		return fmt.Errorf("failed to create user_results index: %w", err)
	}

	return nil
}

// Mise à jour de la fonction getFlashcards
func getFlashcards(w http.ResponseWriter, r *http.Request) {
	// Récupérer les tables sélectionnées depuis les paramètres de la requête
	tablesParam := r.URL.Query().Get("tables")
	var selectedTables []int
	if tablesParam != "" {
		tablesStr := strings.Split(tablesParam, ",")
		for _, t := range tablesStr {
			table, err := strconv.Atoi(t)
			if err == nil {
				selectedTables = append(selectedTables, table)
			}
		}
	} else {
		// Si aucun paramètre, utiliser toutes les tables
		for i := 1; i <= 12; i++ {
			selectedTables = append(selectedTables, i)
		}
	}

	// Générer les flashcards en fonction des tables sélectionnées
	flashcards := generateFlashcards(selectedTables)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flashcards)
}

// Fonction pour générer les flashcards
func generateFlashcards(selectedTables []int) []Flashcard {
	var flashcards []Flashcard
	for i := 1; i <= 10; i++ {
		for _, table := range selectedTables {
			question := fmt.Sprintf("%d x %d = ?", table, i)
			answer := fmt.Sprintf("%d", table*i)
			flashcard := Flashcard{
				Question:   question,
				Answer:     answer,
				TimesWrong: 0,
			}
			flashcards = append(flashcards, flashcard)
		}
	}
	return flashcards
}

// GET /api/user-errors?name=X&type=Y - Returns user's error history
func getUserErrors(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	exerciseType := strings.TrimSpace(r.URL.Query().Get("type"))

	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if exerciseType == "" {
		exerciseType = "mul" // default
	}

	rows, err := db.Query(`
		SELECT question, error_count
		FROM user_errors
		WHERE user_name = ? AND exercise_type = ?
		ORDER BY error_count DESC
	`, name, exerciseType)
	if err != nil {
		slog.Error("Failed to query user errors", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var errors []UserError
	for rows.Next() {
		var ue UserError
		if err := rows.Scan(&ue.Question, &ue.ErrorCount); err != nil {
			slog.Error("Failed to scan row", "error", err)
			continue
		}
		errors = append(errors, ue)
	}

	if errors == nil {
		errors = []UserError{} // Return empty array instead of null
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(errors)
}

// POST /api/user-error - Record an error for a user
type userErrorRequest struct {
	Name         string `json:"name"`
	ExerciseType string `json:"exercise_type"`
	Question     string `json:"question"`
}

func postUserError(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req userErrorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if req.Question == "" {
		http.Error(w, "question required", http.StatusBadRequest)
		return
	}
	if req.ExerciseType == "" {
		req.ExerciseType = "mul"
	}

	// Upsert: insert or increment error_count
	_, err := db.Exec(`
		INSERT INTO user_errors (user_name, exercise_type, question, error_count, last_error_date)
		VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
		ON CONFLICT(user_name, exercise_type, question)
		DO UPDATE SET
			error_count = error_count + 1,
			last_error_date = CURRENT_TIMESTAMP
	`, name, req.ExerciseType, req.Question)

	if err != nil {
		slog.Error("Failed to record user error", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// Result handling for posting to Google Sheets via backend
// Request payload from frontend
type resultRequest struct {
	Name            string  `json:"name"`
	Score           int     `json:"score"`
	Total           int     `json:"total"`
	Tables          []int   `json:"tables,omitempty"`
	ExerciseType    string  `json:"exercise_type,omitempty"`
	MeanTimeSeconds float64 `json:"mean_time_seconds,omitempty"`
}

// Payload forwarded to Google Apps Script (you can adapt to your script needs)
type sheetPayload struct {
	Date            string  `json:"date"`
	Name            string  `json:"name"`
	Score           int     `json:"score"`
	Total           int     `json:"total"`
	Tables          []int   `json:"tables,omitempty"`
	ExerciseType    string  `json:"exercise_type,omitempty"`
	MeanTimeSeconds float64 `json:"mean_time_seconds,omitempty"`
}

func postResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req resultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	// Save result to SQLite database
	tablesJSON := ""
	if len(req.Tables) > 0 {
		if b, err := json.Marshal(req.Tables); err == nil {
			tablesJSON = string(b)
		}
	}
	exerciseType := req.ExerciseType
	if exerciseType == "" {
		exerciseType = "mul"
	}

	_, err := db.Exec(`
		INSERT INTO user_results (user_name, exercise_type, score, total, tables, mean_time_seconds)
		VALUES (?, ?, ?, ?, ?, ?)
	`, name, exerciseType, req.Score, req.Total, tablesJSON, req.MeanTimeSeconds)
	if err != nil {
		slog.Error("Failed to save result to database", "error", err)
		// Continue anyway to not block the user
	}

	webhook := os.Getenv("SHEETS_WEBHOOK_URL")
	if webhook == "" {
		// If not configured, succeed without forwarding to avoid blocking UI
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "forwarded": "false", "saved": "true"})
		return
	}

	payload := sheetPayload{
		Date:            time.Now().Format(time.RFC3339),
		Name:            name,
		Score:           req.Score,
		Total:           req.Total,
		Tables:          req.Tables,
		ExerciseType:    req.ExerciseType,
		MeanTimeSeconds: req.MeanTimeSeconds,
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "failed to marshal payload", http.StatusInternalServerError)
		return
	}

	resp, err := http.Post(webhook, "application/json", bytes.NewReader(buf))
	if err != nil {
		slog.Error("Error while posting to google sheets", "error", err.Error(), "payload", string(buf))
		http.Error(w, fmt.Sprintf("failed to post to webhook: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slog.Error("Error while posting to google sheets", "error", resp.StatusCode, "payload", string(buf))
		http.Error(w, fmt.Sprintf("webhook returned status %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "forwarded": "true"})
	slog.Info("Successfully posted to google sheets", "payload", string(buf))
}

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Initialize SQLite database
	if err := initDB(); err != nil {
		panic(fmt.Sprintf("Failed to initialize database: %v", err))
	}
	defer db.Close()

	// Serve embedded static files from the "static" subdirectory at /static/
	sub, err2 := fs.Sub(staticFiles, "static")
	if err2 != nil {
		panic(err2)
	}
	staticHandler := http.FileServer(http.FS(sub))
	http.Handle("/static/", http.StripPrefix("/static/", staticHandler))

	// Redirect root to /static/
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/static/", http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})

	http.HandleFunc("/api/flashcards", getFlashcards)
	http.HandleFunc("/api/user-errors", getUserErrors)
	http.HandleFunc("/api/user-error", postUserError)
	http.HandleFunc("/api/result", postResult)

	port := 8080
	println("Server is running on port", port)
	http.ListenAndServe(":"+strconv.Itoa(port), nil)
}
