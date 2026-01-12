// Collection of kid-friendly celebration GIFs (local files)
// All GIFs are curated and verified child-safe

const celebrationGifs = [
    "gifs/applause.gif",
    "gifs/baymax.gif",
    "gifs/bunny.gif",
    "gifs/cat-happy.gif",
    "gifs/confetti.gif",
    "gifs/minions.gif",
    "gifs/nemo.gif",
    "gifs/olaf.gif",
    "gifs/panda.gif",
    "gifs/penguin.gif",
    "gifs/pikachu.gif",
    "gifs/rainbow.gif",
    "gifs/spongebob.gif",
    "gifs/star.gif",
    "gifs/stitch.gif",
    "gifs/thumbsup.gif"
];

// Get a random celebration GIF
function getRandomCelebrationGif() {
    const index = Math.floor(Math.random() * celebrationGifs.length);
    return celebrationGifs[index];
}

// Congratulation messages for kids
const congratsMessages = [
    "SUPER CHAMPION(NE) !",
    "INCROYABLE !",
    "TU ES UN GENIE !",
    "BRAVO !",
    "FANTASTIQUE !",
    "TU ASSURES !",
    "MAGNIFIQUE !",
    "EXTRAORDINAIRE !",
    "TU ES LE/LA MEILLEUR(E) !",
    "IMPRESSIONNANT !",
    "WAHOU !",
    "TROP FORT(E) !",
    "GENIALISSIME !",
    "TU DECHIRES !",
    "PARFAIT !"
];

function getRandomCongratsMessage() {
    const index = Math.floor(Math.random() * congratsMessages.length);
    return congratsMessages[index];
}
