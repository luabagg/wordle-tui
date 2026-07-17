import {
  createGame,
  cloneSlots,
  normalizeWord,
  rebuildKeyState,
} from './game';
import type { Game, GameState, PuzzleMode, TileState, WordEntry } from './game';
import { defaultLanguage, loadWordBank } from './dictionary';
import { isValidPasteWord } from './input';
import { messages } from './i18n';
import type { WordBank } from './dictionary';
import type { Language } from './i18n';
import type { Action, View } from './input';
import {
  activePuzzleFromGame,
  archiveActivePuzzle,
  buildShareText,
  clearActivePuzzle,
  hasActiveProgress,
  loadStatsResult,
  recordDailyResult,
  saveStats,
  setActivePuzzle,
} from './stats';
import type { ActivePuzzle, GameStats } from './stats';
import {
  emptyTipsSnapshot,
  selectTips,
  selectTipsAsync,
  shouldComputeTipsAsync,
  tipsComputingPlaceholder,
  tipsHistoryFingerprint,
  type TipsSnapshot,
} from './tips';
import {
  dailyAnswer,
  dailyDescriptor,
  formatNextDailyCountdown,
  secondsUntilNextDaily,
} from './words';
import type { DailyDescriptor } from './words';

export type { TipsSnapshot };

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
  notice: string | null;
  persistenceWarning: string | null;
  restartConfirmPending: boolean;
  mode: PuzzleMode;
  hardMode: boolean;
  /** True when the latest submitted row can be undone under current rules. */
  canUndo: boolean;
}

export interface AppEffects {
  now: () => Date;
  saveStats: (stats: GameStats) => void;
  copyText: (text: string) => boolean;
  /**
   * Choose a practice answer from the current language answer bank.
   * Injected for deterministic tests; defaults to a time-seeded pick.
   */
  choosePracticeAnswer?: (bank: WordBank, language: Language, now: Date) => WordEntry;
}

export interface CreateWordleAppOptions {
  language?: Language;
  banks?: Record<Language, WordBank>;
  stats?: GameStats;
  /** Optional load warning when stats were recovered/malformed before app creation. */
  persistenceWarning?: string | null;
  effects?: Partial<AppEffects>;
}

export interface DispatchResult {
  shouldQuit: boolean;
}

export interface WordleApp {
  snapshot(): AppSnapshot;
  dispatch(action: Action): DispatchResult;
  /** Minute tick / external clock advance: refresh countdown + detect daily rollover. */
  onTick(now?: Date): void;
  getGame(): Game;
  getTips(): TipsSnapshot;
  /** Await in-flight cooperative tips ranking (tests / flush helpers). */
  flushTips(): Promise<void>;
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

function defaultChoosePracticeAnswer(bank: WordBank, _language: Language, now: Date): WordEntry {
  if (bank.answers.length === 0) {
    throw new Error('practice answer bank is empty');
  }
  const index = Math.abs(Math.trunc(now.getTime())) % bank.answers.length;
  return bank.answers[index];
}

function applyActivePuzzle(
  game: Game,
  puzzle: ActivePuzzle,
  answer: { key: string; text: string },
  dictionarySize: number,
): void {
  const state = game.state;
  state.answer = answer.text;
  state.answerKey = answer.key;
  state.guesses = [...puzzle.guesses];
  state.evaluations = puzzle.evaluations.map((row) => [...row] as TileState[]);
  game.restoreEditableRow({
    slots: cloneSlots(puzzle.slots),
    cursorPosition: puzzle.cursorPosition,
    message: '',
  });
  state.status = puzzle.status;
  state.keyState = rebuildKeyState(state.guesses, state.evaluations);
  state.language = puzzle.language;
  state.hardMode = Boolean(puzzle.hardMode);
  state.mode = puzzle.mode === 'practice' ? 'practice' : 'daily';
  state.maxGuesses = state.mode === 'practice' ? Number.POSITIVE_INFINITY : 6;

  if (puzzle.status === 'won') {
    state.message = state.mode === 'practice'
      ? messages[puzzle.language].winMessagePractice(state.guesses.length)
      : messages[puzzle.language].winMessage(state.guesses.length);
  } else if (puzzle.status === 'lost') {
    state.message = messages[puzzle.language].loseMessage(state.answer);
  } else if (state.guesses.length > 0) {
    state.message = state.mode === 'practice'
      ? messages[puzzle.language].guessRegisteredPractice(state.guesses.length)
      : messages[puzzle.language].guessRegistered(state.guesses.length);
  } else {
    state.message = state.mode === 'practice'
      ? messages[puzzle.language].practiceLoaded(dictionarySize)
      : messages[puzzle.language].dailyLoaded(dictionarySize);
  }
}

function captureActive(
  language: Language,
  daily: DailyDescriptor,
  game: Game,
  mode: PuzzleMode,
): ActivePuzzle {
  return activePuzzleFromGame({
    dailyId: daily.id,
    language,
    guesses: game.state.guesses,
    evaluations: game.state.evaluations as TileState[][],
    slots: game.state.slots,
    cursorPosition: game.state.cursorPosition,
    status: game.state.status,
    hardMode: game.state.hardMode,
    mode,
  });
}

function needsRestartConfirmation(game: GameState, mode: PuzzleMode): boolean {
  if (mode === 'practice') return false;
  if (game.status !== 'playing') return false;
  return hasActiveProgress({
    guesses: game.guesses,
    slots: game.slots,
    status: game.status,
  });
}

export function createWordleApp(options: CreateWordleAppOptions = {}): WordleApp {
  const banks = options.banks ?? defaultBanks();
  const effects: Required<AppEffects> = {
    now: options.effects?.now ?? (() => new Date()),
    saveStats: options.effects?.saveStats ?? saveStats,
    copyText: options.effects?.copyText ?? (() => false),
    choosePracticeAnswer: options.effects?.choosePracticeAnswer ?? defaultChoosePracticeAnswer,
  };

  let language = options.language ?? defaultLanguage();
  let bank = banks[language];
  let daily = dailyDescriptor(language, effects.now());
  let todayAnswer = dailyAnswer(language, bank.answers, effects.now());

  let stats: GameStats;
  let persistenceWarning: string | null = options.persistenceWarning ?? null;
  if (options.stats) {
    stats = options.stats;
    if (!stats.settings) stats.settings = { hardModeDefault: false };
  } else {
    const loaded = loadStatsResult();
    stats = loaded.stats;
    if (loaded.warning) persistenceWarning = loaded.warning;
  }

  let mode: PuzzleMode = 'daily';
  let hardMode = Boolean(stats.settings?.hardModeDefault);

  const game = createGame({
    answer: todayAnswer,
    dictionary: bank.allWords,
    language,
    hardMode,
    mode: 'daily',
    maxGuesses: 6,
  });

  let view: View = stats.introSeen ? 'game' : 'help';
  let introPending = !stats.introSeen;
  let shareCopied = false;
  let shareCopySucceeded = false;
  let notice: string | null = null;
  let restartConfirmPending = false;
  /** Held daily session while practice is active (language-scoped). */
  let suspendedDaily: ActivePuzzle | null = null;

  // Tips memoization: language + guess/evaluation fingerprint.
  let tipsCacheKey: string | null = null;
  let tipsCache: TipsSnapshot | null = null;
  let tipsJob: Promise<void> | null = null;
  let tipsAbort: AbortController | null = null;
  let tipsGeneration = 0;

  function dictionarySize(): number {
    return Object.keys(bank.allWords).length;
  }

  function persist(): void {
    effects.saveStats(stats);
  }

  function saveCurrentActive(): void {
    if (mode === 'practice') {
      // Practice never writes daily active sessions or stats results.
      return;
    }
    const puzzle = captureActive(language, daily, game, 'daily');
    if (hasActiveProgress(puzzle) || puzzle.status !== 'playing') {
      setActivePuzzle(stats, puzzle, language);
    } else {
      clearActivePuzzle(stats, language);
    }
    persist();
  }

  function recordIfFinished(): void {
    if (mode === 'practice') return;
    if (game.state.status === 'playing') return;
    recordDailyResult(stats, game.state, daily, effects.now());
    // Always keep the completed board restorable; stats recording stays idempotent.
    setActivePuzzle(stats, captureActive(language, daily, game, 'daily'), language);
    persist();
  }

  function canUndoLatest(): boolean {
    if (game.state.guesses.length === 0) return false;
    if (mode === 'practice') return true;
    // Daily: block once a durable result exists for this daily id.
    return !stats.results[daily.id];
  }

  function currentTipsHistory() {
    return game.state.guesses.map((guess, index) => ({
      guess,
      evaluation: game.state.evaluations[index] as TileState[],
    }));
  }

  function tipsArgs() {
    return {
      language,
      history: currentTipsHistory(),
      answerKeys: bank.answers.map((entry) => entry.key),
      allWords: bank.allWords,
    };
  }

  function invalidateTipsCache(): void {
    tipsGeneration += 1;
    tipsCacheKey = null;
    tipsCache = null;
    if (tipsAbort) {
      tipsAbort.abort();
      tipsAbort = null;
    }
    tipsJob = null;
  }

  function cancelTipsCompute(): void {
    if (tipsCache?.status !== 'computing') return;
    invalidateTipsCache();
  }

  function beginTipsCompute(): void {
    const args = tipsArgs();
    const cacheKey = tipsHistoryFingerprint(args.language, args.history);
    if (tipsCache && tipsCacheKey === cacheKey && tipsCache.status === 'ready') return;

    // Filter is cheap; candidate count drives rank cost (pool ≈ answer keys).
    const placeholder = tipsComputingPlaceholder(args);
    if (!shouldComputeTipsAsync(placeholder.candidates.length)) {
      const ready = selectTips(args);
      tipsCacheKey = ready.cacheKey;
      tipsCache = ready;
      return;
    }

    // Immediate feedback: candidate count available while ranking continues.
    tipsCacheKey = cacheKey;
    tipsCache = placeholder;

    const generation = tipsGeneration;
    if (tipsAbort) tipsAbort.abort();
    const controller = new AbortController();
    tipsAbort = controller;

    tipsJob = (async () => {
      try {
        const ready = await selectTipsAsync(args, {
          signal: controller.signal,
          chunkSize: 48,
          onPartial: (ranked) => {
            if (generation !== tipsGeneration) return;
            if (tipsCacheKey !== cacheKey) return;
            tipsCache = {
              candidates: placeholder.candidates,
              ranked,
              bestCandidate: tipsCache?.bestCandidate ?? null,
              status: 'computing',
              cacheKey,
            };
          },
        });
        if (generation !== tipsGeneration) return;
        if (controller.signal.aborted) return;
        tipsCacheKey = ready.cacheKey;
        tipsCache = ready;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        // Fall back to sync so the panel still resolves.
        if (generation === tipsGeneration) {
          const ready = selectTips(args);
          tipsCacheKey = ready.cacheKey;
          tipsCache = ready;
        }
      } finally {
        if (tipsAbort === controller) tipsAbort = null;
      }
    })();
  }

  function ensureTips(): TipsSnapshot {
    const cacheKey = tipsHistoryFingerprint(language, currentTipsHistory());
    if (tipsCache && tipsCacheKey === cacheKey) return tipsCache;
    beginTipsCompute();
    return tipsCache ?? emptyTipsSnapshot(language);
  }

  async function flushTips(): Promise<void> {
    const pending = tipsJob;
    if (pending) await pending;
  }

  function restoreLanguageSession(targetLanguage: Language, at: Date): void {
    // Leaving practice without an explicit return discards the practice board
    // and restores the suspended daily for the previous language first.
    if (mode === 'practice') {
      mode = 'daily';
      suspendedDaily = null;
    }

    language = targetLanguage;
    bank = banks[language];
    daily = dailyDescriptor(language, at);
    todayAnswer = dailyAnswer(language, bank.answers, at);

    const active = stats.activeByLanguage[language];
    if (active && active.dailyId === daily.id) {
      applyActivePuzzle(game, active, todayAnswer, dictionarySize());
      hardMode = game.state.hardMode;
      mode = 'daily';
      if (active.status !== 'playing') recordIfFinished();
      return;
    }

    if (active && active.dailyId !== daily.id) {
      archiveActivePuzzle(stats, active);
      clearActivePuzzle(stats, language);
      persist();
    }

    hardMode = Boolean(stats.settings?.hardModeDefault);
    mode = 'daily';
    game.switchLanguage({
      answer: todayAnswer,
      dictionary: bank.allWords,
      language,
      hardMode,
      mode: 'daily',
      maxGuesses: 6,
    });
    game.state.message = messages[language].dailyLoaded(dictionarySize());
  }

  // Bootstrap restore for initial language/day.
  {
    const active = stats.activeByLanguage[language];
    if (active && active.dailyId === daily.id) {
      applyActivePuzzle(game, active, todayAnswer, dictionarySize());
      hardMode = game.state.hardMode;
      mode = active.mode === 'practice' ? 'daily' : 'daily';
      // Practice is session-only; persisted mode is always treated as daily board.
      if (active.status !== 'playing') recordIfFinished();
    } else if (active && active.dailyId !== daily.id) {
      archiveActivePuzzle(stats, active);
      clearActivePuzzle(stats, language);
      persist();
    } else {
      hardMode = Boolean(stats.settings?.hardModeDefault);
      game.setHardMode(hardMode);
    }
  }

  function completeIntro(): void {
    if (!introPending) return;
    introPending = false;
    stats.introSeen = true;
    persist();
  }

  function switchLanguage(): void {
    restartConfirmPending = false;
    if (mode === 'daily') saveCurrentActive();
    restoreLanguageSession(otherLanguage(language), effects.now());
    shareCopied = false;
    shareCopySucceeded = false;
    notice = null;
    invalidateTipsCache();
    view = 'game';
  }

  function performRestart(): void {
    restartConfirmPending = false;
    if (mode === 'practice') {
      const answer = effects.choosePracticeAnswer(bank, language, effects.now());
      game.reset(answer, {
        hardMode,
        mode: 'practice',
        maxGuesses: Number.POSITIVE_INFINITY,
      });
      shareCopied = false;
      shareCopySucceeded = false;
      notice = null;
      invalidateTipsCache();
      return;
    }

    clearActivePuzzle(stats, language);
    // Restart always targets the active daily descriptor (post-rollover safe).
    todayAnswer = dailyAnswer(language, bank.answers, effects.now());
    daily = dailyDescriptor(language, effects.now());
    game.reset(todayAnswer, {
      hardMode,
      mode: 'daily',
      maxGuesses: 6,
    });
    shareCopied = false;
    shareCopySucceeded = false;
    notice = null;
    invalidateTipsCache();
    persist();
  }

  function requestRestart(): void {
    if (needsRestartConfirmation(game.state, mode)) {
      restartConfirmPending = true;
      view = 'confirmRestart';
      return;
    }
    performRestart();
  }

  function enterPractice(): void {
    if (mode === 'practice') return;
    // Preserve daily board in memory; do not clear persisted daily session.
    if (hasActiveProgress(captureActive(language, daily, game, 'daily')) || game.state.status !== 'playing') {
      suspendedDaily = captureActive(language, daily, game, 'daily');
      // Ensure daily is also on disk so crash during practice still restores it.
      setActivePuzzle(stats, suspendedDaily, language);
      persist();
    } else {
      suspendedDaily = captureActive(language, daily, game, 'daily');
    }

    const answer = effects.choosePracticeAnswer(bank, language, effects.now());
    mode = 'practice';
    game.reset(answer, {
      hardMode,
      mode: 'practice',
      maxGuesses: Number.POSITIVE_INFINITY,
    });
    game.state.message = messages[language].practiceLoaded(dictionarySize());
    shareCopied = false;
    shareCopySucceeded = false;
    notice = null;
    restartConfirmPending = false;
    invalidateTipsCache();
    view = 'game';
  }

  function returnToDaily(): void {
    if (mode !== 'practice') return;
    mode = 'daily';

    const active = suspendedDaily
      ?? stats.activeByLanguage[language]
      ?? null;
    suspendedDaily = null;

    todayAnswer = dailyAnswer(language, bank.answers, effects.now());
    daily = dailyDescriptor(language, effects.now());

    if (active && active.dailyId === daily.id) {
      applyActivePuzzle(game, active, todayAnswer, dictionarySize());
      hardMode = game.state.hardMode;
      if (active.status !== 'playing') recordIfFinished();
    } else {
      hardMode = Boolean(stats.settings?.hardModeDefault);
      game.reset(todayAnswer, {
        hardMode,
        mode: 'daily',
        maxGuesses: 6,
      });
      game.state.message = messages[language].dailyLoaded(dictionarySize());
    }

    game.state.message = game.state.status === 'playing' && game.state.guesses.length === 0
      ? messages[language].practiceReturned
      : game.state.message;
    // Prefer explicit return notice when board was empty/fresh.
    if (game.state.guesses.length === 0 && game.state.status === 'playing') {
      game.state.message = messages[language].practiceReturned;
    }

    shareCopied = false;
    shareCopySucceeded = false;
    notice = null;
    restartConfirmPending = false;
    invalidateTipsCache();
    view = 'game';
    saveCurrentActive();
  }

  function togglePractice(): void {
    if (mode === 'practice') {
      returnToDaily();
    } else {
      enterPractice();
    }
  }

  function toggleHardMode(): void {
    hardMode = !hardMode;
    game.setHardMode(hardMode);
    // Persist as user default for future dailies / new sessions.
    stats.settings = {
      ...(stats.settings ?? { hardModeDefault: false }),
      hardModeDefault: hardMode,
    };
    game.state.message = messages[language].hardModeToggled(hardMode);
    if (mode === 'daily') {
      // Keep hardMode flag on the active session document.
      saveCurrentActive();
    } else {
      // Practice uses the same user setting; keep the suspended daily coherent.
      if (suspendedDaily) {
        suspendedDaily = { ...suspendedDaily, hardMode };
        setActivePuzzle(stats, suspendedDaily, language);
      }
      persist();
    }
  }

  function undoLatest(): void {
    if (game.state.guesses.length === 0) {
      game.state.message = messages[language].undoEmpty;
      return;
    }
    if (!canUndoLatest()) {
      game.state.message = messages[language].undoBlocked;
      return;
    }

    const result = game.undoLatestGuess();
    if (!result.ok) {
      game.state.message = result.reason === 'empty'
        ? messages[language].undoEmpty
        : messages[language].undoBlocked;
      return;
    }

    game.state.message = messages[language].undoDone;
    shareCopied = false;
    shareCopySucceeded = false;
    invalidateTipsCache();
    if (mode === 'daily') {
      saveCurrentActive();
    }
  }

  function syncDaily(at: Date): boolean {
    if (mode === 'practice') {
      // Keep the practice board visible, but apply normal daily rollover semantics
      // to the suspended board so returning never revives a stale daily.
      const nextDaily = dailyDescriptor(language, at);
      if (nextDaily.id !== daily.id) {
        const previous = suspendedDaily ?? stats.activeByLanguage[language];
        if (previous && previous.dailyId === daily.id && hasActiveProgress(previous)) {
          archiveActivePuzzle(stats, previous);
        }
        clearActivePuzzle(stats, language);
        suspendedDaily = null;
        daily = nextDaily;
        todayAnswer = dailyAnswer(language, bank.answers, at);
        notice = messages[language].rolloverNotice;
        persist();
        return true;
      }
      return false;
    }

    const nextDaily = dailyDescriptor(language, at);
    if (nextDaily.id === daily.id) return false;

    const previous = captureActive(language, daily, game, 'daily');
    // Archive any non-empty or finished board for the previous daily id.
    if (hasActiveProgress(previous)) {
      archiveActivePuzzle(stats, previous);
    }
    clearActivePuzzle(stats, language);

    daily = nextDaily;
    todayAnswer = dailyAnswer(language, bank.answers, at);
    hardMode = Boolean(stats.settings?.hardModeDefault);
    game.reset(todayAnswer, {
      hardMode,
      mode: 'daily',
      maxGuesses: 6,
    });
    game.state.message = messages[language].dailyLoaded(dictionarySize());
    shareCopied = false;
    shareCopySucceeded = false;
    restartConfirmPending = false;
    if (view === 'confirmRestart') view = 'game';
    notice = messages[language].rolloverNotice;
    invalidateTipsCache();
    persist();
    return true;
  }

  function onTick(at = effects.now()): void {
    syncDaily(at);
  }

  function getTips(): TipsSnapshot {
    return ensureTips();
  }

  function currentShareText(): string | null {
    if (game.state.status === 'playing') return null;
    if (mode === 'practice') {
      // Practice can still show a board share without daily stats mutation.
      return buildShareText(game.state, 0, 0);
    }
    return buildShareText(game.state, daily.number, stats.currentStreak);
  }

  function applyPaste(text: string): void {
    if (view !== 'game' || game.state.status !== 'playing') return;
    if (!isValidPasteWord(text)) {
      game.state.message = messages[language].invalidPaste;
      return;
    }
    const result = game.setCurrentGuess(normalizeWord(text));
    if (!result.ok) game.state.message = messages[language].invalidPaste;
  }

  function afterMutation(): void {
    if (mode === 'daily') saveCurrentActive();
  }

  function snapshot(): AppSnapshot {
    const current = effects.now();
    // Detect rollover on snapshot so long-lived processes without ticks still recover.
    syncDaily(current);
    return {
      view,
      introPending,
      shareCopied,
      shareCopySucceeded,
      shareText: shareCopied ? currentShareText() : null,
      language,
      daily,
      nextWordIn: formatNextDailyCountdown(secondsUntilNextDaily(language, current)),
      stats,
      game: game.state,
      tips: view === 'tips' ? ensureTips() : null,
      notice,
      persistenceWarning,
      restartConfirmPending,
      mode,
      hardMode: game.state.hardMode,
      canUndo: canUndoLatest(),
    };
  }

  function dispatch(action: Action): DispatchResult {
    if (view === 'confirmRestart' || restartConfirmPending) {
      switch (action.type) {
        case 'quit':
          cancelTipsCompute();
          if (mode === 'daily') saveCurrentActive();
          return { shouldQuit: true };
        case 'confirmRestart':
        case 'submit':
          performRestart();
          view = 'game';
          return { shouldQuit: false };
        case 'cancelRestart':
        case 'backToGame':
          restartConfirmPending = false;
          view = 'game';
          return { shouldQuit: false };
        case 'type': {
          const ch = action.char.toLowerCase();
          if (ch === 'y') {
            performRestart();
            view = 'game';
          } else if (ch === 'n') {
            restartConfirmPending = false;
            view = 'game';
          }
          return { shouldQuit: false };
        }
        case 'noop':
          return { shouldQuit: false };
        default:
          return { shouldQuit: false };
      }
    }

    switch (action.type) {
      case 'quit':
        cancelTipsCompute();
        if (mode === 'practice') {
          // Persist the suspended daily board (already saved on enter) before exit.
        } else {
          saveCurrentActive();
        }
        return { shouldQuit: true };
      case 'restart':
        requestRestart();
        break;
      case 'confirmRestart':
        performRestart();
        break;
      case 'cancelRestart':
        restartConfirmPending = false;
        view = 'game';
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
        // Kick ranking immediately so the panel can show candidate count / progress.
        ensureTips();
        break;
      case 'switchLanguage':
        switchLanguage();
        break;
      case 'toggleHardMode':
        toggleHardMode();
        break;
      case 'togglePractice':
        togglePractice();
        break;
      case 'undo':
        undoLatest();
        break;
      case 'backToGame':
        if (view === 'tips') cancelTipsCompute();
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
        invalidateTipsCache();
        recordIfFinished();
        afterMutation();
        break;
      case 'backspace':
        game.backspace();
        afterMutation();
        break;
      case 'delete':
        game.deleteSlot();
        afterMutation();
        break;
      case 'paste':
        applyPaste(action.text);
        afterMutation();
        break;
      case 'moveCursor':
        game.moveCursor(action.offset);
        afterMutation();
        break;
      case 'setCursor':
        game.setCursorPosition(action.position);
        afterMutation();
        break;
      case 'type':
        game.addLetter(action.char);
        afterMutation();
        break;
      case 'dismissNotice':
        notice = null;
        break;
      case 'noop':
        break;
    }

    // Any typing/navigation while a notice is visible dismisses it for cleaner UX.
    if (action.type !== 'dismissNotice' && notice && view === 'game') {
      if (
        action.type === 'type'
        || action.type === 'submit'
        || action.type === 'backspace'
        || action.type === 'delete'
        || action.type === 'paste'
        || action.type === 'moveCursor'
        || action.type === 'setCursor'
        || action.type === 'backToGame'
        || action.type === 'undo'
        || action.type === 'toggleHardMode'
        || action.type === 'togglePractice'
      ) {
        notice = null;
      }
    }

    return { shouldQuit: false };
  }

  return {
    snapshot,
    dispatch,
    onTick,
    getGame: () => game,
    getTips,
    flushTips,
  };
}

/** Helper for tests/CLI: load stats with warning for injection. */
export function loadInitialStats(): { stats: GameStats; warning?: string } {
  return loadStatsResult();
}
