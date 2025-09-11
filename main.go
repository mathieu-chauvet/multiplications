package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Flashcard struct {
	Question   string `json:"question"`
	Answer     string `json:"answer"`
	TimesWrong int    `json:"times_wrong"`
}

var flashcards []Flashcard

func loadFlashcards() error {
	file, err := os.Open("flashcards.json")
	if err != nil {
		return err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	return decoder.Decode(&flashcards)
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

func updateFlashcard(w http.ResponseWriter, r *http.Request) {
	var updatedCard Flashcard
	err := json.NewDecoder(r.Body).Decode(&updatedCard)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update the flashcard
	for i, card := range flashcards {
		if card.Question == updatedCard.Question {
			flashcards[i] = updatedCard
			break
		}
	}

	// Save the updated flashcards
	file, err := os.Create("flashcards.json")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "    ")
	err = encoder.Encode(flashcards)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Result handling for posting to Google Sheets via backend
// Request payload from frontend
type resultRequest struct {
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Total  int    `json:"total"`
	Tables []int  `json:"tables,omitempty"`
}

// Payload forwarded to Google Apps Script (you can adapt to your script needs)
type sheetPayload struct {
	Date   string `json:"date"`
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Total  int    `json:"total"`
	Tables []int  `json:"tables,omitempty"`
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

	webhook := os.Getenv("SHEETS_WEBHOOK_URL")
	if webhook == "" {
		// If not configured, succeed without forwarding to avoid blocking UI
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "forwarded": "false"})
		return
	}

	payload := sheetPayload{
		Date:   time.Now().Format(time.RFC3339),
		Name:   name,
		Score:  req.Score,
		Total:  req.Total,
		Tables: req.Tables,
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
	err := loadFlashcards()
	if err != nil {
		panic(err)
	}

	fs := http.FileServer(http.FS(staticFiles))
	http.Handle("/", http.StripPrefix("/", fs))

	http.HandleFunc("/api/flashcards", getFlashcards)
	http.HandleFunc("/api/update", updateFlashcard)
	http.HandleFunc("/api/result", postResult)

	port := 8080
	println("Server is running on port", port)
	http.ListenAndServe(":"+strconv.Itoa(port), nil)
}
