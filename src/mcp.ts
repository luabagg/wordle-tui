import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { createGame, MAX_GUESSES, TILE } from './game';
import type { GameState } from './game';
import { loadWordBank } from './dictionary';
import type { WordBank } from './dictionary';
import { messages } from './i18n';
import type { Language } from './i18n';
import { dailyAnswer, dailyDescriptor } from './words';
import { normalizeWord } from './game';
import { filterCandidates, rankGuesses, bestWinProbabilityGuess } from './solver';

export interface GameSession {
  game: ReturnType<typeof createGame>;
  enBank: WordBank;
  ptBank: WordBank;
}

function buildGrid(state: GameState) {
  const rows = [];
  for (let r = 0; r < MAX_GUESSES; r += 1) {
    if (r < state.guesses.length) {
      rows.push(state.guesses[r].split('').map((ch, c) => ({
        letter: ch.toUpperCase(),
        state: state.evaluations[r][c],
      })));
    } else if (r === state.guesses.length) {
      const current = state.currentGuess.split('').map((ch) => ({
        letter: ch.toUpperCase(),
        state: TILE.EMPTY,
      }));
      while (current.length < 5) current.push({ letter: ' ', state: TILE.EMPTY });
      rows.push(current);
    } else {
      rows.push(Array(5).fill({ letter: ' ', state: TILE.EMPTY }));
    }
  }
  return rows;
}

export function buildGameStateResponse(game: GameSession['game']) {
  const state = game.state;
  return {
    language: state.language,
    status: state.status,
    message: state.message,
    guessesUsed: state.guesses.length,
    guessesRemaining: MAX_GUESSES - state.guesses.length,
    grid: buildGrid(state),
    keyboard: Array.from(state.keyState.entries()).map(([letter, tileState]) => ({ letter, state: tileState })),
  };
}

export async function createSession(language: Language = 'pt'): Promise<GameSession> {
  const [enBank, ptBank] = [loadWordBank('en'), loadWordBank('pt')];
  const bank = language === 'en' ? enBank : ptBank;
  const daily = dailyDescriptor(language);
  const answer = dailyAnswer(language, bank.answers);
  const game = createGame({ answer, dictionary: bank.allWords, language });
  game.state.message = messages[language].dailyLoaded(Object.keys(bank.allWords).length);
  return { game, enBank, ptBank };
}

async function main() {
  let session = await createSession();

  const server = new Server(
    { name: 'wordle-tui-mcp', version: '1.3.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const content: TextContent[] = [];

    if (name === 'start_game') {
      const language = (args?.language as Language) || 'pt';
      session = await createSession(language);
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'get_state') {
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'submit_guess') {
      const guess = String(args?.guess || '').toLowerCase();
      for (const ch of guess) session.game.addLetter(ch);
      session.game.submitGuess();
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'switch_language') {
      const language = String(args?.language || 'en') as Language;
      const bank = language === 'en' ? session.enBank : session.ptBank;
      const daily = dailyDescriptor(language);
      const answer = dailyAnswer(language, bank.answers);
      session.game.switchLanguage({ answer, dictionary: bank.allWords, language });
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'get_tips') {
      const bank = session.game.state.language === 'en' ? session.enBank : session.ptBank;
      const history = session.game.state.guesses.map((guess, i) => ({
        guess: normalizeWord(guess),
        evals: session.game.state.evaluations[i],
      }));
      const candidates = filterCandidates(bank.answers.map((a) => a.key), history);
      const ranked = rankGuesses(Object.keys(bank.allWords), candidates);
      content.push({
        type: 'text',
        text: JSON.stringify({
          candidatesRemaining: candidates.length,
          bestCandidate: bestWinProbabilityGuess(candidates),
          topSuggestions: ranked.slice(0, 5).map((r) => ({ guess: r.guess, entropy: r.entropy })),
        }, null, 2),
      });
    } else {
      content.push({ type: 'text', text: `Unknown tool: ${name}` });
    }

    return { content };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };
