package main

import (
	"bytes"
	"database/sql"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pelletier/go-toml/v2"
	_ "modernc.org/sqlite"
)

// Config structures for TOML configuration
type Config struct {
	HTTPConfig HTTPConfig `toml:"httpconfig"`
	DBConfig   DBConfig   `toml:"dbconfig"`
}

type HTTPConfig struct {
	Port        string `toml:"port"`
	MetricsPort string `toml:"metricsport"`
}

type DBConfig struct {
	DBPath string `toml:"dbpath"`
}

var config Config

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
	db, err = sql.Open("sqlite", config.DBConfig.DBPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	slog.Info("Database opened", "path", config.DBConfig.DBPath)

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

	// Create specialist_badges table for tracking progress toward specialist badges
	// A specialist badge is earned when a user gets 10/10 three times in a row on a single table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS specialist_badges (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_name TEXT NOT NULL,
			exercise_type TEXT NOT NULL,
			table_number INTEGER NOT NULL,
			consecutive_perfect INTEGER DEFAULT 0,
			badge_earned INTEGER DEFAULT 0,
			earned_at DATETIME,
			UNIQUE(user_name, exercise_type, table_number)
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create specialist_badges table: %w", err)
	}

	// Create index for specialist badges lookup
	_, err = db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_specialist_badges_lookup
		ON specialist_badges(user_name, exercise_type)
	`)
	if err != nil {
		return fmt.Errorf("failed to create specialist_badges index: %w", err)
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

// GET /api/user-best?name=X&type=Y - Returns user's best score for an exercise type
type BestScore struct {
	Score int `json:"score"`
	Total int `json:"total"`
}

// GET /api/scores - Returns all users' best scores (only completed exercises with 40 questions)
type UserScore struct {
	UserName       string  `json:"user_name"`
	ExerciseType   string  `json:"exercise_type"`
	BestScore      int     `json:"best_score"`
	BestTotal      int     `json:"best_total"`
	BestMeanTime   float64 `json:"best_mean_time"`
	CompositeScore float64 `json:"composite_score"`
}

func getAllScores(w http.ResponseWriter, r *http.Request) {
	// Only get completed exercises (total = 40)
	// For each user/exercise, find the best result based on:
	// 1. Highest score (primary)
	// 2. Lowest mean time (secondary, for tiebreaker)
	rows, err := db.Query(`
		SELECT
			user_name,
			exercise_type,
			score,
			total,
			COALESCE(mean_time_seconds, 999) as mean_time
		FROM user_results
		WHERE total = 40
		ORDER BY user_name, exercise_type, score DESC, mean_time_seconds ASC
	`)
	if err != nil {
		slog.Error("Failed to query scores", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Track best score per user/exercise combination
	bestScores := make(map[string]UserScore)

	for rows.Next() {
		var userName, exerciseType string
		var score, total int
		var meanTime float64
		if err := rows.Scan(&userName, &exerciseType, &score, &total, &meanTime); err != nil {
			slog.Error("Failed to scan row", "error", err)
			continue
		}

		key := userName + "|" + exerciseType
		existing, exists := bestScores[key]

		// Calculate composite score: score * 1000 - meanTime * 10
		// This ensures score is primary (36 > 35 always) and mean time is tiebreaker
		compositeScore := float64(score)*1000 - meanTime*10

		// Keep the best (highest composite score)
		if !exists || compositeScore > existing.CompositeScore {
			bestScores[key] = UserScore{
				UserName:       userName,
				ExerciseType:   exerciseType,
				BestScore:      score,
				BestTotal:      total,
				BestMeanTime:   meanTime,
				CompositeScore: compositeScore,
			}
		}
	}

	// Convert map to slice
	var scores []UserScore
	for _, score := range bestScores {
		scores = append(scores, score)
	}

	// Sort by composite score (highest first)
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].CompositeScore > scores[j].CompositeScore
	})

	if scores == nil {
		scores = []UserScore{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scores)
}

// GET /api/attempts - Returns all attempts
type Attempt struct {
	UserName        string  `json:"user_name"`
	ExerciseType    string  `json:"exercise_type"`
	Score           int     `json:"score"`
	Total           int     `json:"total"`
	Tables          string  `json:"tables"`
	MeanTimeSeconds float64 `json:"mean_time_seconds"`
	CreatedAt       string  `json:"created_at"`
}

func getAllAttempts(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT user_name, exercise_type, score, total, COALESCE(tables, ''), COALESCE(mean_time_seconds, 0), created_at
		FROM user_results
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		slog.Error("Failed to query attempts", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var attempts []Attempt
	for rows.Next() {
		var a Attempt
		if err := rows.Scan(&a.UserName, &a.ExerciseType, &a.Score, &a.Total, &a.Tables, &a.MeanTimeSeconds, &a.CreatedAt); err != nil {
			slog.Error("Failed to scan row", "error", err)
			continue
		}
		attempts = append(attempts, a)
	}

	if attempts == nil {
		attempts = []Attempt{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attempts)
}

// GET /api/badges - Returns earned badges for all users
type UserBadge struct {
	UserName     string `json:"user_name"`
	ExerciseType string `json:"exercise_type"`
	BadgeType    string `json:"badge_type"`
	BestScore    int    `json:"best_score"`
	BestTotal    int    `json:"best_total"`
	TablesCount  int    `json:"tables_count"`
	IsTenTables  bool   `json:"is_ten_tables"`
	Count        int    `json:"count"`
}

// calculateBadges returns all badges earned for a given score/tables combination
func calculateBadges(score, total, tablesCount int) []string {
	var badges []string

	if tablesCount < 5 {
		return badges // No badge if less than 5 tables
	}

	// Diamond badge: 12 tables + perfect score (unique, no 10-tables variant)
	if tablesCount == 12 && score == 40 && total == 40 {
		badges = append(badges, "diamond")
	}

	// Regular badges (5+ tables)
	if score == 40 && total == 40 {
		badges = append(badges, "gold")
	} else if score >= 38 && total == 40 {
		badges = append(badges, "silver")
	} else if score >= 36 && total == 40 {
		badges = append(badges, "bronze")
	}

	// 10-tables badges (10+ tables, same thresholds)
	if tablesCount >= 10 {
		if score == 40 && total == 40 {
			badges = append(badges, "gold10")
		} else if score >= 38 && total == 40 {
			badges = append(badges, "silver10")
		} else if score >= 36 && total == 40 {
			badges = append(badges, "bronze10")
		}
	}

	return badges
}

func getBadges(w http.ResponseWriter, r *http.Request) {
	// Get all results with 40 total questions and at least 36 score
	rows, err := db.Query(`
		SELECT user_name, exercise_type, score, total, COALESCE(tables, '')
		FROM user_results
		WHERE total = 40 AND score >= 36
		ORDER BY user_name, exercise_type, score DESC
	`)
	if err != nil {
		slog.Error("Failed to query badges", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Track best badge and count per user/exercise/category combination
	// Categories: "regular" (5+ tables), "ten" (10+ tables), "diamond" (12 tables + perfect)
	// Key format: "userName|exerciseType|category"
	badgeMap := make(map[string]UserBadge)
	// Count occurrences of each specific badge type per user/exercise
	// Key format: "userName|exerciseType|badgeType" (e.g., "Alice|mul|gold" or "Alice|mul|gold10")
	badgeCounts := make(map[string]int)

	// Badge priority within each category (higher = better)
	badgePriority := map[string]int{
		"diamond": 4, "gold": 3, "silver": 2, "bronze": 1,
	}

	for rows.Next() {
		var userName, exerciseType, tablesJSON string
		var score, total int
		if err := rows.Scan(&userName, &exerciseType, &score, &total, &tablesJSON); err != nil {
			slog.Error("Failed to scan row", "error", err)
			continue
		}

		// Parse tables JSON to count
		tablesCount := 0
		if tablesJSON != "" {
			var tables []int
			if err := json.Unmarshal([]byte(tablesJSON), &tables); err == nil {
				tablesCount = len(tables)
			}
		}

		earnedBadges := calculateBadges(score, total, tablesCount)

		for _, badgeType := range earnedBadges {
			// Determine base badge type and category
			baseBadge := badgeType
			isTenTables := false
			category := "regular"

			if badgeType == "diamond" {
				category = "diamond"
			} else if len(badgeType) > 2 && badgeType[len(badgeType)-2:] == "10" {
				baseBadge = badgeType[:len(badgeType)-2]
				isTenTables = true
				category = "ten"
			}

			// Count this specific badge occurrence
			countKey := userName + "|" + exerciseType + "|" + badgeType
			badgeCounts[countKey]++

			// Key by user + exercise + category (not individual badge type)
			// This ensures only the best badge per category is kept
			key := userName + "|" + exerciseType + "|" + category
			existing, exists := badgeMap[key]

			// Keep the best badge within each category
			currentPriority := badgePriority[baseBadge]
			existingPriority := badgePriority[existing.BadgeType]

			if !exists || currentPriority > existingPriority {
				badgeMap[key] = UserBadge{
					UserName:     userName,
					ExerciseType: exerciseType,
					BadgeType:    baseBadge,
					BestScore:    score,
					BestTotal:    total,
					TablesCount:  tablesCount,
					IsTenTables:  isTenTables,
				}
			}
		}
	}

	// Add counts to badges
	for key, badge := range badgeMap {
		// Reconstruct the badge type key for counting
		badgeTypeKey := badge.BadgeType
		if badge.IsTenTables {
			badgeTypeKey += "10"
		}
		countKey := badge.UserName + "|" + badge.ExerciseType + "|" + badgeTypeKey
		badge.Count = badgeCounts[countKey]
		badgeMap[key] = badge
	}

	// Convert map to slice and sort by priority
	var badges []UserBadge
	for _, badge := range badgeMap {
		badges = append(badges, badge)
	}

	// Sort badges by user, exercise type, then priority (best first)
	sort.Slice(badges, func(i, j int) bool {
		if badges[i].UserName != badges[j].UserName {
			return badges[i].UserName < badges[j].UserName
		}
		if badges[i].ExerciseType != badges[j].ExerciseType {
			return badges[i].ExerciseType < badges[j].ExerciseType
		}
		// Compare by priority (diamond > gold10 > gold > silver10 > silver > bronze10 > bronze)
		getPriority := func(b UserBadge) int {
			base := badgePriority[b.BadgeType]
			if b.BadgeType == "diamond" {
				return 100 // Diamond is always highest
			}
			if b.IsTenTables {
				return base*10 + 5 // 10-tables variants are higher than regular
			}
			return base * 10
		}
		return getPriority(badges[i]) > getPriority(badges[j])
	})

	if badges == nil {
		badges = []UserBadge{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(badges)
}

// GET /api/specialist-badges - Returns earned specialist badges for all users
type SpecialistBadge struct {
	UserName           string `json:"user_name"`
	ExerciseType       string `json:"exercise_type"`
	TableNumber        int    `json:"table_number"`
	ConsecutivePerfect int    `json:"consecutive_perfect"`
	BadgeEarned        bool   `json:"badge_earned"`
	EarnedAt           string `json:"earned_at,omitempty"`
}

func getSpecialistBadges(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT user_name, exercise_type, table_number, consecutive_perfect, badge_earned, COALESCE(earned_at, '')
		FROM specialist_badges
		ORDER BY user_name, exercise_type, table_number
	`)
	if err != nil {
		slog.Error("Failed to query specialist badges", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var badges []SpecialistBadge
	for rows.Next() {
		var b SpecialistBadge
		var earnedAt string
		var badgeEarnedInt int
		if err := rows.Scan(&b.UserName, &b.ExerciseType, &b.TableNumber, &b.ConsecutivePerfect, &badgeEarnedInt, &earnedAt); err != nil {
			slog.Error("Failed to scan row", "error", err)
			continue
		}
		b.BadgeEarned = badgeEarnedInt == 1
		b.EarnedAt = earnedAt
		badges = append(badges, b)
	}

	if badges == nil {
		badges = []SpecialistBadge{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(badges)
}

func getUserBestScore(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	exerciseType := strings.TrimSpace(r.URL.Query().Get("type"))

	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if exerciseType == "" {
		exerciseType = "mul"
	}

	var best BestScore
	err := db.QueryRow(`
		SELECT score, total
		FROM user_results
		WHERE user_name = ? AND exercise_type = ? AND total > 0
		ORDER BY (CAST(score AS REAL) / total) DESC, score DESC
		LIMIT 1
	`, name, exerciseType).Scan(&best.Score, &best.Total)

	if err != nil {
		// No previous score found
		best.Score = 0
		best.Total = 0
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(best)
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

// updateSpecialistBadgeProgress checks if a user qualifies for specialist badge progress
// Requirements: single table selected, perfect score (10/10), track 3 consecutive perfects
func updateSpecialistBadgeProgress(userName, exerciseType string, tables []int, score, total int) {
	// Only track if exactly one table is selected
	if len(tables) != 1 {
		return
	}

	tableNumber := tables[0]

	// For a single table, we expect 10 questions (table x 1-10)
	// Perfect score means score == total == 10
	isPerfect := score == total && total == 10

	if isPerfect {
		// Increment consecutive count or insert new record
		_, err := db.Exec(`
			INSERT INTO specialist_badges (user_name, exercise_type, table_number, consecutive_perfect, badge_earned)
			VALUES (?, ?, ?, 1, 0)
			ON CONFLICT(user_name, exercise_type, table_number)
			DO UPDATE SET consecutive_perfect =
				CASE
					WHEN badge_earned = 1 THEN consecutive_perfect
					ELSE consecutive_perfect + 1
				END
		`, userName, exerciseType, tableNumber)
		if err != nil {
			slog.Error("Failed to update specialist badge progress", "error", err)
			return
		}

		// Check if badge should be earned (3 consecutive perfects)
		var consecutiveCount int
		var badgeEarned int
		err = db.QueryRow(`
			SELECT consecutive_perfect, badge_earned
			FROM specialist_badges
			WHERE user_name = ? AND exercise_type = ? AND table_number = ?
		`, userName, exerciseType, tableNumber).Scan(&consecutiveCount, &badgeEarned)

		if err != nil {
			slog.Error("Failed to check specialist badge status", "error", err)
			return
		}

		// Award badge if 3 consecutive perfects and not already earned
		if consecutiveCount >= 3 && badgeEarned == 0 {
			_, err = db.Exec(`
				UPDATE specialist_badges
				SET badge_earned = 1, earned_at = CURRENT_TIMESTAMP
				WHERE user_name = ? AND exercise_type = ? AND table_number = ?
			`, userName, exerciseType, tableNumber)
			if err != nil {
				slog.Error("Failed to award specialist badge", "error", err)
			} else {
				slog.Info("Specialist badge awarded", "user", userName, "type", exerciseType, "table", tableNumber)
			}
		}
	} else {
		// Reset consecutive count on non-perfect score (only if badge not yet earned)
		_, err := db.Exec(`
			UPDATE specialist_badges
			SET consecutive_perfect = 0
			WHERE user_name = ? AND exercise_type = ? AND table_number = ? AND badge_earned = 0
		`, userName, exerciseType, tableNumber)
		if err != nil {
			slog.Error("Failed to reset specialist badge progress", "error", err)
		}
	}
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

	// Check for specialist badge progress (single table, 10/10 three times in a row)
	updateSpecialistBadgeProgress(name, exerciseType, req.Tables, req.Score, req.Total)

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

//go:embed static/* static/gifs/* static/icons/*
var staticFiles embed.FS

func loadConfig(configPath string) error {
	// Set defaults
	config = Config{
		HTTPConfig: HTTPConfig{
			Port:        "8080",
			MetricsPort: "9090",
		},
		DBConfig: DBConfig{
			DBPath: "./flashcards.db",
		},
	}

	// Try to load config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			slog.Info("No config file found, using defaults", "path", configPath)
			return nil
		}
		return fmt.Errorf("failed to read config file: %w", err)
	}

	if err := toml.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}
	slog.Info("Config loaded", "path", configPath)

	return nil
}

func main() {
	// Parse command line flags
	configPath := flag.String("config", "config.toml", "Path to configuration file")
	flag.Parse()

	// Load configuration
	if err := loadConfig(*configPath); err != nil {
		panic(fmt.Sprintf("Failed to load configuration: %v", err))
	}

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
	http.HandleFunc("/api/user-best", getUserBestScore)
	http.HandleFunc("/api/user-error", postUserError)
	http.HandleFunc("/api/result", postResult)
	http.HandleFunc("/api/scores", getAllScores)
	http.HandleFunc("/api/attempts", getAllAttempts)
	http.HandleFunc("/api/badges", getBadges)
	http.HandleFunc("/api/specialist-badges", getSpecialistBadges)

	slog.Info("Server starting", "port", config.HTTPConfig.Port)
	if err := http.ListenAndServe(":"+config.HTTPConfig.Port, nil); err != nil {
		slog.Error("Server failed", "error", err)
	}
}
