// app.js

let flashcards = [];
let currentCardIndex = 0;
let score = 0;
let timer; // Timer pour le compte à rebours
let delayTimer; // Timer pour les délais entre les questions
const TIME_LIMIT = 6000; // 6 secondes en millisecondes
let responseTimes = []; // Stocke les temps de réponse
let questionStartTime; // Enregistre l'heure de début de chaque question
let MAX_TABLE = 12; // Nombre maximum de tables disponibles (12 pour multiplications, 10 pour additions)
let exerciseMode = 'mul'; // 'mul' ou 'add'
let selectedTablesChosen = []; // Stocke les tables sélectionnées pour l'affichage final

// Helpers cookies
function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
}

function getCookie(name) {
    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie || "");
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(cname) === 0) {
            return c.substring(cname.length, c.length);
        }
    }
    return "";
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

// Fonction pour générer les cases à cocher pour les tables
function generateCheckboxes() {
    const checkboxesDiv = document.getElementById('checkboxes');
    if (!checkboxesDiv) return;
    // Effacer
    checkboxesDiv.innerHTML = '';

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
            let question;
            let answer;
            if (exerciseMode === 'add') {
                question = `${table} + ${i} = ?`;
                answer = (table + i).toString();
            } else {
                question = `${table} x ${i} = ?`;
                answer = (table * i).toString();
            }
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
    // Arrêter le timer
    clearInterval(timer);

    // Vérifier si le quiz est terminé
    if (currentCardIndex >= flashcards.length) {
        return;
    }

    const card = flashcards[currentCardIndex];
    const userAnswer = document.getElementById('answer').value.trim();

    // Désactiver le champ de saisie et les boutons pendant le délai
    document.getElementById('answer').disabled = true;
    document.getElementById('submit').disabled = true;
    document.getElementById('end').disabled = true;

    // Calculer le temps de réponse
    const responseTime = (Date.now() - questionStartTime) / 1000; // En secondes
    responseTimes.push(responseTime);

    if (userAnswer.toLowerCase() === card.answer.toLowerCase()) {
        document.getElementById('feedback').innerText = 'Correct !';
        score++;

        currentCardIndex++;

        // Attendre 2 secondes avant d'afficher la prochaine carte
        delayTimer = setTimeout(displayFlashcard, 500);
    } else {
        // Afficher le message en français
        document.getElementById('feedback').innerText = `Veuillez répéter 10 fois : ${card.question} ${card.answer}`;
        // Incrémenter times_wrong
        card.times_wrong = (card.times_wrong || 0) + 1;
        await updateFlashcard(card);

        currentCardIndex++;

        // Attendre 10 secondes avant d'afficher la prochaine carte
        delayTimer = setTimeout(displayFlashcard, 10000);
    }
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
    const meanResponseTimeSec = responseTimes.length > 0 ? (totalResponseTime / responseTimes.length) : 0;
    const meanResponseTimeText = meanResponseTimeSec.toFixed(2);

    const tablesText = selectedTablesChosen && selectedTablesChosen.length > 0
        ? selectedTablesChosen.slice().sort((a,b)=>a-b).join(', ')
        : 'aucune';

    document.getElementById('flashcard').innerHTML = `
        <p>Vous avez obtenu ${score} bonnes réponses sur ${currentCardIndex}. Tables sélectionnées : ${tablesText}.</p>
        <p>Temps de réponse moyen : ${meanResponseTimeText} secondes</p>
    `;

    // Envoi du résultat vers la feuille Google (si configurée)
    const playerName = getCookie('playerName') || '';
    try {
        sendResultToSheet(playerName, score, currentCardIndex, selectedTablesChosen, meanResponseTimeSec);
    } catch (e) {
        console.warn('Envoi du résultat non effectué:', e);
    }
}

// Fonction pour mettre à jour une flashcard (placeholder pour compatibilité)
async function updateFlashcard(card) {
    // Si vous avez une logique pour mettre à jour la flashcard sur le serveur, implémentez-la ici
    // Pour l'instant, cette fonction est vide car nous générons les flashcards côté client
}

// Envoi du résultat au backend (qui poste ensuite vers Google Sheets)
function sendResultToSheet(name, score, total, tables, meanTimeSeconds) {
    try {
        return fetch('/api/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name || '',
                score: Number(score) || 0,
                total: Number(total) || 0,
                tables: Array.isArray(tables) ? tables : [],
                exercise_type: exerciseMode || 'mul',
                mean_time_seconds: Number.isFinite(meanTimeSeconds) ? meanTimeSeconds : 0
            })
        }).then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json().catch(() => ({}));
        }).catch(err => {
            console.warn('Erreur lors de l\'envoi au backend:', err);
        });
    } catch (e) {
        console.warn('Exception sendResultToSheet:', e);
    }
}

// Gestionnaire pour la touche "Entrée" dans le champ de réponse
const answerKeyUpHandler = function(event) {
    if (event.key === 'Enter') {
        submitAnswer();
    }
};

// Met à jour le titre et le nombre de tables selon le mode
function updateModeUI() {
    const title = document.getElementById('selection-title');
    if (exerciseMode === 'add') {
        MAX_TABLE = 10;
        if (title) title.textContent = 'Sélectionnez les tables d\'additions (1 à 10) :';
    } else {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Sélectionnez les tables de multiplications :';
    }
    generateCheckboxes();
}

// Générer les cases à cocher lors du chargement de la page
window.onload = function() {
    updateModeUI();

    // Gestion du nom via cookie
    const nameSection = document.getElementById('name-section');
    const tableSelection = document.getElementById('table-selection');
    const userBar = document.getElementById('user-bar');
    const userNameDisplay = document.getElementById('user-name-display');
    const logoutBtn = document.getElementById('logout-btn');
    const existingName = getCookie('playerName');

    if (!existingName) {
        // Afficher la demande de nom et masquer la sélection des tables
        if (nameSection) nameSection.style.display = 'block';
        if (tableSelection) tableSelection.style.display = 'none';
        if (userBar) userBar.style.display = 'none';
    } else {
        if (nameSection) nameSection.style.display = 'none';
        if (tableSelection) tableSelection.style.display = 'block';
        if (userBar) userBar.style.display = 'flex';
        if (userNameDisplay) userNameDisplay.textContent = existingName;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', disconnectUser);
    }

    // Radio mode
    const modeMul = document.getElementById('mode-mul');
    const modeAdd = document.getElementById('mode-add');
    if (modeMul) modeMul.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'mul'; updateModeUI(); }
    });
    if (modeAdd) modeAdd.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'add'; updateModeUI(); }
    });

    const nameForm = document.getElementById('name-form');
    if (nameForm) {
        nameForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const input = document.getElementById('player-name');
            const value = (input && input.value) ? input.value.trim() : '';
            if (!value) {
                alert('Veuillez entrer votre nom.');
                if (input) input.focus();
                return;
            }
            setCookie('playerName', value, 365);
            if (nameSection) nameSection.style.display = 'none';
            if (tableSelection) tableSelection.style.display = 'block';
            if (userBar) userBar.style.display = 'flex';
            if (userNameDisplay) userNameDisplay.textContent = value;
        });
    }

    // Bouton pour tout désélectionner au début
    const unselectBtn = document.getElementById('unselect-all');
    if (unselectBtn) {
        unselectBtn.addEventListener('click', function() {
            const checkboxes = document.querySelectorAll('input[name="tables"]');
            checkboxes.forEach(cb => cb.checked = false);
        });
    }

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

    // Conserver pour le message de score final
    selectedTablesChosen = selectedTables.slice();

    if (selectedTables.length === 0) {
        alert("Veuillez sélectionner au moins une table.");
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

function disconnectUser() {
    // Stop any running timers
    clearInterval(timer);
    clearTimeout(delayTimer);

    // Reset in-memory state
    flashcards = [];
    currentCardIndex = 0;
    score = 0;
    responseTimes = [];

    // Hide quiz UI and table selection; show name prompt
    const flashcardDiv = document.getElementById('flashcard');
    const tableSelection = document.getElementById('table-selection');
    const nameSection = document.getElementById('name-section');
    const userBar = document.getElementById('user-bar');
    const nameInput = document.getElementById('player-name');

    if (flashcardDiv) flashcardDiv.style.display = 'none';
    if (tableSelection) tableSelection.style.display = 'none';
    if (nameSection) nameSection.style.display = 'block';
    if (userBar) userBar.style.display = 'none';
    if (nameInput) nameInput.value = '';

    // Clear the cookie
    deleteCookie('playerName');
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


// Envoi des résultats lors de la fermeture/rafraîchissement de la page
(function setupBeforeUnload(){
    function computeMeanTime() {
        if (Array.isArray(responseTimes) && responseTimes.length > 0) {
            const total = responseTimes.reduce((a,b)=>a+b,0);
            return total / responseTimes.length;
        }
        return 0;
    }
    function sendPartialResult() {
        try {
            // Ne rien envoyer si le quiz n'a pas commencé ou est terminé
            if (!Array.isArray(flashcards) || flashcards.length === 0) return;
            if (currentCardIndex <= 0) return;
            if (currentCardIndex >= flashcards.length) return;

            const name = getCookie('playerName') || '';
            if (!name) return;

            const meanTime = computeMeanTime();
            const payload = {
                name: name,
                score: Number(score) || 0,
                total: Number(currentCardIndex) || 0,
                tables: Array.isArray(selectedTablesChosen) ? selectedTablesChosen : [],
                exercise_type: exerciseMode || 'mul',
                mean_time_seconds: Number.isFinite(meanTime) ? meanTime : 0
            };
            const url = '/api/result';
            const json = JSON.stringify(payload);

            if (navigator.sendBeacon) {
                const blob = new Blob([json], { type: 'application/json' });
                navigator.sendBeacon(url, blob);
            } else {
                // Fallback pour anciens navigateurs
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: json,
                    keepalive: true
                }).catch(() => {});
            }
        } catch (e) {
            console.warn('beforeunload send error', e);
        }
    }
    window.addEventListener('beforeunload', sendPartialResult);
})();
