// app.js

let flashcards = [];
let currentCardIndex = 0;
let score = 0;
let timer; // Timer pour le compte à rebours
let delayTimer; // Timer pour les délais entre les questions
const TIME_LIMIT = 6000; // 6 secondes en millisecondes
const MAX_OPERATIONS = 40; // Nombre maximum d'opérations par exercice
let responseTimes = []; // Stocke les temps de réponse
let questionStartTime; // Enregistre l'heure de début de chaque question
let MAX_TABLE = 12; // Nombre maximum de tables disponibles (12 pour multiplications, 10 pour additions)
let exerciseMode = 'mul'; // 'mul', 'add', 'sub', ou 'fact'
let selectedTablesChosen = []; // Stocke les tables sélectionnées pour l'affichage final
let userErrors = []; // Erreurs de l'utilisateur récupérées du serveur
let resultSent = false; // Empêche l'envoi multiple des résultats
let userBestScore = { score: 0, total: 0 }; // Meilleur score précédent de l'utilisateur

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

// Récupère les erreurs de l'utilisateur depuis le serveur
async function fetchUserErrors() {
    const playerName = getCookie('playerName');
    if (!playerName) return [];

    try {
        const response = await fetch(`/api/user-errors?name=${encodeURIComponent(playerName)}&type=${encodeURIComponent(exerciseMode)}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn('Erreur lors de la récupération des erreurs utilisateur:', e);
    }
    return [];
}

// Récupère le meilleur score de l'utilisateur
async function fetchUserBestScore() {
    const playerName = getCookie('playerName');
    if (!playerName) return { score: 0, total: 0 };

    try {
        const response = await fetch(`/api/user-best?name=${encodeURIComponent(playerName)}&type=${encodeURIComponent(exerciseMode)}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn('Erreur lors de la récupération du meilleur score:', e);
    }
    return { score: 0, total: 0 };
}

// Affiche la célébration
function showCelebration(isPerfect, isNewRecord) {
    console.log('showCelebration called', { isPerfect, isNewRecord });
    const overlay = document.getElementById('celebration-overlay');
    const message = document.getElementById('celebration-message');
    const gif = document.getElementById('celebration-gif');
    const subtitle = document.getElementById('celebration-subtitle');
    const closeBtn = document.getElementById('celebration-close');

    console.log('Elements found:', { overlay: !!overlay, message: !!message, gif: !!gif, subtitle: !!subtitle, closeBtn: !!closeBtn });

    message.textContent = getRandomCongratsMessage();
    gif.src = getRandomCelebrationGif();

    if (isPerfect) {
        subtitle.textContent = "SCORE PARFAIT ! Tu as tout bon !";
    } else if (isNewRecord) {
        subtitle.textContent = "NOUVEAU RECORD PERSONNEL !";
    }

    overlay.style.display = 'flex';

    // Fermer la célébration
    const closeHandler = function() {
        overlay.style.display = 'none';
        closeBtn.removeEventListener('click', closeHandler);
    };
    closeBtn.addEventListener('click', closeHandler);

    // Fermer aussi en cliquant en dehors
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.style.display = 'none';
        }
    });
}

// Enregistre une erreur pour l'utilisateur
async function recordUserError(question) {
    const playerName = getCookie('playerName');
    if (!playerName) return;

    try {
        await fetch('/api/user-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: playerName,
                exercise_type: exerciseMode,
                question: question
            })
        });
    } catch (e) {
        console.warn('Erreur lors de l\'enregistrement de l\'erreur:', e);
    }
}

// Sélection pondérée des flashcards (les erreurs ont plus de poids)
function selectWeightedFlashcards(allCards, errors, count) {
    if (allCards.length === 0) return [];
    if (allCards.length <= count) return allCards;

    // Créer une map des erreurs par question
    const errorMap = new Map(errors.map(e => [e.question, e.error_count]));

    // Assigner des poids: erreurs ont 2x le poids par error_count (max 5)
    const weighted = allCards.map(card => ({
        card,
        weight: errorMap.has(card.question)
            ? Math.min(2 * errorMap.get(card.question), 5)
            : 1
    }));

    // Sélection aléatoire pondérée sans remplacement
    const selected = [];
    while (selected.length < count && weighted.length > 0) {
        const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < weighted.length; i++) {
            random -= weighted[i].weight;
            if (random <= 0) {
                selected.push(weighted[i].card);
                weighted.splice(i, 1);
                break;
            }
        }
    }

    return selected;
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

    if (exerciseMode === 'fact') {
        // Mode factorisation: générer des produits uniques
        const productsSet = new Set();
        const productsData = [];

        for (let i = 1; i <= 10; i++) {
            selectedTables.forEach((table) => {
                const product = table * i;
                if (!productsSet.has(product)) {
                    productsSet.add(product);
                    productsData.push({
                        product: product,
                        validFactors: getFactorPairs(product)
                    });
                }
            });
        }

        productsData.forEach(data => {
            // Ne pas inclure les produits sans facteurs valides (ex: nombres premiers > 12)
            if (data.validFactors.length > 0) {
                flashcards.push({
                    question: `${data.product} = ? x ?`,
                    answer: null, // Non utilisé pour le mode fact
                    validFactors: data.validFactors,
                    times_wrong: 0
                });
            }
        });
    } else {
        // Modes mul, add, sub
        for (let i = 1; i <= 10; i++) {
            selectedTables.forEach((table) => {
                let question;
                let answer;
                if (exerciseMode === 'add') {
                    question = `${table} + ${i} = ?`;
                    answer = (table + i).toString();
                } else if (exerciseMode === 'sub') {
                    // Générer des soustractions sans résultat négatif
                    if (i <= table) {
                        question = `${table} - ${i} = ?`;
                        answer = (table - i).toString();
                    } else {
                        question = `${i} - ${table} = ?`;
                        answer = (i - table).toString();
                    }
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

// Fonction utilitaire pour tenter d'afficher le clavier logiciel sur mobile
function ensureKeyboardOpen(inputEl) {
    if (!inputEl) return;
    try {
        // Astuces connues pour iOS/Android afin d'ouvrir le clavier après un focus programmatique
        inputEl.focus({ preventScroll: true });
        inputEl.click();
        // Sur certains navigateurs mobiles, un léger délai puis un second focus aide
        setTimeout(() => {
            // Forcer le curseur à la fin si possible
            const val = inputEl.value || '';
            try { inputEl.setSelectionRange(val.length, val.length); } catch (_) {}
            inputEl.focus({ preventScroll: true });
        }, 50);
    } catch (_) {
        // no-op
    }
}

// Retourne toutes les paires de facteurs pour un nombre donné
// - Les deux facteurs doivent être <= 12
// - Exclut 1×n sauf si c'est la seule option
// Ex: getFactorPairs(12) retourne [[2,6], [3,4]] (sans 1x12)
// Ex: getFactorPairs(44) retourne [[4,11]] (2x22 exclu car 22 > 12)
// Ex: getFactorPairs(7) retourne [[1,7]] (seule option pour un nombre premier)
function getFactorPairs(n) {
    const pairs = [];
    for (let i = 1; i <= Math.sqrt(n); i++) {
        if (n % i === 0) {
            const other = n / i;
            // Les deux facteurs doivent être <= 12
            if (i <= 12 && other <= 12) {
                pairs.push([i, other]);
            }
        }
    }
    // Exclure la paire [1, n] sauf si c'est la seule option
    if (pairs.length > 1) {
        return pairs.filter(pair => pair[0] !== 1);
    }
    return pairs;
}

// Valide la réponse de l'utilisateur pour le mode factorisation
// Accepte: "3,4", "3x4", "3*4", "3 4", "4,3" (l'ordre n'a pas d'importance)
function validateFactorAnswer(userAnswer, validFactors) {
    // Normaliser l'entrée: remplacer les séparateurs par des virgules
    const normalized = userAnswer
        .toLowerCase()
        .replace(/\s+/g, ',')   // espaces en virgule
        .replace(/[x*×]/g, ',') // x, *, × en virgule
        .replace(/,+/g, ',')    // plusieurs virgules en une seule
        .trim();

    const parts = normalized.split(',').filter(p => p.length > 0);

    if (parts.length !== 2) {
        return false;
    }

    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);

    if (isNaN(a) || isNaN(b)) {
        return false;
    }

    // Vérifier contre les paires de facteurs valides (l'ordre n'a pas d'importance)
    return validFactors.some(pair =>
        (pair[0] === a && pair[1] === b) ||
        (pair[0] === b && pair[1] === a)
    );
}

// Fonction pour afficher une flashcard
function displayFlashcard() {
    if (currentCardIndex >= flashcards.length) {
        showResults();
        return;
    }
    const card = flashcards[currentCardIndex];
    document.getElementById('question').innerText = card.question;

    const answerInput = document.getElementById('answer');
    answerInput.value = '';

    // Configurer le type d'entrée selon le mode
    if (exerciseMode === 'fact') {
        answerInput.type = 'text';
        answerInput.inputMode = 'numeric';
        answerInput.placeholder = 'Ex: 3,4 ou 3x4';
        answerInput.removeAttribute('min');
        answerInput.removeAttribute('step');
        answerInput.removeAttribute('pattern');
    } else {
        answerInput.type = 'number';
        answerInput.inputMode = 'numeric';
        answerInput.placeholder = 'Votre réponse';
        answerInput.pattern = '[0-9]*';
        answerInput.min = '0';
        answerInput.step = '1';
    }

    document.getElementById('feedback').innerText = '';
    document.getElementById('timer').innerText = '';

    // Activer le champ de saisie et les boutons
    answerInput.disabled = false;
    document.getElementById('submit').disabled = false;
    document.getElementById('end').disabled = false;

    // Mettre le focus sur le champ de saisie APRÈS l'avoir activé
    answerInput.focus();
    ensureKeyboardOpen(answerInput);

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
async function handleTimeout() {
    clearInterval(timer);

    // Vérifier si le quiz est terminé
    if (currentCardIndex >= flashcards.length) {
        return;
    }

    const card = flashcards[currentCardIndex];

    // Construire l'affichage de la réponse correcte
    let correctAnswerDisplay;
    if (exerciseMode === 'fact') {
        // Afficher toutes les paires de facteurs valides
        correctAnswerDisplay = card.validFactors
            .map(pair => `${pair[0]} x ${pair[1]}`)
            .join(' ou ');
    } else {
        correctAnswerDisplay = card.answer;
    }

    // Afficher le message en français
    document.getElementById('feedback').innerText = `Temps écoulé ! Veuillez répéter 10 fois : ${card.question.replace(' = ? x ?', '')} = ${correctAnswerDisplay}`;

    // Désactiver le champ de saisie et les boutons pendant le délai
    document.getElementById('answer').disabled = true;
    document.getElementById('submit').disabled = true;
    document.getElementById('end').disabled = true;

    // Enregistrer le temps de réponse comme étant la limite de temps
    responseTimes.push(TIME_LIMIT / 1000);

    // Enregistrer l'erreur dans la base de données
    await recordUserError(card.question);

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

    // Vérifier la réponse selon le mode
    let isCorrect = false;
    if (exerciseMode === 'fact') {
        isCorrect = validateFactorAnswer(userAnswer, card.validFactors);
    } else {
        isCorrect = userAnswer.toLowerCase() === card.answer.toLowerCase();
    }

    if (isCorrect) {
        document.getElementById('feedback').innerText = 'Correct !';
        score++;

        currentCardIndex++;

        // Attendre 500ms avant d'afficher la prochaine carte
        delayTimer = setTimeout(displayFlashcard, 500);
    } else {
        // Construire l'affichage de la réponse correcte
        let correctAnswerDisplay;
        if (exerciseMode === 'fact') {
            // Afficher toutes les paires de facteurs valides
            correctAnswerDisplay = card.validFactors
                .map(pair => `${pair[0]} x ${pair[1]}`)
                .join(' ou ');
        } else {
            correctAnswerDisplay = card.answer;
        }

        // Afficher le message en français
        document.getElementById('feedback').innerText = `Veuillez répéter 10 fois : ${card.question.replace(' = ? x ?', '')} = ${correctAnswerDisplay}`;

        // Enregistrer l'erreur dans la base de données
        await recordUserError(card.question);

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

    // Envoi du résultat vers la base de données (et Google Sheets si configuré)
    if (!resultSent) {
        resultSent = true;
        const playerName = getCookie('playerName') || '';
        try {
            sendResultToSheet(playerName, score, currentCardIndex, selectedTablesChosen, meanResponseTimeSec);
        } catch (e) {
            console.warn('Envoi du résultat non effectué:', e);
        }
    }

    // Vérifier si c'est un score parfait ou un nouveau record
    const isPerfect = score === currentCardIndex && currentCardIndex > 0;
    const currentRatio = currentCardIndex > 0 ? score / currentCardIndex : 0;
    const previousRatio = userBestScore.total > 0 ? userBestScore.score / userBestScore.total : 0;
    const isNewRecord = currentRatio > previousRatio && currentCardIndex > 0;

    console.log('Celebration check:', { score, currentCardIndex, isPerfect, currentRatio, previousRatio, isNewRecord, userBestScore });

    // Afficher la célébration si score parfait ou nouveau record
    if (isPerfect || isNewRecord) {
        console.log('Showing celebration!');
        showCelebration(isPerfect, isNewRecord);
    }
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
    } else if (exerciseMode === 'sub') {
        MAX_TABLE = 10;
        if (title) title.textContent = 'Sélectionnez les tables de soustractions (1 à 10) :';
    } else if (exerciseMode === 'fact') {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Exo Mama - Sélectionnez les tables :';
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
    const modeSub = document.getElementById('mode-sub');
    const modeFact = document.getElementById('mode-fact');
    if (modeMul) modeMul.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'mul'; updateModeUI(); }
    });
    if (modeAdd) modeAdd.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'add'; updateModeUI(); }
    });
    if (modeSub) modeSub.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'sub'; updateModeUI(); }
    });
    if (modeFact) modeFact.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'fact'; updateModeUI(); }
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
    // Récupérer les erreurs de l'utilisateur et le meilleur score précédent
    userErrors = await fetchUserErrors();
    userBestScore = await fetchUserBestScore();

    // Générer toutes les flashcards possibles
    const allFlashcards = generateFlashcards(selectedTables);

    // Appliquer la sélection pondérée (erreurs ont plus de chances d'apparaître)
    // et limiter à MAX_OPERATIONS
    flashcards = selectWeightedFlashcards(allFlashcards, userErrors, MAX_OPERATIONS);

    // Mélanger les cartes sélectionnées
    shuffleFlashcards();

    currentCardIndex = 0;
    score = 0;
    responseTimes = [];
    resultSent = false; // Réinitialiser pour la nouvelle session

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
            // Ne rien envoyer si les résultats ont déjà été envoyés
            if (resultSent) return;

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
