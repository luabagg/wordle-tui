import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';
import type { CliRenderer, TerminalCapabilities } from '@opentui/core';
import type { AppSnapshot } from './app';
import { MAX_GUESSES, TILE, WORD_LENGTH } from './game';
import type { GameStatus, TileState } from './game';
import { messages } from './i18n';
import { buildShareText, distributionRows, winRate } from './stats';
import type { ShareGlyphMode } from './stats';

export type ColorMode = 'rgb' | 'basic' | 'none';
export type GlyphMode = 'unicode' | 'ascii';

export interface PresentationMode {
  color: ColorMode;
  glyphs: GlyphMode;
}

/** OpenTUI color capabilities used by the view. WidthMethod is not glyph support. */
export type CapabilityBag = Pick<TerminalCapabilities, 'rgb' | 'ansi256'> | Partial<{
  rgb: boolean;
  ansi256: boolean;
}>;

const fullPalette = {
  canvas: '#0f1115',
  panel: '#1b1f27',
  panelBright: '#29303b',
  ink: '#f8fafc',
  muted: '#94a3b8',
  faint: '#64748b',
  accent: '#67e8f9',
  correct: '#86efac',
  present: '#fde68a',
  absent: '#a1a1aa',
  active: '#38bdf8',
  danger: '#fda4af',
  darkInk: '#111827',
} as const;

const basicPalette = {
  canvas: '#000000',
  panel: '#1c1c1c',
  panelBright: '#303030',
  ink: '#ffffff',
  muted: '#a8a8a8',
  faint: '#808080',
  accent: '#00d7ff',
  correct: '#5fd75f',
  present: '#ffd75f',
  absent: '#808080',
  active: '#5fafff',
  danger: '#ff5f87',
  darkInk: '#000000',
} as const;

type Palette = { [Key in keyof typeof fullPalette]: string };

interface TileCell {
  box: BoxRenderable;
  text: TextRenderable;
}

interface TextPanel {
  panel: BoxRenderable;
  title: TextRenderable;
  body: TextRenderable;
  back: TextRenderable;
}

export interface OpenTuiView {
  readonly root: BoxRenderable;
  render(snapshot: AppSnapshot): void;
  destroy(): void;
  /** Test/helper: current presentation mode derived from capabilities. */
  getPresentationMode(): PresentationMode;
}

export interface CreateOpenTuiViewOptions {
  /** Injected color capability bag for tests; otherwise read from renderer.capabilities. */
  capabilities?: CapabilityBag | null;
  /** Explicit glyph choice; OpenTUI WidthMethod does not describe Unicode support. */
  glyphs?: GlyphMode;
}

export function resolvePresentationMode(
  caps: CapabilityBag | null | undefined,
  glyphs: GlyphMode = 'unicode',
): PresentationMode {
  if (!caps) return { color: 'rgb', glyphs };
  if (caps.rgb === false && caps.ansi256 === false) {
    return { color: 'none', glyphs };
  }
  if (caps.rgb === false) {
    return { color: 'basic', glyphs };
  }
  return { color: 'rgb', glyphs };
}

function emptySlotGlyph(glyphs: GlyphMode): string {
  return glyphs === 'ascii' ? '.' : '·';
}

function legendMarks(glyphs: GlyphMode): { correct: string; present: string; absent: string } {
  if (glyphs === 'ascii') {
    return { correct: '[G]', present: '[Y]', absent: '[B]' };
  }
  return { correct: '✓', present: '~', absent: '×' };
}

function createText(
  renderer: CliRenderer,
  options: ConstructorParameters<typeof TextRenderable>[1] = {},
): TextRenderable {
  return new TextRenderable(renderer, {
    selectable: false,
    wrapMode: 'word',
    fg: fullPalette.ink,
    ...options,
  });
}

function setPanelVisible(panel: BoxRenderable, visible: boolean): void {
  panel.visible = visible;
  panel.height = visible ? 'auto' : 0;
}

function createTextPanel(renderer: CliRenderer, id: string): TextPanel {
  const panel = new BoxRenderable(renderer, {
    id,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    paddingLeft: 1,
    paddingRight: 1,
  });
  const title = createText(renderer, {
    id: `${id}-title`,
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const body = createText(renderer, {
    id: `${id}-body`,
    width: '100%',
    fg: fullPalette.ink,
  });
  const back = createText(renderer, {
    id: `${id}-back`,
    fg: fullPalette.correct,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  panel.add(title);
  panel.add(body);
  panel.add(back);
  return { panel, title, body, back };
}

export function createOpenTuiView(
  renderer: CliRenderer,
  options: CreateOpenTuiViewOptions = {},
): OpenTuiView {
  const root = new BoxRenderable(renderer, {
    id: 'wordle-root',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: fullPalette.canvas,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 1,
    paddingRight: 1,
    overflow: 'hidden',
  });

  const shell = new BoxRenderable(renderer, {
    id: 'wordle-shell',
    width: '100%',
    maxWidth: 76,
    flexDirection: 'column',
    alignItems: 'center',
  });
  root.add(shell);

  const sizePanel = new BoxRenderable(renderer, {
    id: 'size-warning',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
  });
  const sizeTitle = createText(renderer, {
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const sizeMessage = createText(renderer, {
    width: '100%',
    fg: fullPalette.present,
  });
  sizePanel.add(sizeTitle);
  sizePanel.add(sizeMessage);
  shell.add(sizePanel);

  const gamePanel = new BoxRenderable(renderer, {
    id: 'game-view',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
  });
  shell.add(gamePanel);

  const title = createText(renderer, {
    id: 'game-title',
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const subtitle = createText(renderer, { id: 'game-subtitle', fg: fullPalette.muted, height: 1 });
  const usage = createText(renderer, { id: 'game-usage', fg: fullPalette.faint, height: 1 });
  const controls = createText(renderer, { id: 'game-controls', width: '100%', fg: fullPalette.faint });
  const accentHint = createText(renderer, { id: 'game-accent-hint', fg: fullPalette.muted, height: 1 });
  gamePanel.add(title);
  gamePanel.add(subtitle);
  gamePanel.add(usage);
  gamePanel.add(controls);
  gamePanel.add(accentHint);

  const board = new ScrollBoxRenderable(renderer, {
    id: 'board',
    width: '100%',
    height: MAX_GUESSES,
    marginTop: 1,
    scrollX: false,
    scrollY: true,
    verticalScrollbarOptions: { visible: false, showArrows: false },
    horizontalScrollbarOptions: { visible: false, showArrows: false },
    stickyScroll: true,
    stickyStart: 'bottom',
    contentOptions: {
      flexDirection: 'column',
      alignItems: 'center',
    },
  });
  const boardTiles: TileCell[][] = [];
  const boardRowBoxes: BoxRenderable[] = [];

  function createBoardRow(rowIndex: number): TileCell[] {
    const row = new BoxRenderable(renderer, {
      id: `board-row-${rowIndex}`,
      flexDirection: 'row',
      gap: 1,
      height: 1,
    });
    const cells: TileCell[] = [];
    for (let column = 0; column < WORD_LENGTH; column += 1) {
      const box = new BoxRenderable(renderer, {
        id: `tile-${rowIndex}-${column}`,
        width: 5,
        height: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fullPalette.panelBright,
      });
      const text = createText(renderer, {
        content: '·',
        fg: fullPalette.muted,
        attributes: TextAttributes.BOLD,
        height: 1,
      });
      box.add(text);
      row.add(box);
      cells.push({ box, text });
    }
    board.add(row);
    boardRowBoxes.push(row);
    boardTiles.push(cells);
    return cells;
  }

  function ensureBoardRows(count: number): void {
    while (boardTiles.length < count) {
      createBoardRow(boardTiles.length);
    }
    for (let i = 0; i < boardRowBoxes.length; i += 1) {
      const visible = i < count;
      boardRowBoxes[i].visible = visible;
      boardRowBoxes[i].height = visible ? 1 : 0;
    }
  }

  for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex += 1) {
    createBoardRow(rowIndex);
  }
  gamePanel.add(board);

  const keyboard = new BoxRenderable(renderer, {
    id: 'keyboard',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 1,
  });
  const keyboardRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const keyCells = new Map<string, TileCell>();
  const keyRowBoxes: BoxRenderable[] = [];
  for (const [rowIndex, letters] of keyboardRows.entries()) {
    const row = new BoxRenderable(renderer, {
      id: `keyboard-row-${rowIndex}`,
      flexDirection: 'row',
      gap: 1,
      height: 1,
    });
    keyRowBoxes.push(row);
    for (const letter of letters) {
      const box = new BoxRenderable(renderer, {
        id: `key-${letter}`,
        width: 3,
        height: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fullPalette.panelBright,
      });
      const text = createText(renderer, {
        content: letter.toUpperCase(),
        fg: fullPalette.muted,
        attributes: TextAttributes.BOLD,
        height: 1,
      });
      box.add(text);
      row.add(box);
      keyCells.set(letter, { box, text });
    }
    keyboard.add(row);
  }
  gamePanel.add(keyboard);

  const legend = createText(renderer, {
    id: 'legend',
    fg: fullPalette.muted,
    height: 1,
  });
  const status = createText(renderer, {
    id: 'status',
    width: '100%',
    attributes: TextAttributes.BOLD,
  });
  const share = createText(renderer, {
    id: 'share-result',
    width: '100%',
    fg: fullPalette.ink,
    wrapMode: 'none',
  });
  gamePanel.add(legend);
  gamePanel.add(status);
  gamePanel.add(share);

  const notice = createText(renderer, {
    id: 'notice',
    width: '100%',
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
  });
  const persistenceWarning = createText(renderer, {
    id: 'persistence-warning',
    width: '100%',
    fg: fullPalette.present,
  });
  gamePanel.add(notice);
  gamePanel.add(persistenceWarning);

  const help = createTextPanel(renderer, 'help-view');
  const progress = createTextPanel(renderer, 'progress-view');
  const tips = createTextPanel(renderer, 'tips-view');
  const confirm = createTextPanel(renderer, 'confirm-restart-view');
  shell.add(help.panel);
  shell.add(progress.panel);
  shell.add(tips.panel);
  shell.add(confirm.panel);

  renderer.root.add(root);

  function currentCapabilities(): CapabilityBag | null {
    if (options.capabilities !== undefined) return options.capabilities;
    return (renderer.capabilities as CapabilityBag | null) ?? null;
  }

  function presentation(): PresentationMode {
    return resolvePresentationMode(currentCapabilities(), options.glyphs ?? 'unicode');
  }

  function paletteFor(mode: PresentationMode): Palette {
    return mode.color === 'basic' ? basicPalette : fullPalette;
  }

  function tileBackground(
    state: TileState,
    active: boolean,
    mode: PresentationMode,
    palette: Palette,
  ): string {
    // Keep one neutral background in monochrome; state is encoded by glyph/case/attributes.
    if (mode.color === 'none') return palette.canvas;
    if (active) return palette.active;
    if (state === TILE.CORRECT) return palette.correct;
    if (state === TILE.PRESENT) return palette.present;
    if (state === TILE.ABSENT) return palette.absent;
    return palette.panelBright;
  }

  function tileForeground(
    state: TileState,
    active: boolean,
    mode: PresentationMode,
    palette: Palette,
  ): string {
    if (mode.color === 'none') {
      // Colorless: distinguish states with bold / dim only.
      return palette.ink;
    }
    return active || state !== TILE.EMPTY ? palette.darkInk : palette.muted;
  }

  function tileAttributes(
    state: TileState,
    active: boolean,
    mode: PresentationMode,
  ): number {
    if (mode.color !== 'none') return TextAttributes.BOLD;
    if (active) return TextAttributes.BOLD | TextAttributes.UNDERLINE;
    if (state === TILE.CORRECT) return TextAttributes.BOLD;
    if (state === TILE.PRESENT) return TextAttributes.UNDERLINE;
    if (state === TILE.ABSENT) return 0;
    return 0;
  }

  function colorlessLetter(
    letter: string,
    state: TileState,
    active: boolean,
    glyphs: GlyphMode,
  ): string {
    if (active && state === TILE.EMPTY) return letter === emptySlotGlyph(glyphs) ? '>' : letter;
    if (state === TILE.CORRECT) return letter === emptySlotGlyph(glyphs) ? 'G' : letter.toUpperCase();
    if (state === TILE.PRESENT) return letter === emptySlotGlyph(glyphs) ? 'Y' : letter.toLowerCase();
    if (state === TILE.ABSENT) return letter === emptySlotGlyph(glyphs) ? 'x' : letter.toLowerCase();
    return letter;
  }

  function statusColor(status: GameStatus, mode: PresentationMode, palette: Palette): string {
    if (mode.color === 'none') return palette.ink;
    if (status === 'won') return palette.correct;
    if (status === 'lost') return palette.danger;
    return palette.present;
  }

  function shareGlyphMode(glyphs: GlyphMode): ShareGlyphMode {
    return glyphs === 'ascii' ? 'ascii' : 'emoji';
  }

  function shareTextFor(snapshot: AppSnapshot, glyphs: GlyphMode): string | null {
    if (snapshot.game.status === 'playing') return null;
    // Prefer the snapshot text when it matches the glyph mode (default emoji path).
    if (glyphs === 'unicode' && snapshot.shareText) return snapshot.shareText;
    return buildShareText(
      snapshot.game,
      snapshot.daily.number,
      snapshot.stats.currentStreak,
      { glyphs: shareGlyphMode(glyphs) },
    );
  }

  function renderBoard(snapshot: AppSnapshot, compact: boolean, mode: PresentationMode, palette: Palette): void {
    const currentRow = snapshot.game.guesses.length;
    const activeIndex = Math.min(snapshot.game.cursorPosition, WORD_LENGTH - 1);
    const empty = emptySlotGlyph(mode.glyphs);
    const isPractice = snapshot.mode === 'practice' || snapshot.game.mode === 'practice';
    // Practice grows beyond 6; daily stays fixed at MAX_GUESSES.
    const rowCount = isPractice
      ? Math.max(MAX_GUESSES, snapshot.game.guesses.length + (snapshot.game.status === 'playing' ? 1 : 0))
      : MAX_GUESSES;
    ensureBoardRows(rowCount);

    for (let row = 0; row < rowCount; row += 1) {
      const submitted = row < snapshot.game.guesses.length;
      const activeRow = row === currentRow && snapshot.game.status === 'playing';
      const evaluations = submitted ? snapshot.game.evaluations[row] : [];

      for (let column = 0; column < WORD_LENGTH; column += 1) {
        const cell = boardTiles[row][column];
        const state = evaluations[column] ?? TILE.EMPTY;
        const active = activeRow && column === activeIndex;
        let letter = empty;
        if (submitted) {
          letter = snapshot.game.guesses[row][column]?.toUpperCase() || empty;
        } else if (activeRow) {
          const slot = snapshot.game.slots[column];
          letter = slot ? slot.toUpperCase() : empty;
        }
        if (mode.color === 'none') {
          letter = colorlessLetter(letter, state, active, mode.glyphs);
        }
        cell.box.width = compact ? 3 : 5;
        cell.box.backgroundColor = tileBackground(state, active, mode, palette);
        cell.text.content = letter;
        cell.text.fg = tileForeground(state, active, mode, palette);
        cell.text.attributes = tileAttributes(state, active, mode);
      }
    }

    if (isPractice && rowCount > MAX_GUESSES) {
      board.scrollChildIntoView(`board-row-${rowCount - 1}`);
    } else {
      board.scrollTo(0);
    }
  }

  function renderKeyboard(snapshot: AppSnapshot, compact: boolean, mode: PresentationMode, palette: Palette): void {
    for (const row of keyRowBoxes) row.gap = compact ? 0 : 1;
    for (const [letter, cell] of keyCells) {
      const state = snapshot.game.keyState.get(letter) ?? TILE.EMPTY;
      let content = letter.toUpperCase();
      if (mode.color === 'none') {
        if (state === TILE.CORRECT) content = letter.toUpperCase();
        else if (state === TILE.PRESENT) content = letter.toLowerCase();
        else if (state === TILE.ABSENT) content = '-';
      }
      cell.box.backgroundColor = tileBackground(state, false, mode, palette);
      cell.text.content = content;
      cell.text.fg = tileForeground(state, false, mode, palette);
      cell.text.attributes = tileAttributes(state, false, mode);
    }
  }

  function renderGame(snapshot: AppSnapshot, compact: boolean, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    const isPractice = snapshot.mode === 'practice' || snapshot.game.mode === 'practice';
    const hardOn = snapshot.hardMode || snapshot.game.hardMode;
    const guessesLeft = Math.max(0, MAX_GUESSES - snapshot.game.guesses.length);
    const controlsText = snapshot.game.status === 'playing'
      ? strings.controlsPlaying
      : strings.controlsFinished;
    const marks = legendMarks(mode.glyphs);
    const hardLabel = hardOn ? strings.hardModeOn : strings.hardModeOff;

    title.content = `${strings.title}  [${hardLabel}]${isPractice ? '  [PRACTICE]' : ''}`;
    title.fg = palette.accent;
    subtitle.content = isPractice ? strings.subtitlePractice : strings.subtitle;
    subtitle.fg = palette.muted;
    usage.content = isPractice
      ? strings.guessesUsedPractice(snapshot.game.guesses.length)
      : strings.guessesUsed(snapshot.game.guesses.length, guessesLeft);
    usage.fg = palette.faint;
    controls.content = controlsText;
    controls.fg = palette.faint;
    accentHint.content = strings.accentHint;
    accentHint.fg = palette.muted;
    subtitle.visible = !compact;
    subtitle.height = compact ? 0 : 1;
    controls.visible = !compact;
    controls.height = compact ? 0 : 'auto';
    accentHint.visible = !compact && Boolean(strings.accentHint);
    accentHint.height = accentHint.visible ? 1 : 0;

    renderBoard(snapshot, compact, mode, palette);
    renderKeyboard(snapshot, compact, mode, palette);

    const showKeyboard = !snapshot.shareCopied && renderer.height >= 18;
    keyboard.visible = showKeyboard;
    keyboard.height = showKeyboard ? 'auto' : 0;
    legend.visible = !compact && showKeyboard;
    legend.height = legend.visible ? 1 : 0;
    legend.fg = palette.muted;
    legend.content = mode.color === 'none'
      ? `${strings.helpLegendCorrect}: ${marks.correct} (bold)  ${strings.helpLegendPresent}: ${marks.present} (underline)  ${strings.helpLegendAbsent}: ${marks.absent}`
      : `${strings.helpLegendCorrect}: ${marks.correct}  ${strings.helpLegendPresent}: ${marks.present}  ${strings.helpLegendAbsent}: ${marks.absent}`;

    status.content = snapshot.game.message || ' ';
    status.fg = statusColor(snapshot.game.status, mode, palette);

    notice.content = snapshot.notice || '';
    notice.visible = Boolean(snapshot.notice);
    notice.height = snapshot.notice ? 'auto' : 0;
    notice.fg = mode.color === 'none' ? palette.ink : palette.accent;

    persistenceWarning.content = snapshot.persistenceWarning || '';
    persistenceWarning.visible = Boolean(snapshot.persistenceWarning);
    persistenceWarning.height = snapshot.persistenceWarning ? 'auto' : 0;
    persistenceWarning.fg = mode.color === 'none' ? palette.ink : palette.present;

    if (snapshot.game.status !== 'playing' && !snapshot.shareCopied) {
      share.content = strings.sharePrompt;
      share.fg = mode.color === 'none' ? palette.ink : palette.correct;
    } else if (snapshot.shareCopied) {
      const copyState = snapshot.shareCopySucceeded ? strings.shareCopied : strings.shareUnavailable;
      const text = shareTextFor(snapshot, mode.glyphs) ?? '';
      share.content = text ? `${copyState}\n${text}` : copyState;
      share.fg = palette.ink;
    } else {
      share.content = '';
    }
  }

  function renderHelp(snapshot: AppSnapshot, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    const marks = legendMarks(mode.glyphs);
    help.title.content = strings.helpTitle;
    help.title.fg = palette.accent;
    help.body.fg = palette.ink;
    help.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
    help.body.content = [
      strings.helpIntro,
      '',
      strings.helpInstructions,
      '',
      `${strings.helpLegendTitle}:`,
      `${marks.correct} ${strings.helpLegendCorrect}   ${marks.present} ${strings.helpLegendPresent}   ${marks.absent} ${strings.helpLegendAbsent}`,
      '',
      strings.helpAutosave,
      strings.helpShortcuts,
    ].join('\n');
    help.back.content = strings.helpBack;
  }

  function renderProgress(snapshot: AppSnapshot, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    progress.title.content = strings.progressTitle;
    progress.title.fg = palette.accent;
    progress.body.fg = palette.ink;
    progress.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
    progress.body.content = [
      strings.progressStats({
        gamesPlayed: snapshot.stats.gamesPlayed,
        winRate: winRate(snapshot.stats),
        currentStreak: snapshot.stats.currentStreak,
        maxStreak: snapshot.stats.maxStreak,
      }),
      '',
      ...distributionRows(snapshot.stats, { glyphs: mode.glyphs === 'ascii' ? 'ascii' : 'unicode' }),
      '',
      strings.progressNextWord(snapshot.nextWordIn),
    ].join('\n');
    progress.back.content = strings.progressBack;
  }

  function renderTips(snapshot: AppSnapshot, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    const data = snapshot.tips;
    const compact = renderer.width < 48;
    const rowLimit = Math.max(3, Math.min(8, renderer.height - 8));
    const rows = data?.ranked.slice(0, rowLimit).map((score) => compact
      ? `${score.guess.toUpperCase().padEnd(5)}  ${score.entropy.toFixed(2)} bits`
      : `${score.guess.toUpperCase().padEnd(5)}  ${score.entropy.toFixed(2).padStart(5)} bits  ${score.topPattern}`,
    ) ?? [];
    tips.title.content = strings.tipsTitle;
    tips.title.fg = palette.accent;
    tips.body.fg = palette.ink;
    tips.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
    if (!data) {
      tips.body.content = strings.tipsNoSuggestions;
    } else if (data.status === 'computing') {
      tips.body.content = [
        strings.tipsCandidateCount(data.candidates.length),
        strings.tipsComputing,
        '',
        ...(rows.length > 0 ? [strings.tipsTopGuesses, ...rows] : []),
      ].filter(Boolean).join('\n');
    } else {
      tips.body.content = [
        strings.tipsCandidateCount(data.candidates.length),
        data.bestCandidate ? strings.tipsBestCandidate(data.bestCandidate) : '',
        '',
        strings.tipsTopGuesses,
        ...(rows.length > 0 ? rows : [strings.tipsNoSuggestions]),
      ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');
    }
    tips.back.content = strings.tipsBack;
  }

  function renderConfirm(snapshot: AppSnapshot, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    confirm.title.content = strings.restartConfirmTitle;
    confirm.title.fg = palette.accent;
    confirm.body.content = strings.restartConfirmBody;
    confirm.body.fg = palette.ink;
    confirm.back.content = strings.restartConfirmPrompt;
    confirm.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
  }

  function render(snapshot: AppSnapshot): void {
    const mode = presentation();
    const palette = paletteFor(mode);
    root.backgroundColor = palette.canvas;

    const compactWidth = renderer.width < 48;
    const minimumHeight = snapshot.view === 'game'
      ? snapshot.shareCopied
        ? compactWidth ? 22 : 20
        : 16
      : compactWidth ? 22 : 16;
    const tooSmall = renderer.width < 30 || renderer.height < minimumHeight;
    const compact = compactWidth || renderer.height < 23;
    const strings = messages[snapshot.language];
    sizeTitle.content = strings.title;
    sizeTitle.fg = palette.accent;
    sizeMessage.content = strings.terminalTooSmall;
    sizeMessage.fg = mode.color === 'none' ? palette.ink : palette.present;
    setPanelVisible(sizePanel, tooSmall);
    setPanelVisible(gamePanel, !tooSmall && snapshot.view === 'game');
    setPanelVisible(help.panel, !tooSmall && snapshot.view === 'help');
    setPanelVisible(progress.panel, !tooSmall && snapshot.view === 'progress');
    setPanelVisible(tips.panel, !tooSmall && snapshot.view === 'tips');
    setPanelVisible(confirm.panel, !tooSmall && snapshot.view === 'confirmRestart');

    if (tooSmall) {
      renderer.requestRender();
      return;
    }

    if (snapshot.view === 'game') renderGame(snapshot, compact, mode, palette);
    if (snapshot.view === 'help') renderHelp(snapshot, mode, palette);
    if (snapshot.view === 'progress') renderProgress(snapshot, mode, palette);
    if (snapshot.view === 'tips') renderTips(snapshot, mode, palette);
    if (snapshot.view === 'confirmRestart') renderConfirm(snapshot, mode, palette);
    renderer.requestRender();
  }

  function destroy(): void {
    if (root.isDestroyed) return;
    renderer.root.remove(root);
    root.destroyRecursively();
  }

  return {
    root,
    render,
    destroy,
    getPresentationMode: () => presentation(),
  };
}
