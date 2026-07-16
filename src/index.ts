#!/usr/bin/env node
import readline from 'node:readline';
import type { Key } from 'node:readline';
import { createGame } from './game';
import { defaultLanguage, loadWordBank } from './dictionary';
import type { WordBank } from './dictionary';
import {
  dailyAnswer,
  dailyDescriptor,
  formatNextDailyCountdown,
  secondsUntilNextDaily,
} from './words';
import {
  loadStats,
  osc52CopySequence,
  recordDailyResult,
  saveStats,
  buildShareText,
} from './stats';
import {
  enterTerminalUi,
  leaveTerminalUi,
  terminal,
  renderGameLines,
  renderHelpLines,
  renderProgressLines,
} from './render';
import type { RenderGameOptions } from './render';
import { renderTips } from './tips';
import { filterCandidates, normalizeAll, rankGuesses, bestWinProbabilityGuess } from './solver';
import { resolveKey } from './input';
import type { Action, View } from './input';
import type { Language } from './i18n';

function parseLanguage(argv: string[]): Language {
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

export async function run(argv = process.argv.slice(2)) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('This game requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  let language = parseLanguage(argv);
  const banks: Record<Language, WordBank> = {
    en: loadWordBank('en'),
    pt: loadWordBank('pt'),
  };

  let bank = banks[language];
  let daily = dailyDescriptor(language);
  let todayAnswer = dailyAnswer(language, bank.answers);
  const game = createGame({
    answer: todayAnswer,
    dictionary: bank.allWords,
    language,
  });
  const stats = loadStats();
  let view: View = stats.introSeen ? 'game' : 'help';
  let introPending = !stats.introSeen;
  let shareCopied = false;

  function renderOptions(): RenderGameOptions {
    return {
      stats,
      puzzleNumber: daily.number,
      nextWordIn: formatNextDailyCountdown(secondsUntilNextDaily(language)),
      shareCopied,
    };
  }

  function buildTips() {
    const history = game.state.guesses.map((guess, index) => ({
      guess: normalizeAll([guess])[0],
      evals: game.state.evaluations[index],
    }));
    const candidateKeys = bank.answers.map((entry) => entry.key);
    const candidates = filterCandidates(candidateKeys, history);
    const guessPool = candidates.length > 0
      ? candidateKeys
      : Object.keys(bank.allWords);
    const ranked = rankGuesses(guessPool, candidates);
    return renderTips({
      language: game.state.language,
      candidates,
      ranked,
      bestCandidate: bestWinProbabilityGuess(candidates),
      width: process.stdout.columns || 80,
    });
  }

  function draw() {
    const width = process.stdout.columns || 80;
    process.stdout.write(terminal.clearScreen);
    if (view === 'help') {
      process.stdout.write(renderHelpLines(width, game.state.language).join('\n'));
    } else if (view === 'progress') {
      process.stdout.write(renderProgressLines(
        stats,
        width,
        formatNextDailyCountdown(secondsUntilNextDaily(language)),
        game.state.language,
      ).join('\n'));
    } else if (view === 'tips') {
      process.stdout.write(buildTips().join('\n'));
    } else {
      process.stdout.write(renderGameLines(game, width, renderOptions()).join('\n'));
    }
  }

  function completeIntro() {
    introPending = false;
    stats.introSeen = true;
    saveStats(stats);
  }

  function recordIfFinished() {
    if (game.state.status === 'playing') return;
    const result = recordDailyResult(stats, game.state, daily);
    if (result.recorded) saveStats(stats);
  }

  function switchLanguage() {
    language = otherLanguage(language);
    bank = banks[language];
    daily = dailyDescriptor(language);
    todayAnswer = dailyAnswer(language, bank.answers);
    game.switchLanguage({
      answer: todayAnswer,
      dictionary: bank.allWords,
      language,
    });
    shareCopied = false;
    view = 'game';
  }

  function applyAction(action: Action) {
    switch (action.type) {
      case 'quit':
        shutdown(0);
        return;
      case 'restart':
        game.reset(todayAnswer);
        shareCopied = false;
        draw();
        return;
      case 'share':
        process.stdout.write(osc52CopySequence(buildShareText(game.state, daily.number, stats.currentStreak)));
        shareCopied = true;
        draw();
        return;
      case 'openHelp':
        view = 'help';
        draw();
        return;
      case 'openProgress':
        view = 'progress';
        draw();
        return;
      case 'openTips':
        view = 'tips';
        draw();
        return;
      case 'switchLanguage':
        switchLanguage();
        draw();
        return;
      case 'backToGame':
        view = 'game';
        draw();
        return;
      case 'dismissIntro':
        completeIntro();
        view = 'game';
        draw();
        return;
      case 'submit':
        game.submitGuess();
        shareCopied = false;
        recordIfFinished();
        draw();
        return;
      case 'backspace':
        game.backspace();
        draw();
        return;
      case 'moveCursor':
        game.moveCursor(action.offset);
        draw();
        return;
      case 'setCursor':
        game.setCursorPosition(action.position === 'end' ? game.state.currentGuess.length : action.position);
        draw();
        return;
      case 'type':
        game.addLetter(action.char);
        draw();
        return;
      case 'noop':
      default:
        return;
    }
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdout.write(enterTerminalUi());

  function exit() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(leaveTerminalUi());
  }

  function shutdown(exitCode: number) {
    exit();
    process.exit(exitCode);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', (err) => {
    process.stderr.write(`${String(err)}\n`);
    shutdown(1);
  });

  process.stdin.on('keypress', (str: string, key: Key) => {
    const action = resolveKey({ view, status: game.state.status, introPending }, str, key);
    applyAction(action);
  });

  process.stdout.on('resize', () => draw());
  draw();
}

if (require.main === module) {
  if (process.argv.includes('--mcp')) {
    import('./mcp').then((mcp) => mcp.main()).catch((error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    });
  } else {
    run().catch((error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    });
  }
}
