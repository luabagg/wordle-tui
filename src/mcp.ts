import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { createGame, MAX_GUESSES, TILE, WORD_LENGTH, normalizeWord } from './game';
import type { GameState, GuessInputError } from './game';
import { loadWordBank } from './dictionary';
import type { WordBank } from './dictionary';
import { messages } from './i18n';
import type { Language } from './i18n';
import { dailyAnswer } from './words';
import { selectTips } from './tips';

export interface GameSession {
  game: ReturnType<typeof createGame>;
  enBank: WordBank;
  ptBank: WordBank;
}

export interface McpToolError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pt';
}

function toolError(code: string, message: string): McpToolError {
  return { ok: false, error: { code, message } };
}

function guessInputErrorMessage(error: GuessInputError, language: Language): string {
  switch (error.code) {
    case 'invalid_length':
      return messages[language].wrongLength;
    case 'invalid_chars':
      return messages[language].invalidChars;
    case 'not_in_dictionary':
      return messages[language].notInDictionary;
    case 'game_over':
      return 'Game is already finished.';
    case 'hard_mode_violation':
      return error.message;
    default:
      return 'Invalid guess.';
  }
}

export function getSessionTips(session: GameSession) {
  const language = session.game.state.language;
  const bank = language === 'en' ? session.enBank : session.ptBank;
  const history = session.game.state.guesses.map((guess, i) => ({
    guess: normalizeWord(guess),
    evaluation: session.game.state.evaluations[i],
  }));
  const tips = selectTips({
    language,
    history,
    answerKeys: bank.answers.map((a) => a.key),
    allWords: bank.allWords,
  });
  return {
    candidatesRemaining: tips.candidates.length,
    bestCandidate: tips.bestCandidate,
    topSuggestions: tips.ranked.slice(0, 5).map((r) => ({
      guess: r.guess,
      entropy: r.entropy,
    })),
    candidates: tips.candidates,
    ranked: tips.ranked,
  };
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
      const current = [];
      for (let c = 0; c < WORD_LENGTH; c += 1) {
        const slot = state.slots[c];
        current.push({
          letter: slot ? slot.toUpperCase() : ' ',
          state: TILE.EMPTY,
        });
      }
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
  if (!isLanguage(language)) {
    throw new Error(`Unsupported language: ${String(language)}`);
  }
  const [enBank, ptBank] = [loadWordBank('en'), loadWordBank('pt')];
  const bank = language === 'en' ? enBank : ptBank;
  const answer = dailyAnswer(language, bank.answers);
  const game = createGame({ answer, dictionary: bank.allWords, language });
  game.state.message = messages[language].dailyLoaded(Object.keys(bank.allWords).length);
  return { game, enBank, ptBank };
}

/**
 * Atomic MCP submit: validate length/charset, replace row, submit.
 * On any failure, leave session state unchanged and return a structured error.
 */
export function applySubmitGuess(
  session: GameSession,
  rawGuess: unknown,
): { ok: true; state: ReturnType<typeof buildGameStateResponse> } | McpToolError {
  if (typeof rawGuess !== 'string') {
    return toolError('invalid_chars', 'guess must be a string');
  }

  const language = session.game.state.language;
  if (session.game.state.status !== 'playing') {
    return toolError('game_over', 'Game is already finished.');
  }

  const prior = session.game.captureEditableRow();
  const setResult = session.game.setCurrentGuess(rawGuess);
  if (!setResult.ok) {
    return toolError(setResult.error.code, guessInputErrorMessage(setResult.error, language));
  }

  const submitted = session.game.submitGuess();
  if (!submitted) {
    const rejectMessage = session.game.state.message;
    session.game.restoreEditableRow(prior);
    const code = rejectMessage === messages[language].notInDictionary
      ? 'not_in_dictionary'
      : 'invalid_length';
    return toolError(code, rejectMessage);
  }

  return { ok: true, state: buildGameStateResponse(session.game) };
}

export async function applyStartGame(
  languageArg: unknown,
): Promise<{ ok: true; session: GameSession; state: ReturnType<typeof buildGameStateResponse> } | McpToolError> {
  if (languageArg !== undefined && languageArg !== null && !isLanguage(languageArg)) {
    return toolError('invalid_language', `Unsupported language: ${String(languageArg)}`);
  }

  const language = isLanguage(languageArg) ? languageArg : 'pt';
  const session = await createSession(language);
  return { ok: true, session, state: buildGameStateResponse(session.game) };
}

export function applySwitchLanguage(
  session: GameSession,
  languageArg: unknown,
): { ok: true; state: ReturnType<typeof buildGameStateResponse> } | McpToolError {
  if (!isLanguage(languageArg)) {
    return toolError('invalid_language', `Unsupported language: ${String(languageArg)}`);
  }

  const bank = languageArg === 'en' ? session.enBank : session.ptBank;
  const answer = dailyAnswer(languageArg, bank.answers);
  session.game.switchLanguage({ answer, dictionary: bank.allWords, language: languageArg });
  return { ok: true, state: buildGameStateResponse(session.game) };
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
      const result = await applyStartGame(args?.language);
      if (!result.ok) {
        content.push({ type: 'text', text: JSON.stringify(result, null, 2) });
        return { content, isError: true };
      }
      session = result.session;
      content.push({ type: 'text', text: JSON.stringify(result.state, null, 2) });
    } else if (name === 'get_state') {
      content.push({ type: 'text', text: JSON.stringify(buildGameStateResponse(session.game), null, 2) });
    } else if (name === 'submit_guess') {
      const result = applySubmitGuess(session, args?.guess);
      if (!result.ok) {
        content.push({ type: 'text', text: JSON.stringify(result, null, 2) });
        return { content, isError: true };
      }
      content.push({ type: 'text', text: JSON.stringify(result.state, null, 2) });
    } else if (name === 'switch_language') {
      const result = applySwitchLanguage(session, args?.language);
      if (!result.ok) {
        content.push({ type: 'text', text: JSON.stringify(result, null, 2) });
        return { content, isError: true };
      }
      content.push({ type: 'text', text: JSON.stringify(result.state, null, 2) });
    } else if (name === 'get_tips') {
      const tips = getSessionTips(session);
      content.push({
        type: 'text',
        text: JSON.stringify({
          candidatesRemaining: tips.candidatesRemaining,
          bestCandidate: tips.bestCandidate,
          topSuggestions: tips.topSuggestions,
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
