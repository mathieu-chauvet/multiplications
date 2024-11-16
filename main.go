package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
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
		for i := 1; i <= 10; i++ {
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

func main() {
	err := loadFlashcards()
	if err != nil {
		panic(err)
	}

	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/flashcards", getFlashcards)
	http.HandleFunc("/api/update", updateFlashcard)

	port := 8080
	println("Server is running on port", port)
	http.ListenAndServe(":"+strconv.Itoa(port), nil)
}
