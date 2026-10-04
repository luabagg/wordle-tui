import {
  BoxRenderable,
  MouseButton,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';
import type { CliRenderer, MouseEvent, TerminalCapabilities } from '@opentui/core';
import type { AppSnapshot, TipsSnapshot } from './app';
import { MAX_GUESSES, TILE, WORD_LENGTH } from './game';
import type { GameStatus, TileState } from './game';
import { messages } from './i18n';
import type { GameStrings, HelpSection, ShortcutColumns, ShortcutHint } from './i18n';
import type { PointerTarget } from './input';
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

interface TipsPanel {
  panel: BoxRenderable;
  title: TextRenderable;
  scroll: ScrollBoxRenderable;
  summary: TextRenderable;
  rankedTitle: TextRenderable;
  rows: TextRenderable[];
  tree: TextRenderable;
  back: TextRenderable;
}

/** Clickable ranked-guess rows in the tips view. */
const TIPS_ROW_LIMIT = 8;
/** Pattern branches listed under the next question. */
const TIPS_BRANCH_LIMIT = 6;

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
  /** Receives left clicks on keys, editable slots, and tip rows. */
  onPointer?: (target: PointerTarget) => void;
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

const COLUMN_GAP = 4;
/**
 * Rows the full game layout needs with the shortcut block (margin plus four
 * rows) and the Portuguese accent hint. Below this, the block is hidden.
 */
const CONTROLS_MIN_HEIGHT = 25;

interface ColumnPair {
  row: BoxRenderable;
  left: TextRenderable;
  right: TextRenderable;
}

interface HelpPanel {
  panel: BoxRenderable;
  title: TextRenderable;
  scroll: ScrollBoxRenderable;
  intro: TextRenderable;
  shortcutsTitle: TextRenderable;
  shortcuts: ColumnPair;
  sections: TextRenderable;
  back: TextRenderable;
}

function bulletGlyph(glyphs: GlyphMode): string {
  return glyphs === 'ascii' ? '-' : '•';
}

function textWidth(text: string): number {
  return Math.max(0, ...text.split('\n').map((line) => line.length));
}

/**
 * Greedy word wrap to `width` cells. Continuation lines start with `indent`,
 * so a bullet's wrapped lines align under its text.
 */
export function wrapText(text: string, width: number, prefix = '', indent = ''): string {
  const limit = Math.max(indent.length + 1, width);
  const lines: string[] = [];
  let line = prefix;
  let lineStart = prefix.length;
  for (const word of text.split(' ')) {
    const empty = line.length === lineStart;
    if (!empty && line.length + 1 + word.length > limit) {
      lines.push(line);
      line = indent;
      lineStart = indent.length;
    }
    line += line.length === lineStart ? word : ` ${word}`;
  }
  lines.push(line);
  return lines.join('\n');
}

export function wrapBullet(item: string, width: number, bullet: string): string {
  return wrapText(item, width, `${bullet} `, ' '.repeat(bullet.length + 1));
}

/**
 * One bulleted line per shortcut, with keys padded to a shared width. When
 * any line is wider than `width`, every line uses wrapped "keys: action".
 */
export function shortcutColumn(hints: readonly ShortcutHint[], bullet: string, width = Infinity): string {
  const keyWidth = Math.max(0, ...hints.map(([keys]) => keys.length));
  const aligned = hints.map(([keys, action]) => `${bullet} ${keys.padEnd(keyWidth)}  ${action}`);
  if (aligned.every((line) => line.length <= width)) return aligned.join('\n');
  return hints.map(([keys, action]) => wrapBullet(`${keys}: ${action}`, width, bullet)).join('\n');
}

function formatSection(section: HelpSection, width: number, bullet: string): string {
  return [section.title, ...section.items.map((item) => wrapBullet(item, width, bullet))].join('\n');
}

function patternGlyphs(pattern: string, glyphs: GlyphMode): string {
  const marks = glyphs === 'ascii'
    ? { C: 'G', P: 'Y', A: '.' }
    : { C: '✓', P: '~', A: '×' };
  return Array.from(pattern, (char) => marks[char as keyof typeof marks] ?? char).join('');
}

function formatBits(bits: number): string {
  return bits.toFixed(2);
}

function decisionPathLines(tips: TipsSnapshot, strings: GameStrings, glyphs: GlyphMode): string[] {
  const startCount = tips.path[0]?.candidatesBefore ?? tips.candidates.length;
  const startBits = startCount > 0 ? Math.log2(startCount) : 0;
  const lines = [
    strings.tipsPathTitle,
    `  ${strings.tipsPathStart.padEnd(11)} ${String(startCount).padStart(5)}  ${formatBits(startBits)} bits`,
  ];
  for (const step of tips.path) {
    const label = `${step.guess.toUpperCase()} ${patternGlyphs(step.pattern, glyphs)}`;
    const gain = step.bitsGained === null
      ? strings.tipsPathNoMatch
      : `+${formatBits(step.bitsGained)} bits`;
    lines.push(`  ${label.padEnd(11)} ${String(step.candidatesAfter).padStart(5)}  ${gain}`);
  }
  return lines;
}

function nextQuestionLines(
  tips: TipsSnapshot,
  strings: GameStrings,
  glyphs: GlyphMode,
  compact: boolean,
): string[] {
  if (!tips.plan) return [];
  const { split, estimate } = tips.plan;
  const lines = [
    strings.tipsNextQuestion(split.guess, formatBits(split.entropy), formatBits(tips.uncertaintyBits)),
    strings.tipsExpectedRemaining(split.expectedRemaining.toFixed(1)),
  ];
  lines.push(strings.tipsSolveEstimate(estimate.expectedGuesses.toFixed(2), estimate.worstCaseGuesses));
  for (const branch of split.branches.slice(0, TIPS_BRANCH_LIMIT)) {
    const percent = `${Math.round(branch.probability * 100)}%`.padStart(4);
    const bits = compact ? '' : `  ${formatBits(branch.bits).padStart(5)} bits`;
    const next = branch.pattern === 'CCCCC'
      ? strings.tipsBranchSolved
      : branch.nextGuess ? `-> ${branch.nextGuess.toUpperCase()}` : '';
    lines.push(`  ${patternGlyphs(branch.pattern, glyphs)} ${String(branch.count).padStart(5)} ${percent}${bits}  ${next}`.trimEnd());
  }
  const hidden = split.branches.length - TIPS_BRANCH_LIMIT;
  if (hidden > 0) lines.push(`  ${strings.tipsMoreBranches(hidden)}`);
  return lines;
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

/**
 * A `visible: false` scrollbar option is only a default: OpenTUI shows the bar
 * again when content overflows. The setter marks the choice as manual.
 */
function hideScrollbars(box: ScrollBoxRenderable): void {
  box.verticalScrollBar.visible = false;
  box.horizontalScrollBar.visible = false;
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

/** Scroll content must keep its natural height, or overflow squeezes it. */
function addToScroll(scroll: ScrollBoxRenderable, ...children: Array<BoxRenderable | TextRenderable>): void {
  for (const child of children) {
    child.flexShrink = 0;
    scroll.add(child);
  }
}

function createScrollArea(renderer: CliRenderer, id: string): ScrollBoxRenderable {
  const scroll = new ScrollBoxRenderable(renderer, {
    id,
    width: '100%',
    scrollX: false,
    scrollY: true,
    contentOptions: { flexDirection: 'column' },
  });
  hideScrollbars(scroll);
  return scroll;
}

function createColumnPair(renderer: CliRenderer, id: string): ColumnPair {
  const row = new BoxRenderable(renderer, { id, flexDirection: 'row', gap: COLUMN_GAP, flexShrink: 0 });
  const left = createText(renderer, { id: `${id}-left`, wrapMode: 'none' });
  const right = createText(renderer, { id: `${id}-right`, wrapMode: 'none' });
  row.add(left);
  row.add(right);
  return { row, left, right };
}

/**
 * Show shortcut columns side by side. When they do not fit in `available`
 * cells, stack them left column first, or report that nothing fits.
 */
function layoutShortcuts(
  pair: ColumnPair,
  [leftHints, rightHints]: ShortcutColumns,
  bullet: string,
  available: number,
  fallback: 'stack' | 'hide',
): boolean {
  const left = shortcutColumn(leftHints, bullet);
  const right = shortcutColumn(rightHints, bullet);
  const fits = textWidth(left) + COLUMN_GAP + textWidth(right) <= available;
  const stacked = !fits && fallback === 'stack';
  pair.left.content = stacked ? shortcutColumn([...leftHints, ...rightHints], bullet, available) : left;
  pair.right.content = right;
  pair.right.visible = !stacked;
  pair.right.width = stacked ? 0 : 'auto';
  pair.row.gap = stacked ? 0 : COLUMN_GAP;
  return fits || stacked;
}

function createHelpPanel(renderer: CliRenderer): HelpPanel {
  const panel = new BoxRenderable(renderer, {
    id: 'help-view',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    paddingLeft: 1,
    paddingRight: 1,
  });
  const title = createText(renderer, {
    id: 'help-view-title',
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const scroll = createScrollArea(renderer, 'help-view-scroll');
  const intro = createText(renderer, { id: 'help-view-intro', width: '100%', wrapMode: 'none' });
  const shortcutsTitle = createText(renderer, {
    id: 'help-view-shortcuts-title',
    width: '100%',
    marginTop: 1,
    height: 1,
  });
  const shortcuts = createColumnPair(renderer, 'help-view-shortcuts');
  const sections = createText(renderer, {
    id: 'help-view-sections',
    width: '100%',
    marginTop: 1,
    wrapMode: 'none',
  });
  addToScroll(scroll, intro, shortcutsTitle, shortcuts.row, sections);
  const back = createText(renderer, {
    id: 'help-view-back',
    fg: fullPalette.correct,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  panel.add(title);
  panel.add(scroll);
  panel.add(back);
  return { panel, title, scroll, intro, shortcutsTitle, shortcuts, sections, back };
}

function createTipsPanel(renderer: CliRenderer, onTip: (row: number) => void): TipsPanel {
  const panel = new BoxRenderable(renderer, {
    id: 'tips-view',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    paddingLeft: 1,
    paddingRight: 1,
  });
  const title = createText(renderer, {
    id: 'tips-view-title',
    fg: fullPalette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const scroll = createScrollArea(renderer, 'tips-view-scroll');
  const summary = createText(renderer, { id: 'tips-view-summary', width: '100%' });
  const rankedTitle = createText(renderer, {
    id: 'tips-view-ranked-title',
    width: '100%',
    marginTop: 1,
    attributes: TextAttributes.BOLD,
  });
  addToScroll(scroll, summary, rankedTitle);
  const rows: TextRenderable[] = [];
  for (let row = 0; row < TIPS_ROW_LIMIT; row += 1) {
    const text = createText(renderer, {
      id: `tips-view-row-${row}`,
      width: '100%',
      height: 1,
      wrapMode: 'none',
      onMouseDown: (event: MouseEvent) => {
        if (event.button === MouseButton.LEFT) onTip(row);
      },
    });
    rows.push(text);
    addToScroll(scroll, text);
  }
  const tree = createText(renderer, {
    id: 'tips-view-tree',
    width: '100%',
    marginTop: 1,
  });
  addToScroll(scroll, tree);
  const back = createText(renderer, {
    id: 'tips-view-back',
    fg: fullPalette.correct,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  panel.add(title);
  panel.add(scroll);
  panel.add(back);
  return { panel, title, scroll, summary, rankedTitle, rows, tree, back };
}

export function createOpenTuiView(
  renderer: CliRenderer,
  options: CreateOpenTuiViewOptions = {},
): OpenTuiView {
  const emit = (target: PointerTarget): void => options.onPointer?.(target);
  const onLeftClick = (target: () => PointerTarget | null) => (event: MouseEvent): void => {
    if (event.button !== MouseButton.LEFT) return;
    const resolved = target();
    if (resolved) emit(resolved);
  };
  // Row that accepts slot clicks, from the latest render. Null when no row is editable.
  let editableRow: number | null = null;
  // Word behind each tips row, from the latest render.
  let tipWords: string[] = [];

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
  const controls = createColumnPair(renderer, 'game-controls');
  const controlsHint = createText(renderer, { id: 'game-controls-hint', fg: fullPalette.muted, height: 1 });
  const accentHint = createText(renderer, { id: 'game-accent-hint', fg: fullPalette.muted, height: 1 });
  gamePanel.add(title);
  gamePanel.add(subtitle);
  gamePanel.add(usage);
  gamePanel.add(controls.row);
  gamePanel.add(controlsHint);
  gamePanel.add(accentHint);

  const board = new ScrollBoxRenderable(renderer, {
    id: 'board',
    width: '100%',
    height: MAX_GUESSES,
    marginTop: 1,
    scrollX: false,
    scrollY: true,
    stickyScroll: true,
    stickyStart: 'bottom',
    contentOptions: {
      flexDirection: 'column',
      alignItems: 'center',
    },
  });
  hideScrollbars(board);
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
        onMouseDown: onLeftClick(() => (
          rowIndex === editableRow ? { kind: 'slot', index: column } : null
        )),
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
  const enterKey = createKey('key-enter', 5, 'ENTER', { kind: 'enter' });
  const backspaceKey = createKey('key-backspace', 3, '⌫', { kind: 'backspace' });
  const keyCells = new Map<string, TileCell>();
  const keyRowBoxes: BoxRenderable[] = [];

  function createKey(id: string, width: number, label: string, target: PointerTarget): TileCell {
    const box = new BoxRenderable(renderer, {
      id,
      width,
      height: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: fullPalette.panelBright,
      onMouseDown: onLeftClick(() => target),
    });
    const text = createText(renderer, {
      content: label,
      fg: fullPalette.muted,
      attributes: TextAttributes.BOLD,
      height: 1,
      wrapMode: 'none',
    });
    box.add(text);
    return { box, text };
  }

  for (const [rowIndex, letters] of keyboardRows.entries()) {
    const row = new BoxRenderable(renderer, {
      id: `keyboard-row-${rowIndex}`,
      flexDirection: 'row',
      gap: 1,
      height: 1,
    });
    keyRowBoxes.push(row);
    const lastRow = rowIndex === keyboardRows.length - 1;
    if (lastRow) row.add(enterKey.box);
    for (const letter of letters) {
      const cell = createKey(`key-${letter}`, 3, letter.toUpperCase(), { kind: 'letter', char: letter });
      row.add(cell.box);
      keyCells.set(letter, cell);
    }
    if (lastRow) row.add(backspaceKey.box);
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

  const help = createHelpPanel(renderer);
  const progress = createTextPanel(renderer, 'progress-view');
  const tips = createTipsPanel(renderer, (row) => {
    const word = tipWords[row];
    if (word) emit({ kind: 'tip', word });
  });
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

  /** Cells inside the root padding, capped by the shell's max width. */
  function shellWidth(): number {
    return Math.min(renderer.width - 2, 76);
  }

  function renderBoard(snapshot: AppSnapshot, compact: boolean, mode: PresentationMode, palette: Palette): void {
    const currentRow = snapshot.game.guesses.length;
    editableRow = snapshot.game.status === 'playing' ? currentRow : null;
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
    backspaceKey.text.content = mode.glyphs === 'ascii' ? '<-' : '⌫';
    for (const cell of [enterKey, backspaceKey]) {
      cell.box.backgroundColor = tileBackground(TILE.EMPTY, false, mode, palette);
      cell.text.fg = mode.color === 'none' ? palette.ink : palette.muted;
      cell.text.attributes = TextAttributes.BOLD;
    }
  }

  function renderGame(snapshot: AppSnapshot, compact: boolean, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    const isPractice = snapshot.mode === 'practice' || snapshot.game.mode === 'practice';
    const hardOn = snapshot.hardMode || snapshot.game.hardMode;
    const guessesLeft = Math.max(0, MAX_GUESSES - snapshot.game.guesses.length);
    const controlHints = snapshot.game.status === 'playing'
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
    const controlsFit = layoutShortcuts(controls, controlHints, bulletGlyph(mode.glyphs), shellWidth(), 'hide');
    controls.left.fg = palette.muted;
    controls.right.fg = palette.muted;
    accentHint.content = strings.accentHint;
    accentHint.fg = palette.muted;
    subtitle.visible = !compact;
    subtitle.height = compact ? 0 : 1;
    // Narrow or short layouts hide the shortcuts; `?` still opens the full list.
    const showControls = !compact && controlsFit && renderer.height >= CONTROLS_MIN_HEIGHT;
    controls.row.visible = showControls;
    controls.row.height = showControls ? 'auto' : 0;
    controls.row.marginTop = showControls ? 1 : 0;
    controlsHint.content = strings.controlsHint;
    controlsHint.fg = palette.muted;
    controlsHint.visible = !compact && !showControls;
    controlsHint.height = controlsHint.visible ? 1 : 0;
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
    const bullet = bulletGlyph(mode.glyphs);
    // Panel padding takes one cell on each side.
    const width = shellWidth() - 2;
    help.scroll.height = scrollAreaHeight();
    help.title.content = strings.helpTitle;
    help.title.fg = palette.accent;
    help.intro.fg = palette.ink;
    help.intro.content = [
      wrapText(strings.helpIntro, width),
      '',
      formatSection(strings.helpPlay, width, bullet),
      '',
      strings.helpLegendTitle,
      `${bullet} ${marks.correct} ${strings.helpLegendCorrect}`,
      `${bullet} ${marks.present} ${strings.helpLegendPresent}`,
      `${bullet} ${marks.absent} ${strings.helpLegendAbsent}`,
    ].join('\n');
    help.shortcutsTitle.content = strings.helpShortcutsTitle;
    help.shortcutsTitle.fg = palette.ink;
    layoutShortcuts(help.shortcuts, strings.helpShortcuts, bullet, width, 'stack');
    help.shortcuts.left.fg = palette.ink;
    help.shortcuts.right.fg = palette.ink;
    help.sections.fg = palette.ink;
    help.sections.content = [strings.helpModes, strings.helpMouse, strings.helpSaving]
      .map((section) => formatSection(section, width, bullet))
      .join('\n\n');
    help.back.content = renderer.width < 48 ? strings.helpBack : `${strings.helpBack}   ${strings.tipsScrollHint}`;
    help.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
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

  function renderTipRows(data: TipsSnapshot | null, compact: boolean, mode: PresentationMode, palette: Palette): void {
    const ranked = data?.ranked.slice(0, TIPS_ROW_LIMIT) ?? [];
    tipWords = ranked.map((score) => score.guess);
    tips.rows.forEach((row, index) => {
      const score = ranked[index];
      row.visible = Boolean(score);
      row.height = score ? 1 : 0;
      row.fg = palette.ink;
      if (!score) return;
      const word = score.guess.toUpperCase().padEnd(5);
      const bits = `${formatBits(score.entropy).padStart(5)} bits`;
      row.content = compact
        ? `  ${word}  ${bits}`
        : `  ${word}  ${bits}  ${patternGlyphs(score.topPattern, mode.glyphs)}`;
    });
  }

  function renderTips(snapshot: AppSnapshot, mode: PresentationMode, palette: Palette): void {
    const strings = messages[snapshot.language];
    const data = snapshot.tips;
    const compact = renderer.width < 48;
    tips.scroll.height = scrollAreaHeight();
    tips.title.content = strings.tipsTitle;
    tips.title.fg = palette.accent;
    tips.back.content = compact ? strings.tipsBack : `${strings.tipsBack}   ${strings.tipsScrollHint}`;
    tips.back.fg = mode.color === 'none' ? palette.ink : palette.correct;
    for (const text of [tips.summary, tips.rankedTitle, tips.tree]) text.fg = palette.ink;
    tips.rankedTitle.fg = mode.color === 'none' ? palette.ink : palette.accent;

    renderTipRows(data, compact, mode, palette);
    if (!data) {
      tips.summary.content = strings.tipsNoSuggestions;
      tips.rankedTitle.content = '';
      tips.tree.content = '';
      return;
    }

    tips.summary.content = [
      strings.tipsCandidateCount(data.candidates.length),
      strings.tipsUncertainty(formatBits(data.uncertaintyBits)),
      data.status === 'computing' ? strings.tipsComputing : '',
      data.status === 'ready' && data.bestCandidate ? strings.tipsBestCandidate(data.bestCandidate) : '',
    ].filter(Boolean).join('\n');
    tips.rankedTitle.content = data.ranked.length > 0 || data.status === 'ready'
      ? strings.tipsTopGuesses
      : '';
    tips.tree.content = [
      ...(data.status === 'ready' && data.ranked.length === 0 ? [strings.tipsNoSuggestions, ''] : []),
      ...decisionPathLines(data, strings, mode.glyphs),
      '',
      ...nextQuestionLines(data, strings, mode.glyphs, compact),
      ...(data.plan ? [''] : []),
      strings.tipsBasis,
    ].join('\n');
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

  /** Root padding (2) plus the title and back lines stay outside a scroll area. */
  function scrollAreaHeight(): number {
    return Math.max(1, renderer.height - 4);
  }

  /** A focused scroll box handles arrow and page keys while its view is open. */
  function syncScrollFocus(scroll: ScrollBoxRenderable, visible: boolean): void {
    if (visible && !scroll.focused) {
      scroll.scrollTo(0);
      scroll.focus();
    } else if (!visible && scroll.focused) {
      scroll.blur();
    }
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
    editableRow = null;
    sizeTitle.content = strings.title;
    sizeTitle.fg = palette.accent;
    sizeMessage.content = strings.terminalTooSmall;
    sizeMessage.fg = mode.color === 'none' ? palette.ink : palette.present;
    setPanelVisible(sizePanel, tooSmall);
    setPanelVisible(gamePanel, !tooSmall && snapshot.view === 'game');
    setPanelVisible(help.panel, !tooSmall && snapshot.view === 'help');
    setPanelVisible(progress.panel, !tooSmall && snapshot.view === 'progress');
    setPanelVisible(tips.panel, !tooSmall && snapshot.view === 'tips');
    syncScrollFocus(help.scroll, !tooSmall && snapshot.view === 'help');
    syncScrollFocus(tips.scroll, !tooSmall && snapshot.view === 'tips');
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
