import { createGame } from './game';
import type { Game, GameState, TileState } from './game';
import { defaultLanguage, loadWordBank } from './dictionary';
import type { WordBank } from './dictionary';
import type { Language } from './i18n';
import type { Action, View } from './input';
import { filterCandidates, normalizeAll, rankGuesses, bestWinProbabilityGuess } from './solver';
import type { GuessScore } from './solver';
import {
  buildShareText,
  loadStats,
  recordDailyResult,
  saveStats,
} from './stats';
import type { GameStats } from './stats';
import {
  dailyAnswer,
  dailyDescriptor,
  formatNextDailyCountdown,
  secondsUntilNextDaily,
} from './words';
import type { DailyDescriptor } from './words';

export interface TipsSnapshot {
  candidates: string[];
  ranked: GuessScore[];
  bestCandidate: string | null;
}

export interface AppSnapshot {
  view: View;
  introPending: boolean;
  shareCopied: boolean;
  shareCopySucceeded: boolean;
  shareText: string | null;
  language: Language;
  daily: DailyDescriptor;
  nextWordIn: string;
  stats: GameStats;
  game: GameState;
  tips: TipsSnapshot | null;
}

export interface AppEffects {
  now: () => Date;
  saveStats: (stats: GameStats) => void;
  copyText: (text: string) => boolean;
}

export interface CreateWordleAppOptions {
  language?: Language;
  banks?: Record<Language, WordBank>;
  stats?: GameStats;
  effects?: Partial<AppEffects>;
}

export interface DispatchResult {
  shouldQuit: boolean;
}

export interface WordleApp {
  snapshot(): AppSnapshot;
  dispatch(action: Action): DispatchResult;
  getGame(): Game;
  getTips(): TipsSnapshot;
}

export function parseLanguage(argv: string[]): Language {
  const flagIndex = argv.findIndex((arg) => arg === '--lang' || arg === '-l');
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    const value = argv[flagIndex + 1].toLowerCase();
    if (value === 'en' || value === 'pt') return value;
  }

  const inline = argv.find((arg) => arg.startsWith('--lang='));
  if (inline) {
    const value = inline.slice('--lang='.length).toLowerCase();
    if (value === 'en' || value === 'pt') return value;
  }

  return defaultLanguage();
}

function otherLanguage(language: Language): Language {
  return language === 'en' ? 'pt' : 'en';
}

function defaultBanks(): Record<Language, WordBank> {
  return {
    en: loadWordBank('en'),
    pt: loadWordBank('pt'),
  };
}

export function createWordleApp(options: CreateWordleAppOptions = {}): WordleApp {
  const banks = options.banks ?? defaultBanks();
  const effects: AppEffects = {
    now: options.effects?.now ?? (() => new Date()),
    saveStats: options.effects?.saveStats ?? saveStats,
    copyText: options.effects?.copyText ?? (() => false),
  };

  let language = options.language ?? defaultLanguage();
  let bank = banks[language];
  let today = effects.now();
  let daily = dailyDescriptor(language, today);
  let todayAnswer = dailyAnswer(language, bank.answers, today);
  const stats = options.stats ?? loadStats();
  const game = createGame({
    answer: todayAnswer,
    dictionary: bank.allWords,
    language,
  });

  let view: View = stats.introSeen ? 'game' : 'help';
  let introPending = !stats.introSeen;
  let shareCopied = false;
  let shareCopySucceeded = false;

  function completeIntro(): void {
    if (!introPending) return;
    introPending = false;
    stats.introSeen = true;
    effects.saveStats(stats);
  }

  function recordIfFinished(): void {
    if (game.state.status === 'playing') return;
    const result = recordDailyResult(stats, game.state, daily, effects.now());
    if (result.recorded) effects.saveStats(stats);
  }

  function switchLanguage(): void {
    language = otherLanguage(language);
    bank = banks[language];
    today = effects.now();
    daily = dailyDescriptor(language, today);
    todayAnswer = dailyAnswer(language, bank.answers, today);
    game.switchLanguage({
      answer: todayAnswer,
      dictionary: bank.allWords,
      language,
    });
    shareCopied = false;
    shareCopySucceeded = false;
    view = 'game';
  }

  function getTips(): TipsSnapshot {
    const history = game.state.guesses.map((guess, index) => ({
      guess: normalizeAll([guess])[0],
      evals: game.state.evaluations[index] as TileState[],
    }));
    const candidateKeys = bank.answers.map((entry) => entry.key);
    const candidates = filterCandidates(candidateKeys, history);
    const guessPool = candidates.length > 0 ? candidateKeys : Object.keys(bank.allWords);
    const ranked = rankGuesses(guessPool, candidates);

    return {
      candidates,
      ranked,
      bestCandidate: bestWinProbabilityGuess(candidates),
    };
  }

  function currentShareText(): string | null {
    if (game.state.status === 'playing') return null;
    return buildShareText(game.state, daily.number, stats.currentStreak);
  }

  function snapshot(): AppSnapshot {
    const now = effects.now();
    return {
      view,
      introPending,
      shareCopied,
      shareCopySucceeded,
      shareText: shareCopied ? currentShareText() : null,
      language,
      daily,
      nextWordIn: formatNextDailyCountdown(secondsUntilNextDaily(language, now)),
      stats,
      game: game.state,
      tips: view === 'tips' ? getTips() : null,
    };
  }

  function dispatch(action: Action): DispatchResult {
    switch (action.type) {
      case 'quit':
        return { shouldQuit: true };
      case 'restart':
        game.reset(todayAnswer);
        shareCopied = false;
        shareCopySucceeded = false;
        break;
      case 'share': {
        const text = currentShareText();
        if (!text) break;
        shareCopied = true;
        try {
          shareCopySucceeded = effects.copyText(text);
        } catch {
          shareCopySucceeded = false;
        }
        break;
      }
      case 'openHelp':
        view = 'help';
        break;
      case 'openProgress':
        view = 'progress';
        break;
      case 'openTips':
        view = 'tips';
        break;
      case 'switchLanguage':
        switchLanguage();
        break;
      case 'backToGame':
        view = 'game';
        break;
      case 'dismissIntro':
        completeIntro();
        view = 'game';
        break;
      case 'submit':
        game.submitGuess();
        shareCopied = false;
        shareCopySucceeded = false;
        recordIfFinished();
        break;
      case 'backspace':
        game.backspace();
        break;
      case 'moveCursor':
        game.moveCursor(action.offset);
        break;
      case 'setCursor':
        game.setCursorPosition(action.position === 'end' ? game.state.currentGuess.length : action.position);
        break;
      case 'type':
        game.addLetter(action.char);
        break;
      case 'noop':
        break;
    }

    return { shouldQuit: false };
  }

  return {
    snapshot,
    dispatch,
    getGame: () => game,
    getTips,
  };
}
