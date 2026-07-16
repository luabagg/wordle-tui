import {
  BoxRenderable,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';
import type { CliRenderer } from '@opentui/core';
import type { AppSnapshot } from './app';
import { MAX_GUESSES, TILE, WORD_LENGTH } from './game';
import type { GameStatus, TileState } from './game';
import { messages } from './i18n';
import { distributionRows, winRate } from './stats';

const palette = {
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
}

function createText(
  renderer: CliRenderer,
  options: ConstructorParameters<typeof TextRenderable>[1] = {},
): TextRenderable {
  return new TextRenderable(renderer, {
    selectable: false,
    wrapMode: 'word',
    fg: palette.ink,
    ...options,
  });
}

function setPanelVisible(panel: BoxRenderable, visible: boolean): void {
  panel.visible = visible;
  panel.height = visible ? 'auto' : 0;
}

function tileBackground(state: TileState, active: boolean): string {
  if (active) return palette.active;
  if (state === TILE.CORRECT) return palette.correct;
  if (state === TILE.PRESENT) return palette.present;
  if (state === TILE.ABSENT) return palette.absent;
  return palette.panelBright;
}

function tileForeground(state: TileState, active: boolean): string {
  return active || state !== TILE.EMPTY ? palette.darkInk : palette.muted;
}

function statusColor(status: GameStatus): string {
  if (status === 'won') return palette.correct;
  if (status === 'lost') return palette.danger;
  return palette.present;
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
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const body = createText(renderer, {
    id: `${id}-body`,
    width: '100%',
    fg: palette.ink,
  });
  const back = createText(renderer, {
    id: `${id}-back`,
    fg: palette.correct,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  panel.add(title);
  panel.add(body);
  panel.add(back);
  return { panel, title, body, back };
}

export function createOpenTuiView(renderer: CliRenderer): OpenTuiView {
  const root = new BoxRenderable(renderer, {
    id: 'wordle-root',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: palette.canvas,
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
    content: 'WORDLE TUI',
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const sizeMessage = createText(renderer, {
    width: '100%',
    content: 'Terminal too small. Resize to at least 30 × 12.',
    fg: palette.present,
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
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  const subtitle = createText(renderer, { id: 'game-subtitle', fg: palette.muted, height: 1 });
  const usage = createText(renderer, { id: 'game-usage', fg: palette.faint, height: 1 });
  const controls = createText(renderer, { id: 'game-controls', width: '100%', fg: palette.faint });
  const accentHint = createText(renderer, { id: 'game-accent-hint', fg: palette.muted, height: 1 });
  gamePanel.add(title);
  gamePanel.add(subtitle);
  gamePanel.add(usage);
  gamePanel.add(controls);
  gamePanel.add(accentHint);

  const board = new BoxRenderable(renderer, {
    id: 'board',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 1,
  });
  const boardTiles: TileCell[][] = [];
  for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex += 1) {
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
        backgroundColor: palette.panelBright,
      });
      const text = createText(renderer, {
        content: '·',
        fg: palette.muted,
        attributes: TextAttributes.BOLD,
        height: 1,
      });
      box.add(text);
      row.add(box);
      cells.push({ box, text });
    }
    board.add(row);
    boardTiles.push(cells);
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
        backgroundColor: palette.panelBright,
      });
      const text = createText(renderer, {
        content: letter.toUpperCase(),
        fg: palette.muted,
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
    fg: palette.muted,
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
    fg: palette.ink,
    wrapMode: 'none',
  });
  gamePanel.add(legend);
  gamePanel.add(status);
  gamePanel.add(share);

  const help = createTextPanel(renderer, 'help-view');
  const progress = createTextPanel(renderer, 'progress-view');
  const tips = createTextPanel(renderer, 'tips-view');
  shell.add(help.panel);
  shell.add(progress.panel);
  shell.add(tips.panel);

  renderer.root.add(root);

  function renderBoard(snapshot: AppSnapshot, compact: boolean): void {
    const currentRow = snapshot.game.guesses.length;
    const currentGuess = Array.from(snapshot.game.currentGuess);
    const activeIndex = Math.min(snapshot.game.cursorPosition, WORD_LENGTH - 1);

    for (let row = 0; row < MAX_GUESSES; row += 1) {
      const submitted = row < snapshot.game.guesses.length;
      const activeRow = row === currentRow && snapshot.game.status === 'playing';
      const letters = submitted ? Array.from(snapshot.game.guesses[row]) : activeRow ? currentGuess : [];
      const evaluations = submitted ? snapshot.game.evaluations[row] : [];

      for (let column = 0; column < WORD_LENGTH; column += 1) {
        const cell = boardTiles[row][column];
        const state = evaluations[column] ?? TILE.EMPTY;
        const active = activeRow && column === activeIndex;
        const letter = letters[column]?.toUpperCase() || (active ? '·' : '·');
        cell.box.width = compact ? 3 : 5;
        cell.box.backgroundColor = tileBackground(state, active);
        cell.text.content = letter;
        cell.text.fg = tileForeground(state, active);
      }
    }
  }

  function renderKeyboard(snapshot: AppSnapshot, compact: boolean): void {
    for (const row of keyRowBoxes) row.gap = compact ? 0 : 1;
    for (const [letter, cell] of keyCells) {
      const state = snapshot.game.keyState.get(letter) ?? TILE.EMPTY;
      cell.box.backgroundColor = tileBackground(state, false);
      cell.text.fg = tileForeground(state, false);
    }
  }

  function renderGame(snapshot: AppSnapshot, compact: boolean): void {
    const strings = messages[snapshot.language];
    const guessesLeft = MAX_GUESSES - snapshot.game.guesses.length;
    const controlsText = snapshot.game.status === 'playing'
      ? strings.controlsPlaying
      : strings.controlsFinished;

    title.content = strings.title;
    subtitle.content = strings.subtitle;
    usage.content = strings.guessesUsed(snapshot.game.guesses.length, guessesLeft);
    controls.content = controlsText;
    accentHint.content = strings.accentHint;
    subtitle.visible = !compact;
    subtitle.height = compact ? 0 : 1;
    controls.visible = !compact;
    controls.height = compact ? 0 : 'auto';
    accentHint.visible = !compact && Boolean(strings.accentHint);
    accentHint.height = accentHint.visible ? 1 : 0;

    renderBoard(snapshot, compact);
    renderKeyboard(snapshot, compact);

    const showKeyboard = !snapshot.shareCopied && renderer.height >= 18;
    keyboard.visible = showKeyboard;
    keyboard.height = showKeyboard ? 'auto' : 0;
    legend.visible = !compact && showKeyboard;
    legend.height = legend.visible ? 1 : 0;
    legend.content = `${strings.helpLegendCorrect}: ✓  ${strings.helpLegendPresent}: ~  ${strings.helpLegendAbsent}: ×`;

    status.content = snapshot.game.message || ' ';
    status.fg = statusColor(snapshot.game.status);

    if (snapshot.game.status !== 'playing' && !snapshot.shareCopied) {
      share.content = strings.sharePrompt;
      share.fg = palette.correct;
    } else if (snapshot.shareCopied && snapshot.shareText) {
      const copyState = snapshot.shareCopySucceeded ? strings.shareCopied : strings.shareUnavailable;
      share.content = `${copyState}\n${snapshot.shareText}`;
      share.fg = palette.ink;
    } else {
      share.content = '';
    }
  }

  function renderHelp(snapshot: AppSnapshot): void {
    const strings = messages[snapshot.language];
    help.title.content = strings.helpTitle;
    help.body.content = [
      strings.helpIntro,
      '',
      strings.helpInstructions,
      '',
      `${strings.helpLegendTitle}:`,
      `✓ ${strings.helpLegendCorrect}   ~ ${strings.helpLegendPresent}   × ${strings.helpLegendAbsent}`,
      '',
      strings.helpAutosave,
      strings.helpShortcuts,
    ].join('\n');
    help.back.content = strings.helpBack;
  }

  function renderProgress(snapshot: AppSnapshot): void {
    const strings = messages[snapshot.language];
    progress.title.content = strings.progressTitle;
    progress.body.content = [
      strings.progressStats({
        gamesPlayed: snapshot.stats.gamesPlayed,
        winRate: winRate(snapshot.stats),
        currentStreak: snapshot.stats.currentStreak,
        maxStreak: snapshot.stats.maxStreak,
      }),
      '',
      ...distributionRows(snapshot.stats),
      '',
      strings.progressNextWord(snapshot.nextWordIn),
    ].join('\n');
    progress.back.content = strings.progressBack;
  }

  function renderTips(snapshot: AppSnapshot): void {
    const strings = messages[snapshot.language];
    const data = snapshot.tips;
    const rows = data?.ranked.slice(0, 8).map((score) =>
      `${score.guess.toUpperCase().padEnd(5)}  ${score.entropy.toFixed(2).padStart(5)} bits  ${score.topPattern}`,
    ) ?? [];
    tips.title.content = strings.tipsTitle;
    tips.body.content = data
      ? [
          strings.tipsCandidateCount(data.candidates.length),
          data.bestCandidate ? strings.tipsBestCandidate(data.bestCandidate) : '',
          '',
          strings.tipsTopGuesses,
          ...(rows.length > 0 ? rows : [strings.tipsNoSuggestions]),
        ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n')
      : strings.tipsNoSuggestions;
    tips.back.content = strings.tipsBack;
  }

  function render(snapshot: AppSnapshot): void {
    const tooSmall = renderer.width < 30 || renderer.height < 12;
    const compact = renderer.width < 48 || renderer.height < 23;
    setPanelVisible(sizePanel, tooSmall);
    setPanelVisible(gamePanel, !tooSmall && snapshot.view === 'game');
    setPanelVisible(help.panel, !tooSmall && snapshot.view === 'help');
    setPanelVisible(progress.panel, !tooSmall && snapshot.view === 'progress');
    setPanelVisible(tips.panel, !tooSmall && snapshot.view === 'tips');

    if (tooSmall) {
      renderer.requestRender();
      return;
    }

    if (snapshot.view === 'game') renderGame(snapshot, compact);
    if (snapshot.view === 'help') renderHelp(snapshot);
    if (snapshot.view === 'progress') renderProgress(snapshot);
    if (snapshot.view === 'tips') renderTips(snapshot);
    renderer.requestRender();
  }

  function destroy(): void {
    if (root.isDestroyed) return;
    renderer.root.remove(root);
    root.destroyRecursively();
  }

  return { root, render, destroy };
}
