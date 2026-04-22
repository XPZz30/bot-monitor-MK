const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'promocoes.json';

// Mapeamento de palavras-chave para categorias
const CATEGORIES = {
    '🧱 Jogos LEGO': ['LEGO'],
    '👻 Terror & Suspense': ['RESIDENT EVIL', 'EVIL WITHIN', 'UNTIL DAWN', 'DYING LIGHT', 'OUTLAST', 'ALIEN', 'PREY', 'THE LAST OF US', 'DAYS GONE', 'BLOODBORNE', 'LITTLE NIGHTMARES'],
    '🚗 Corrida & Velocidade': ['NEED FOR SPEED', 'GRAN TURISMO', 'F1 ', 'RIDE', 'CREW', 'DIRT', 'WRC', 'CARS', 'HOT WHEELS', 'DRIVECLUB', 'PROJECT CARS', 'ASSETTO', 'BURNOUT', 'CARX'],
    '🔫 Tiro, Ação & Guerra': ['CALL OF DUTY', 'BATTLEFIELD', 'RAINBOW SIX', 'GHOST RECON', 'DOOM', 'WOLFENSTEIN', 'METRO', 'SNIPER', 'BORDERLANDS', 'OVERWATCH', 'FAR CRY', 'TITANFALL', 'METAL SLUG', 'DIVISION'],
    '🕷️ Heróis & Super Produções': ['SPIDER-MAN', 'BATMAN', 'AVENGERS', 'GUARDIANS', 'IRON MAN', 'INJUSTICE', 'DEADPOOL', 'SUPERMAN'],
    '🧩 Ação, Luta & Aventura': ['GOD OF WAR', 'UNCHARTED', 'TOMB RAIDER', 'ASSASSINS CREED', 'MORTAL KOMBAT', 'STREET FIGHTER', 'TEKKEN', 'DRAGON BALL', 'NARUTO', 'ONE PIECE', 'DEVIL MAY CRY', 'GTA', 'RED DEAD', 'MAFIA', 'WATCH DOGS', 'JUST CAUSE', 'HORIZON', 'GHOST OF TSUSHIMA', 'SEKIRO', 'ELDEN RING', 'DARK SOULS', 'SHADOW OF THE COLOSSUS', 'THE LAST GUARDIAN', 'INFAMOUS', 'KNACK', 'RATCHET', 'CRASH', 'SPYRO', 'SONIC', 'RAYMAN', 'MINECRAFT', 'OVERCOOKED', 'PLANTS VS ZOMBIES', 'IT TAKES TWO', 'A WAY OUT', 'UNRAVEL', 'CUPHEAD', 'HOLLOW KNIGHT', 'LIMBO', 'INSIDE', 'SUBNAUTICA', 'STRANDED DEEP', 'ARK', 'CONAN', 'THE SIMS', 'FARMING SIMULATOR', 'FIFA', 'PES', 'EFOOTBALL', 'NBA', 'MADDEN', 'UFC', 'WWE', 'ROCKET LEAGUE', 'TONY HAWK']
};

function getCategory(gameName) {
    const nameUpper = gameName.toUpperCase();

    for (const [category, keywords] of Object.entries(CATEGORIES)) {
        for (const keyword of keywords) {
            if (nameUpper.includes(keyword)) {
                return category;
            }
        }
    }

    return '🎮 Outros Jogos Incríveis';
}

function generateText() {
    try {
        const data = fs.readFileSync(path.join(__dirname, INPUT_FILE), 'utf-8');
        const games = JSON.parse(data);

        // Agrupar jogos por categoria
        const groupedGames = {};

        games.forEach(game => {
            // Limpa o nome do jogo (remove "PARA PS4", "PARA PS5", etc)
            let cleanName = game.name
                .replace(/PARA PS4/g, '')
                .replace(/PARA PS5/g, '')
                .replace(/MIDIA DIGITAL/g, '')
                .trim();

            // Capitaliza apenas a primeira letra de cada palavra
            cleanName = cleanName.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());

            const category = getCategory(game.name);

            if (!groupedGames[category]) {
                groupedGames[category] = [];
            }

            // Evita duplicatas na lista
            if (!groupedGames[category].includes(cleanName)) {
                groupedGames[category].push(cleanName);
            }
        });

        // Ordenar categorias para que "Outros" fique por último
        const sortedCategories = Object.keys(groupedGames).sort((a, b) => {
            if (a === '🎮 Outros Jogos Incríveis') return 1;
            if (b === '🎮 Outros Jogos Incríveis') return -1;
            return a.localeCompare(b);
        });

        // Montar o texto
        let output = `🎮 🔥 SUPER COMBO EXPLOSIVO – SA GAMES 🔥
💛 3 JOGOS POR APENAS R$100,00 – SÓ ENQUANTO DURAR O ESTOQUE!

⚠️ Licenças Secundárias para PS4 & PS5
📌 Escolha qualquer 3 da lista abaixo – mas corre, porque está ACABANDO!

`;

        sortedCategories.forEach(category => {
            const gamesList = groupedGames[category].sort();
            if (gamesList.length > 0) {
                output += `${category}\n`;
                gamesList.forEach(game => {
                    output += `• ${game}\n`;
                });
                output += '\n';
            }
        });

        output += `🚨 OFERTA RELÂMPAGO – ÚLTIMOS LOTES!
Me chama AGORA e garanta seus 3 jogos antes que essa promoção suma do ar.

👥 Grupo de promoções da loja:
https://chat.whatsapp.com/DUcGrYyZSBF7Bmfe2QyBVU
📲 WhatsApp: 18 99814-0806
💛 Instagram: @_sa.games`;

        console.log(output);

        // Salvar em arquivo também
        fs.writeFileSync(path.join(__dirname, 'post_whatsapp.txt'), output, 'utf-8');
        console.log('\n\n✅ Texto gerado e salvo em post_whatsapp.txt');

    } catch (error) {
        console.error('Erro ao gerar texto:', error.message);
    }
}

generateText();
