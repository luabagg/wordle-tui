#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGameStateResponse = buildGameStateResponse;
exports.createSession = createSession;
exports.main = main;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const game_1 = require("./game");
const dictionary_1 = require("./dictionary");
const i18n_1 = require("./i18n");
const words_1 = require("./words");
const game_2 = require("./game");
const solver_1 = require("./solver");
function buildGrid(state) {
    const rows = [];
    for (let r = 0; r < game_1.MAX_GUESSES; r += 1) {
        if (r < state.guesses.length) {
            rows.push(state.guesses[r].split('').map((ch, c) => ({
                letter: ch.toUpperCase(),
                state: state.evaluations[r][c],
            })));
        }
        else if (r === state.guesses.length) {
            const current = state.currentGuess.split('').map((ch) => ({
                letter: ch.toUpperCase(),
                state: game_1.TILE.EMPTY,
            }));
            while (current.length < 5)
                current.push({ letter: ' ', state: game_1.TILE.EMPTY });
            rows.push(current);
        }
        else {
            rows.push(Array(5).fill({ letter: ' ', state: game_1.TILE.EMPTY }));
        }
    }
    return rows;
}
function buildGameStateResponse(game) {
    const state = game.state;
    return {
        language: state.language,
        status: state.status,
        message: state.message,
        guessesUsed: state.guesses.length,
        guessesRemaining: game_1.MAX_GUESSES - state.guesses.length,
        grid: buildGrid(state),
        keyboard: Array.from(state.keyState.entries()).map(([letter, tileState]) => ({ letter, state: tileState })),
    };
}
async function createSession(language = 'pt') {
    const [enBank, ptBank] = [(0, dictionary_1.loadWordBank)('en'), (0, dictionary_1.loadWordBank)('pt')];
    const bank = language === 'en' ? enBank : ptBank;
    const daily = (0, words_1.dailyDescriptor)(language);
    const answer = (0, words_1.dailyAnswer)(language, bank.answers);
    const game = (0, game_1.createGame)({ answer, dictionary: bank.allWords, language });
    game.state.message = i18n_1.messages[language].dailyLoaded(Object.keys(bank.allWords).length);
    return { game, enBank, ptBank };
}
async function main() {
    let session = await createSession();
    const server = new index_js_1.Server({ name: 'wordle-tui-mcp', version: '1.3.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'start_game',
                description: 'Start a new game in English or Portuguese.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        language: { type: 'string', enum: ['en', 'pt'] },
                    },
                },
            },
            {
                name: 'get_state',
                description: 'Get the current grid, keyboard state, and message.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'submit_guess',
                description: 'Submit a 5-letter guess.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        guess: { type: 'string', minLength: 5, maxLength: 5 },
                    },
                    required: ['guess'],
                },
            },
            {
                name: 'switch_language',
                description: 'Switch language and restart the daily word.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        language: { type: 'string', enum: ['en', 'pt'] },
                    },
                    required: ['language'],
                },
            },
            {
                name: 'get_tips',
                description: 'Get entropy-ranked suggestions and remaining candidate count.',
                inputSchema: { type: 'object', properties: {} },
            },
        ],
    }));
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const content = [];
        if (name === 'start_game') {
            const language = args?.language || 'pt';
            session = await createSession(language);
            content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
        }
        else if (name === 'get_state') {
            content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
        }
        else if (name === 'submit_guess') {
            const guess = String(args?.guess || '').toLowerCase();
            for (const ch of guess)
                session.game.addLetter(ch);
            session.game.submitGuess();
            content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
        }
        else if (name === 'switch_language') {
            const language = String(args?.language || 'en');
            const bank = language === 'en' ? session.enBank : session.ptBank;
            const daily = (0, words_1.dailyDescriptor)(language);
            const answer = (0, words_1.dailyAnswer)(language, bank.answers);
            session.game.switchLanguage({ answer, dictionary: bank.allWords, language });
            content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
        }
        else if (name === 'get_tips') {
            const bank = session.game.state.language === 'en' ? session.enBank : session.ptBank;
            const history = session.game.state.guesses.map((guess, i) => ({
                guess: (0, game_2.normalizeWord)(guess),
                evals: session.game.state.evaluations[i],
            }));
            const candidates = (0, solver_1.filterCandidates)(bank.answers.map((a) => a.key), history);
            const ranked = (0, solver_1.rankGuesses)(Object.keys(bank.allWords), candidates);
            content.push({
                type: 'text',
                text: JSON.stringify({
                    candidatesRemaining: candidates.length,
                    bestCandidate: (0, solver_1.bestWinProbabilityGuess)(candidates),
                    topSuggestions: ranked.slice(0, 5).map((r) => ({ guess: r.guess, entropy: r.entropy })),
                }, null, 2),
            });
        }
        else {
            content.push({ type: 'text', text: `Unknown tool: ${name}` });
        }
        return { content };
    });
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
