// app.js

let flashcards = [];
let currentCardIndex = 0;
let score = 0;
let timer; // Timer pour le compte à rebours
let delayTimer; // Timer pour les délais entre les questions
const TIME_LIMIT = 6000; // 6 secondes en millisecondes
const TIME_LIMIT_FACT = 9000; // 9 secondes pour Exo Mama (factorisation)
const MAX_OPERATIONS = 40; // Nombre maximum d'opérations par exercice
const MAX_OPERATIONS_MEGA = 100; // Nombre d'opérations pour Megamix
const MAX_OPERATIONS_DIAMOND = 200; // Nombre d'opérations pour le défi Diamant Megamix

let isDiamondChallenge = false; // Indique si on est dans le défi Diamant
let diamondChallengeScore = 0; // Score cumulé pour le défi Diamant

// Retourne le temps limite en fonction du mode d'exercice
function getTimeLimit(card) {
    // Pour mega mode, vérifier le type de la carte
    if (exerciseMode === 'mega' && card && card.type === 'fact') {
        return TIME_LIMIT_FACT;
    }
    return exerciseMode === 'fact' ? TIME_LIMIT_FACT : TIME_LIMIT;
}
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

// Group management
let currentGroupId = null;
let currentGroupSecretKey = null;
let currentGroupName = null;

// Get group info from cookies
function getGroupFromCookies() {
    const groupId = getCookie('groupId');
    const groupSecretKey = getCookie('groupSecretKey');
    const groupName = getCookie('groupName');
    if (groupId) {
        currentGroupId = parseInt(groupId, 10);
        currentGroupSecretKey = groupSecretKey || null;
        currentGroupName = groupName || null;
        return true;
    }
    return false;
}

// Save group info to cookies
function saveGroupToCookies(groupId, secretKey, name) {
    currentGroupId = groupId;
    currentGroupSecretKey = secretKey;
    currentGroupName = name;
    setCookie('groupId', groupId, 365);
    if (secretKey) setCookie('groupSecretKey', secretKey, 365);
    if (name) setCookie('groupName', name, 365);
}

// Parse secret key from URL or input
function parseSecretKey(input) {
    // Handle full URL like http://example.com/static/?g=abc123
    if (input.includes('?g=')) {
        const match = input.match(/[?&]g=([^&]+)/);
        return match ? match[1] : null;
    }
    // Handle just the secret key
    return input.trim();
}

// Get secret key from URL if present
function getSecretKeyFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('g');
}

// Fetch group info by secret key
async function fetchGroupBySecretKey(secretKey) {
    try {
        const response = await fetch(`/api/groups?secret_key=${encodeURIComponent(secretKey)}`);
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (e) {
        console.warn('Error fetching group:', e);
        return null;
    }
}

// Create a new group
async function createNewGroup(name) {
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (e) {
        console.warn('Error creating group:', e);
        return null;
    }
}

// Copy invite link to clipboard
function copyInviteLink() {
    if (!currentGroupSecretKey) return;
    const url = window.location.origin + window.location.pathname + '?g=' + currentGroupSecretKey;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copy-invite-link');
        const originalText = btn.textContent;
        btn.textContent = 'Copie !';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }).catch(err => {
        console.warn('Failed to copy:', err);
        alert('Lien: ' + url);
    });
}

// Update group display in user bar
function updateGroupDisplay() {
    const groupInfo = document.getElementById('group-info');
    const groupNameDisplay = document.getElementById('group-name-display');
    if (groupInfo && currentGroupName) {
        groupNameDisplay.textContent = currentGroupName;
        groupInfo.style.display = 'flex';
    } else if (groupInfo) {
        groupInfo.style.display = 'none';
    }
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
function showCelebration(isPerfect, isNewRecord, isDiamondMegamix = false) {
    console.log('showCelebration called', { isPerfect, isNewRecord, isDiamondMegamix });
    const overlay = document.getElementById('celebration-overlay');
    const message = document.getElementById('celebration-message');
    const gif = document.getElementById('celebration-gif');
    const subtitle = document.getElementById('celebration-subtitle');
    const closeBtn = document.getElementById('celebration-close');

    console.log('Elements found:', { overlay: !!overlay, message: !!message, gif: !!gif, subtitle: !!subtitle, closeBtn: !!closeBtn });

    // Message spécial pour le Diamant Megamix
    if (isDiamondMegamix) {
        message.textContent = "DIAMANT MEGAMIX !";
    } else {
        message.textContent = getRandomCongratsMessage();
    }

    // Hide GIF while loading and show when ready
    gif.style.opacity = '0';
    gif.style.transition = 'opacity 0.3s';

    const gifUrl = getRandomCelebrationGif();
    console.log('Loading GIF:', gifUrl);

    gif.onload = function() {
        console.log('GIF loaded successfully');
        gif.style.opacity = '1';
    };

    gif.onerror = function() {
        console.error('Failed to load GIF:', gifUrl);
        // Try a different GIF on error
        const fallbackUrl = getRandomCelebrationGif();
        if (fallbackUrl !== gifUrl) {
            gif.src = fallbackUrl;
        } else {
            // Hide the gif element if loading fails
            gif.style.display = 'none';
        }
    };

    gif.src = gifUrl;

    if (isDiamondMegamix) {
        subtitle.textContent = "INCROYABLE ! 200/200 - Tu es un champion ultime !";
    } else if (isPerfect) {
        subtitle.textContent = "SCORE PARFAIT ! Tu as tout bon !";
    } else if (isNewRecord) {
        subtitle.textContent = "NOUVEAU RECORD PERSONNEL !";
    }

    overlay.style.display = 'flex';

    // Fermer la célébration
    const closeHandler = function() {
        overlay.style.display = 'none';
        gif.style.display = 'block'; // Reset for next time
        closeBtn.removeEventListener('click', closeHandler);
    };
    closeBtn.addEventListener('click', closeHandler);

    // Fermer aussi en cliquant en dehors
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            gif.style.display = 'block'; // Reset for next time
        }
    });
}

// Enregistre une erreur pour l'utilisateur
async function recordUserError(question) {
    const playerName = getCookie('playerName');
    if (!playerName) return;

    try {
        const payload = {
            name: playerName,
            exercise_type: exerciseMode,
            question: question
        };
        // Include group_id if set
        if (currentGroupId) {
            payload.group_id = currentGroupId;
        }
        await fetch('/api/user-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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

// Fonction pour générer les flashcards Megamix (mélange de tous les types)
function generateMegamixFlashcards() {
    const flashcards = [];
    const allTables = [];
    for (let i = 1; i <= 12; i++) {
        allTables.push(i);
    }

    // Générer des multiplications
    for (let i = 1; i <= 10; i++) {
        allTables.forEach((table) => {
            flashcards.push({
                question: `${table} x ${i} = ?`,
                answer: (table * i).toString(),
                times_wrong: 0,
                type: 'mul'
            });
        });
    }

    // Générer des additions
    for (let i = 1; i <= 10; i++) {
        allTables.forEach((table) => {
            flashcards.push({
                question: `${table} + ${i} = ?`,
                answer: (table + i).toString(),
                times_wrong: 0,
                type: 'add'
            });
        });
    }

    // Générer des soustractions (sans résultats négatifs)
    for (let i = 1; i <= 10; i++) {
        allTables.forEach((table) => {
            if (i <= table) {
                flashcards.push({
                    question: `${table} - ${i} = ?`,
                    answer: (table - i).toString(),
                    times_wrong: 0,
                    type: 'sub'
                });
            } else {
                flashcards.push({
                    question: `${i} - ${table} = ?`,
                    answer: (i - table).toString(),
                    times_wrong: 0,
                    type: 'sub'
                });
            }
        });
    }

    // Générer des factorisations (produits uniques avec facteurs valides)
    const productsSet = new Set();
    for (let i = 1; i <= 10; i++) {
        allTables.forEach((table) => {
            const product = table * i;
            if (!productsSet.has(product)) {
                productsSet.add(product);
                const validFactors = getFactorPairs(product);
                if (validFactors.length > 0) {
                    flashcards.push({
                        question: `${product} = ? x ?`,
                        answer: null,
                        validFactors: validFactors,
                        times_wrong: 0,
                        type: 'fact'
                    });
                }
            }
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

    // Déterminer le type de question (pour mega mode, utiliser card.type)
    const questionType = (exerciseMode === 'mega' && card.type) ? card.type : exerciseMode;

    // Configurer le type d'entrée selon le type de question
    if (questionType === 'fact') {
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

    const card = flashcards[currentCardIndex];
    let timeLeft = getTimeLimit(card) / 1000; // Convertir en secondes

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

    // Déterminer le type de question (pour mega mode, utiliser card.type)
    const questionType = (exerciseMode === 'mega' && card.type) ? card.type : exerciseMode;

    // Construire l'affichage de la réponse correcte
    let correctAnswerDisplay;
    if (questionType === 'fact') {
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
    responseTimes.push(getTimeLimit(card) / 1000);

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

    // Déterminer le type de question (pour mega mode, utiliser card.type)
    const questionType = (exerciseMode === 'mega' && card.type) ? card.type : exerciseMode;

    // Vérifier la réponse selon le type de question
    let isCorrect = false;
    if (questionType === 'fact') {
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
        if (questionType === 'fact') {
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

    // Vérifier si c'est un score parfait Megamix (100/100) et pas encore en défi Diamant
    const isPerfectMegamix = exerciseMode === 'mega' && score === 100 && currentCardIndex === 100 && !isDiamondChallenge;

    if (isPerfectMegamix) {
        // Proposer le défi Diamant
        document.getElementById('flashcard').innerHTML = `
            <p>Bravo ! Score parfait : ${score}/${currentCardIndex} !</p>
            <p>Temps de réponse moyen : ${meanResponseTimeText} secondes</p>
            <div style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #a8edea, #fed6e3, #667eea); border-radius: 15px;">
                <p style="font-size: 1.2em; font-weight: bold; color: #333;">Tenter le badge Diamant Megamix ?</p>
                <p style="color: #555;">100 questions de plus pour un total de 200/200 !</p>
                <button id="diamond-challenge-yes" style="margin: 10px; padding: 15px 30px; font-size: 1.1em; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 10px; cursor: pointer;">Oui, je relève le défi !</button>
                <button id="diamond-challenge-no" style="margin: 10px; padding: 15px 30px; font-size: 1.1em; background: #ccc; color: #333; border: none; border-radius: 10px; cursor: pointer;">Non merci</button>
            </div>
        `;

        // Ajouter les écouteurs pour les boutons du défi
        document.getElementById('diamond-challenge-yes').addEventListener('click', startDiamondChallenge);
        document.getElementById('diamond-challenge-no').addEventListener('click', finishWithoutDiamond);
        return;
    }

    // Résultats normaux
    let totalScore = score;
    let totalQuestions = currentCardIndex;

    // Si on termine le défi Diamant
    if (isDiamondChallenge) {
        totalScore = diamondChallengeScore + score;
        totalQuestions = 100 + currentCardIndex; // 100 premières + les nouvelles
    }

    document.getElementById('flashcard').innerHTML = `
        <p>Vous avez obtenu ${totalScore} bonnes réponses sur ${totalQuestions}. Tables sélectionnées : ${tablesText}.</p>
        <p>Temps de réponse moyen : ${meanResponseTimeText} secondes</p>
    `;

    // Envoi du résultat vers la base de données (et Google Sheets si configuré)
    if (!resultSent) {
        resultSent = true;
        const playerName = getCookie('playerName') || '';
        try {
            sendResultToSheet(playerName, totalScore, totalQuestions, selectedTablesChosen, meanResponseTimeSec);
        } catch (e) {
            console.warn('Envoi du résultat non effectué:', e);
        }
    }

    // Vérifier si c'est un score parfait ou un nouveau record
    const isPerfect = totalScore === totalQuestions && totalQuestions > 0;
    const currentRatio = totalQuestions > 0 ? totalScore / totalQuestions : 0;
    const previousRatio = userBestScore.total > 0 ? userBestScore.score / userBestScore.total : 0;
    const isNewRecord = currentRatio > previousRatio && totalQuestions > 0;

    console.log('Celebration check:', { totalScore, totalQuestions, isPerfect, currentRatio, previousRatio, isNewRecord, userBestScore });

    // Déterminer le nombre de questions attendu
    let expectedQuestions = MAX_OPERATIONS;
    if (exerciseMode === 'mega') {
        expectedQuestions = isDiamondChallenge ? MAX_OPERATIONS_DIAMOND : MAX_OPERATIONS_MEGA;
    }

    // Afficher la célébration si score parfait ou nouveau record
    if ((isPerfect || isNewRecord) && totalQuestions === expectedQuestions) {
        console.log('Showing celebration!');
        // Célébration spéciale pour le Diamant Megamix
        if (isDiamondChallenge && totalScore === 200 && totalQuestions === 200) {
            showCelebration(true, true, true); // isPerfect, isNewRecord, isDiamondMegamix
        } else {
            showCelebration(isPerfect, isNewRecord);
        }
    }

    // Réinitialiser le défi Diamant
    isDiamondChallenge = false;
    diamondChallengeScore = 0;
}

// Démarrer le défi Diamant (100 questions supplémentaires)
async function startDiamondChallenge() {
    isDiamondChallenge = true;
    diamondChallengeScore = score; // Sauvegarder le score des 100 premières questions

    // Générer 100 nouvelles questions
    const allFlashcards = generateMegamixFlashcards();
    flashcards = selectWeightedFlashcards(allFlashcards, userErrors, MAX_OPERATIONS_MEGA);
    shuffleFlashcards();

    // Réinitialiser pour la deuxième partie
    currentCardIndex = 0;
    score = 0;
    resultSent = false;

    // Réactiver les contrôles
    document.getElementById('submit').addEventListener('click', submitAnswer);
    document.getElementById('answer').addEventListener('keyup', answerKeyUpHandler);
    document.getElementById('end').addEventListener('click', endQuiz);

    displayFlashcard();
}

// Terminer sans tenter le défi Diamant
function finishWithoutDiamond() {
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

    // Envoi du résultat
    if (!resultSent) {
        resultSent = true;
        const playerName = getCookie('playerName') || '';
        try {
            sendResultToSheet(playerName, score, currentCardIndex, selectedTablesChosen, meanResponseTimeSec);
        } catch (e) {
            console.warn('Envoi du résultat non effectué:', e);
        }
    }

    // Afficher la célébration pour le score parfait
    showCelebration(true, true);
}

// Envoi du résultat au backend (qui poste ensuite vers Google Sheets)
function sendResultToSheet(name, score, total, tables, meanTimeSeconds) {
    try {
        const payload = {
            name: name || '',
            score: Number(score) || 0,
            total: Number(total) || 0,
            tables: Array.isArray(tables) ? tables : [],
            exercise_type: exerciseMode || 'mul',
            mean_time_seconds: Number.isFinite(meanTimeSeconds) ? meanTimeSeconds : 0
        };
        // Include group_id if set
        if (currentGroupId) {
            payload.group_id = currentGroupId;
        }
        return fetch('/api/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
    const checkboxesDiv = document.getElementById('checkboxes');
    const unselectBtn = document.getElementById('unselect-all');

    if (exerciseMode === 'add') {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Sélectionnez les tables d\'additions (1 à 12) :';
        if (checkboxesDiv) checkboxesDiv.style.display = '';
        if (unselectBtn) unselectBtn.style.display = '';
    } else if (exerciseMode === 'sub') {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Sélectionnez les tables de soustractions (1 à 12) :';
        if (checkboxesDiv) checkboxesDiv.style.display = '';
        if (unselectBtn) unselectBtn.style.display = '';
    } else if (exerciseMode === 'fact') {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Exo Mama - Sélectionnez les tables :';
        if (checkboxesDiv) checkboxesDiv.style.display = '';
        if (unselectBtn) unselectBtn.style.display = '';
    } else if (exerciseMode === 'mega') {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Megamix - 100 questions mixtes (toutes les tables) :';
        if (checkboxesDiv) checkboxesDiv.style.display = 'none';
        if (unselectBtn) unselectBtn.style.display = 'none';
    } else {
        MAX_TABLE = 12;
        if (title) title.textContent = 'Sélectionnez les tables de multiplications :';
        if (checkboxesDiv) checkboxesDiv.style.display = '';
        if (unselectBtn) unselectBtn.style.display = '';
    }
    generateCheckboxes();
}

// Générer les cases à cocher lors du chargement de la page
window.onload = async function() {
    updateModeUI();

    // DOM elements
    const groupSection = document.getElementById('group-section');
    const groupChoice = document.getElementById('group-choice');
    const groupInvitePrompt = document.getElementById('group-invite-prompt');
    const createGroupForm = document.getElementById('create-group-form');
    const joinGroupForm = document.getElementById('join-group-form');
    const nameSection = document.getElementById('name-section');
    const tableSelection = document.getElementById('table-selection');
    const userBar = document.getElementById('user-bar');
    const userNameDisplay = document.getElementById('user-name-display');
    const logoutBtn = document.getElementById('logout-btn');

    const existingName = getCookie('playerName');
    const hasGroup = getGroupFromCookies();
    const urlSecretKey = getSecretKeyFromURL();

    // Determine which UI to show
    if (hasGroup && existingName) {
        // User has both group and name - show table selection
        if (groupSection) groupSection.style.display = 'none';
        if (nameSection) nameSection.style.display = 'none';
        if (tableSelection) tableSelection.style.display = 'block';
        if (userBar) userBar.style.display = 'flex';
        if (userNameDisplay) userNameDisplay.textContent = existingName;
        updateGroupDisplay();
    } else if (hasGroup && !existingName) {
        // Has group but no name - show name entry
        if (groupSection) groupSection.style.display = 'none';
        if (nameSection) nameSection.style.display = 'block';
        if (tableSelection) tableSelection.style.display = 'none';
        if (userBar) userBar.style.display = 'none';
    } else if (urlSecretKey) {
        // No group but URL has invite link - show invite prompt
        const group = await fetchGroupBySecretKey(urlSecretKey);
        if (group) {
            const inviteGroupName = document.getElementById('invite-group-name');
            if (inviteGroupName) inviteGroupName.textContent = group.name;
            if (groupSection) groupSection.style.display = 'block';
            if (groupChoice) groupChoice.style.display = 'none';
            if (groupInvitePrompt) groupInvitePrompt.style.display = 'block';
            if (nameSection) nameSection.style.display = 'none';
            if (tableSelection) tableSelection.style.display = 'none';
            if (userBar) userBar.style.display = 'none';

            // Store the fetched group for later use
            window.pendingInviteGroup = group;
        } else {
            // Invalid invite link - show group choice
            if (groupSection) groupSection.style.display = 'block';
            if (groupChoice) groupChoice.style.display = 'block';
            if (groupInvitePrompt) groupInvitePrompt.style.display = 'none';
            if (nameSection) nameSection.style.display = 'none';
            if (tableSelection) tableSelection.style.display = 'none';
            if (userBar) userBar.style.display = 'none';
        }
    } else {
        // No group and no invite - show group choice
        if (groupSection) groupSection.style.display = 'block';
        if (groupChoice) groupChoice.style.display = 'block';
        if (groupInvitePrompt) groupInvitePrompt.style.display = 'none';
        if (nameSection) nameSection.style.display = 'none';
        if (tableSelection) tableSelection.style.display = 'none';
        if (userBar) userBar.style.display = 'none';
    }

    // Group UI event handlers
    const acceptInviteBtn = document.getElementById('accept-invite-btn');
    const declineInviteBtn = document.getElementById('decline-invite-btn');
    const createGroupBtn = document.getElementById('create-group-btn');
    const joinGroupBtn = document.getElementById('join-group-btn');
    const cancelCreateGroup = document.getElementById('cancel-create-group');
    const cancelJoinGroup = document.getElementById('cancel-join-group');
    const newGroupFormEl = document.getElementById('new-group-form');
    const joinExistingForm = document.getElementById('join-existing-form');
    const copyInviteLinkBtn = document.getElementById('copy-invite-link');

    if (acceptInviteBtn) {
        acceptInviteBtn.addEventListener('click', function() {
            if (window.pendingInviteGroup) {
                const g = window.pendingInviteGroup;
                saveGroupToCookies(g.id, g.secret_key, g.name);
                if (groupSection) groupSection.style.display = 'none';
                if (nameSection) nameSection.style.display = 'block';
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        });
    }

    if (declineInviteBtn) {
        declineInviteBtn.addEventListener('click', function() {
            window.pendingInviteGroup = null;
            if (groupInvitePrompt) groupInvitePrompt.style.display = 'none';
            if (groupChoice) groupChoice.style.display = 'block';
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    }

    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', function() {
            if (groupChoice) groupChoice.style.display = 'none';
            if (createGroupForm) createGroupForm.style.display = 'block';
        });
    }

    if (joinGroupBtn) {
        joinGroupBtn.addEventListener('click', function() {
            if (groupChoice) groupChoice.style.display = 'none';
            if (joinGroupForm) joinGroupForm.style.display = 'block';
        });
    }

    if (cancelCreateGroup) {
        cancelCreateGroup.addEventListener('click', function() {
            if (createGroupForm) createGroupForm.style.display = 'none';
            if (groupChoice) groupChoice.style.display = 'block';
        });
    }

    if (cancelJoinGroup) {
        cancelJoinGroup.addEventListener('click', function() {
            if (joinGroupForm) joinGroupForm.style.display = 'none';
            if (groupChoice) groupChoice.style.display = 'block';
            document.getElementById('join-error').style.display = 'none';
        });
    }

    if (newGroupFormEl) {
        newGroupFormEl.addEventListener('submit', async function(e) {
            e.preventDefault();
            const nameInput = document.getElementById('new-group-name');
            const name = nameInput.value.trim();
            if (!name) return;

            const group = await createNewGroup(name);
            if (group) {
                saveGroupToCookies(group.id, group.secret_key, group.name);
                if (groupSection) groupSection.style.display = 'none';
                if (nameSection) nameSection.style.display = 'block';
            } else {
                alert('Erreur lors de la creation du groupe');
            }
        });
    }

    if (joinExistingForm) {
        joinExistingForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const input = document.getElementById('group-secret-key');
            const errorEl = document.getElementById('join-error');
            const secretKey = parseSecretKey(input.value);
            if (!secretKey) {
                errorEl.textContent = 'Veuillez entrer un lien ou une cle valide';
                errorEl.style.display = 'block';
                return;
            }

            const group = await fetchGroupBySecretKey(secretKey);
            if (group) {
                saveGroupToCookies(group.id, group.secret_key, group.name);
                if (groupSection) groupSection.style.display = 'none';
                if (nameSection) nameSection.style.display = 'block';
                errorEl.style.display = 'none';
            } else {
                errorEl.textContent = 'Groupe non trouve. Verifiez le lien.';
                errorEl.style.display = 'block';
            }
        });
    }

    if (copyInviteLinkBtn) {
        copyInviteLinkBtn.addEventListener('click', copyInviteLink);
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
    const modeMega = document.getElementById('mode-mega');
    if (modeMega) modeMega.addEventListener('change', function() {
        if (this.checked) { exerciseMode = 'mega'; updateModeUI(); }
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
            updateGroupDisplay();
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

    // Lire le mode sélectionné directement depuis les radio buttons (évite les bugs de synchronisation)
    const selectedModeRadio = document.querySelector('input[name="mode"]:checked');
    if (selectedModeRadio) {
        exerciseMode = selectedModeRadio.value;
    }

    let selectedTables = [];

    // Pour Megamix, utiliser toutes les tables automatiquement
    if (exerciseMode === 'mega') {
        for (let i = 1; i <= 12; i++) {
            selectedTables.push(i);
        }
    } else {
        // Récupérer les tables sélectionnées
        const checkboxes = document.querySelectorAll('input[name="tables"]:checked');
        checkboxes.forEach((checkbox) => {
            selectedTables.push(parseInt(checkbox.value));
        });

        if (selectedTables.length === 0) {
            alert("Veuillez sélectionner au moins une table.");
            return;
        }
    }

    // Conserver pour le message de score final
    selectedTablesChosen = selectedTables.slice();

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
    let allFlashcards;
    let maxOps;

    if (exerciseMode === 'mega') {
        allFlashcards = generateMegamixFlashcards();
        maxOps = MAX_OPERATIONS_MEGA;
    } else {
        allFlashcards = generateFlashcards(selectedTables);
        maxOps = MAX_OPERATIONS;
    }

    // Appliquer la sélection pondérée (erreurs ont plus de chances d'apparaître)
    // et limiter au nombre d'opérations approprié
    flashcards = selectWeightedFlashcards(allFlashcards, userErrors, maxOps);

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
    currentGroupId = null;
    currentGroupSecretKey = null;
    currentGroupName = null;

    // Hide quiz UI and table selection; show group selection
    const flashcardDiv = document.getElementById('flashcard');
    const tableSelection = document.getElementById('table-selection');
    const nameSection = document.getElementById('name-section');
    const groupSection = document.getElementById('group-section');
    const groupChoice = document.getElementById('group-choice');
    const userBar = document.getElementById('user-bar');
    const nameInput = document.getElementById('player-name');

    if (flashcardDiv) flashcardDiv.style.display = 'none';
    if (tableSelection) tableSelection.style.display = 'none';
    if (nameSection) nameSection.style.display = 'none';
    if (groupSection) groupSection.style.display = 'block';
    if (groupChoice) groupChoice.style.display = 'block';
    if (userBar) userBar.style.display = 'none';
    if (nameInput) nameInput.value = '';

    // Clear all cookies
    deleteCookie('playerName');
    deleteCookie('groupId');
    deleteCookie('groupSecretKey');
    deleteCookie('groupName');
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
            // Include group_id if set
            if (currentGroupId) {
                payload.group_id = currentGroupId;
            }
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
