// app.js

let flashcards = [];
let currentCardIndex = 0;
let score = 0;
let timer; // Timer pour le compte à rebours
let delayTimer; // Timer pour les délais entre les questions
const TIME_LIMIT = 6000; // 6 secondes en millisecondes
let responseTimes = []; // Stocke les temps de réponse
let questionStartTime; // Enregistre l'heure de début de chaque question
const MAX_TABLE = 10; // Nombre maximum de tables disponibles

// Fonction pour générer les cases à cocher pour les tables
function generateCheckboxes() {
    const checkboxesDiv = document.getElementById('checkboxes');
    for (let i = 1; i <= MAX_TABLE; i++) {
        const label = document.createElement('label');
        label.htmlFor = `table-${i}`;
        label.innerText = `Table de ${i}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `table-${i}`;
        checkbox.name = 'tables';
        checkbox.value = i;
        checkbox.checked = true; // Par défaut, toutes les tables sont sélectionnées

        label.prepend(checkbox);
        checkboxesDiv.appendChild(label);
    }
}

// Fonction pour générer les flashcards en fonction des tables sélectionnées
function generateFlashcards(selectedTables) {
    const flashcards = [];
    for (let i = 1; i <= 10; i++) {
        selectedTables.forEach((table) => {
            const question = `${table} x ${i} = ?`;
            const answer = (table * i).toString();
            const flashcard = {
                question: question,
                answer: answer,
                times_wrong: 0
            };
            flashcards.push(flashcard);
        });
    }
    return flashcards;
}

// Fonction pour mélanger les flashcards
function shuffleFlashcards() {
    for (let i = flashcards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
    }
}

// Fonction pour afficher une flashcard
function displayFlashcard() {
    if (currentCardIndex >= flashcards.length) {
        showResults();
        return;
    }
    const card = flashcards[currentCardIndex];
    document.getElementById('question').innerText = card.question;
    document.getElementById('answer').value = '';
    document.getElementById('feedback').innerText = '';
    document.getElementById('timer').innerText = '';

    // Activer le champ de saisie et les boutons
    document.getElementById('answer').disabled = false;
    document.getElementById('submit').disabled = false;
    document.getElementById('end').disabled = false;

    // Mettre le focus sur le champ de saisie APRÈS l'avoir activé
    document.getElementById('answer').focus();

    // Enregistrer l'heure de début
    questionStartTime = Date.now();

    // Démarrer le timer
    startTimer();
}

// Fonction pour démarrer le timer
function startTimer() {
    // Effacer tout timer existant
    clearInterval(timer);

    let timeLeft = TIME_LIMIT / 1000; // Convertir en secondes

    document.getElementById('timer').innerText = `Temps restant : ${timeLeft}s`;

    timer = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
            document.getElementById('timer').innerText = `Temps restant : ${timeLeft}s`;
        }
        if (timeLeft < 0) {
            clearInterval(timer);
            handleTimeout();
        }
    }, 1000);
}

// Fonction appelée lorsque le temps est écoulé
function handleTimeout() {
    clearInterval(timer);

    // Vérifier si le quiz est terminé
    if (currentCardIndex >= flashcards.length) {
        return;
    }

    const card = flashcards[currentCardIndex];

    // Afficher le message en français
    document.getElementById('feedback').innerText = `Temps écoulé ! Veuillez répéter 10 fois : ${card.question} ${card.answer}`;

    // Désactiver le champ de saisie et les boutons pendant le délai
    document.getElementById('answer').disabled = true;
    document.getElementById('submit').disabled = true;
    document.getElementById('end').disabled = true;

    // Enregistrer le temps de réponse comme étant la limite de temps
    responseTimes.push(TIME_LIMIT / 1000);

    // Incrémenter times_wrong
    card.times_wrong = (card.times_wrong || 0) + 1;
    updateFlashcard(card);

    currentCardIndex++;

    // Attendre 10 secondes avant d'afficher la prochaine carte
    delayTimer = setTimeout(displayFlashcard, 10000);
}

// Fonction appelée lorsque l'utilisateur soumet une réponse
async function submitAnswer() {
    // Stop the timer
    clearInterval(timer);

    // Check if the quiz is finished
    if (currentCardIndex >= flashcards.length) {
        return;
    }

    const card = flashcards[currentCardIndex];
    const userAnswer = document.getElementById('answer').value.trim();

    // Calculate response time
    const responseTime = (Date.now() - questionStartTime) / 1000; // In seconds
    responseTimes.push(responseTime);

    if (userAnswer.toLowerCase() === card.answer.toLowerCase()) {
        document.getElementById('feedback').innerText = 'Correct !';
        score++;

        currentCardIndex++;

        // Small delay before showing the next card
        setTimeout(() => {
            displayFlashcard();
        }, 500);
    } else {
        // Show feedback for incorrect answers
        document.getElementById('feedback').innerText = `Veuillez répéter 10 fois : ${card.question} ${card.answer}`;
        card.times_wrong = (card.times_wrong || 0) + 1;
        await updateFlashcard(card);

        currentCardIndex++;

        // Longer delay for incorrect answers
        setTimeout(() => {
            displayFlashcard();
        }, 10000);
    }

    // Re-enable the input field and refocus to keep the keyboard displayed
    setTimeout(() => {
        document.getElementById('answer').disabled = false; // Re-enable
        document.getElementById('answer').value = ''; // Clear the input field
        document.getElementById('answer').focus(); // Refocus the input
    }, 100);
}


// Fonction pour terminer le quiz
function endQuiz() {
    // Arrêter les timers
    clearInterval(timer);
    clearTimeout(delayTimer);

    showResults();
}

// Fonction pour afficher les résultats
function showResults() {
    // Effacer tout timer restant
    clearInterval(timer);
    clearTimeout(delayTimer);

    // Désactiver les boutons et le champ de saisie
    document.getElementById('submit').disabled = true;
    document.getElementById('end').disabled = true;
    document.getElementById('answer').disabled = true;

    // Supprimer les écouteurs d'événements
    document.getElementById('submit').removeEventListener('click', submitAnswer);
    document.getElementById('end').removeEventListener('click', endQuiz);
    document.getElementById('answer').removeEventListener('keyup', answerKeyUpHandler);

    // Calculer le temps de réponse moyen
    const totalResponseTime = responseTimes.reduce((acc, val) => acc + val, 0);
    const meanResponseTime = responseTimes.length > 0 ? (totalResponseTime / responseTimes.length).toFixed(2) : 0;

    document.getElementById('flashcard').innerHTML = `
        <p>Vous avez obtenu ${score} bonnes réponses sur ${currentCardIndex}.</p>
        <p>Temps de réponse moyen : ${meanResponseTime} secondes</p>
    `;
}

// Fonction pour mettre à jour une flashcard (placeholder pour compatibilité)
async function updateFlashcard(card) {
    // Si vous avez une logique pour mettre à jour la flashcard sur le serveur, implémentez-la ici
    // Pour l'instant, cette fonction est vide car nous générons les flashcards côté client
}

// Gestionnaire pour la touche "Entrée" dans le champ de réponse
const answerKeyUpHandler = function(event) {
    if (event.key === 'Enter') {
        submitAnswer();
    }
};

// Générer les cases à cocher lors du chargement de la page
window.onload = function() {
    generateCheckboxes();
    // Ne pas charger les flashcards avant que l'utilisateur ait choisi les tables
    // loadFlashcards(); // Supprimer ou commenter cette ligne si elle existe
};

// Ajouter un écouteur pour le formulaire de sélection des tables
document.getElementById('table-form').addEventListener('submit', function(event) {
    event.preventDefault(); // Empêche le rechargement de la page

    // Récupérer les tables sélectionnées
    const selectedTables = [];
    const checkboxes = document.querySelectorAll('input[name="tables"]:checked');
    checkboxes.forEach((checkbox) => {
        selectedTables.push(parseInt(checkbox.value));
    });

    if (selectedTables.length === 0) {
        alert("Veuillez sélectionner au moins une table de multiplication.");
        return;
    }

    // Masquer la section de sélection et afficher la section des flashcards
    document.getElementById('table-selection').style.display = 'none';
    document.getElementById('flashcard').style.display = 'block';

    // Charger les flashcards avec les tables sélectionnées
    loadFlashcards(selectedTables);
});

// Fonction pour charger les flashcards en fonction des tables sélectionnées
async function loadFlashcards(selectedTables) {
    // Générer les flashcards en fonction des tables sélectionnées
    flashcards = generateFlashcards(selectedTables);
    shuffleFlashcards();
    currentCardIndex = 0;
    score = 0;
    responseTimes = [];

    // Ajouter les écouteurs d'événements ici
    document.getElementById('submit').addEventListener('click', submitAnswer);
    document.getElementById('answer').addEventListener('keyup', answerKeyUpHandler);
    document.getElementById('end').addEventListener('click', endQuiz);

    displayFlashcard();
}

// Enregistrer le service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => {
            console.log('Service Worker enregistré.', reg);
        })
        .catch(err => {
            console.error("L'enregistrement du Service Worker a échoué :", err);
        });
}

