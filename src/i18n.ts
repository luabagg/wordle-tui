export type Language = 'en' | 'pt';

/** One shortcut: the keys to press and what they do. */
export type ShortcutHint = readonly [keys: string, action: string];

/** Shortcuts shown side by side, or stacked left first when narrow. */
export type ShortcutColumns = readonly [left: readonly ShortcutHint[], right: readonly ShortcutHint[]];

export interface HelpSection {
  title: string;
  items: string[];
}

export interface GameStrings {
  title: string;
  subtitle: string;
  subtitlePractice: string;
  controlsPlaying: ShortcutColumns;
  controlsFinished: ShortcutColumns;
  /** One-line stand-in when the shortcut columns do not fit. */
  controlsHint: string;
  accentHint: string;
  guessesUsed: (used: number, remaining: number) => string;
  guessesUsedPractice: (used: number) => string;
  hardModeOn: string;
  hardModeOff: string;
  hardModeMustUsePosition: (position: number, letter: string) => string;
  hardModeMustInclude: (letter: string) => string;
  hardModeToggled: (enabled: boolean) => string;
  practiceLoaded: (count: number) => string;
  practiceReturned: string;
  undoEmpty: string;
  undoBlocked: string;
  undoDone: string;
  notInDictionary: string;
  wrongLength: string;
  invalidChars: string;
  invalidPaste: string;
  tipsComputing: string;
  winMessage: (guesses: number) => string;
  winMessagePractice: (guesses: number) => string;
  loseMessage: (answer: string) => string;
  guessRegistered: (guess: number) => string;
  guessRegisteredPractice: (guess: number) => string;
  dailyLoaded: (count: number) => string;
  gameReset: string;
  helpTitle: string;
  helpIntro: string;
  helpPlay: HelpSection;
  helpLegendTitle: string;
  helpLegendCorrect: string;
  helpLegendPresent: string;
  helpLegendAbsent: string;
  helpShortcutsTitle: string;
  helpShortcuts: ShortcutColumns;
  helpModes: HelpSection;
  helpMouse: HelpSection;
  helpSaving: HelpSection;
  helpBack: string;
  restartConfirmTitle: string;
  restartConfirmBody: string;
  restartConfirmPrompt: string;
  rolloverNotice: string;
  progressTitle: string;
  progressStats: (stats: { gamesPlayed: number; winRate: number; currentStreak: number; maxStreak: number }) => string;
  progressNextWord: (nextWordIn: string) => string;
  progressBack: string;
  sharePrompt: string;
  shareCopied: string;
  shareUnavailable: string;
  terminalTooSmall: string;
  tipsTitle: string;
  tipsCandidateCount: (count: number) => string;
  tipsBestCandidate: (word: string) => string;
  tipsTopGuesses: string;
  tipsNoSuggestions: string;
  tipsBack: string;
  tipsUncertainty: (bits: string) => string;
  tipsPathTitle: string;
  tipsPathStart: string;
  tipsPathNoMatch: string;
  tipsNextQuestion: (word: string, bits: string, totalBits: string) => string;
  tipsExpectedRemaining: (count: string) => string;
  tipsSolveEstimate: (expected: string, worst: number) => string;
  tipsBranchSolved: string;
  tipsMoreBranches: (count: number) => string;
  tipsBasis: string;
  tipsScrollHint: string;
}

export const messages: Record<Language, GameStrings> = {
  en: {
    title: 'WORDLE TUI',
    subtitle: 'Guess the 5-letter word in 6 tries.',
    subtitlePractice: 'Practice mode · unlimited attempts · no daily stats.',
    controlsPlaying: [
      [
        ['Enter', 'submit guess'],
        ['Bksp / Del', 'clear a slot'],
        ['Arrows', 'move cursor'],
        ['Tab', 'tips'],
      ],
      [
        ['?', 'help & shortcuts'],
        ['Ctrl+P', 'progress'],
        ['Ctrl+L', 'language'],
        ['Esc', 'quit'],
      ],
    ],
    controlsFinished: [
      [
        ['S', 'share result'],
        ['R', 'restart'],
        ['Q', 'quit'],
        ['Ctrl+Z', 'undo last guess'],
      ],
      [
        ['Tab', 'tips'],
        ['?', 'help & shortcuts'],
        ['Ctrl+P', 'progress'],
        ['Ctrl+T', 'practice'],
      ],
    ],
    controlsHint: 'Press ? for help and shortcuts.',
    accentHint: '',
    guessesUsed: (used, remaining) => `${used} guess${used === 1 ? '' : 'es'} used • ${remaining} remaining`,
    guessesUsedPractice: (used) => `${used} guess${used === 1 ? '' : 'es'} used • unlimited`,
    hardModeOn: 'HARD',
    hardModeOff: 'Normal',
    hardModeMustUsePosition: (position, letter) =>
      `Hard mode: position ${position} must be ${letter.toUpperCase()}.`,
    hardModeMustInclude: (letter) =>
      `Hard mode: guess must include ${letter.toUpperCase()}.`,
    hardModeToggled: (enabled) => (enabled ? 'Hard mode on.' : 'Hard mode off.'),
    practiceLoaded: (count) => `Practice word loaded. ${count.toLocaleString('en-US')} valid guesses.`,
    practiceReturned: 'Returned to the daily puzzle.',
    undoEmpty: 'Nothing to undo.',
    undoBlocked: 'Cannot undo a recorded daily result.',
    undoDone: 'Latest guess undone.',
    notInDictionary: 'Not in dictionary.',
    wrongLength: 'Words must be 5 letters.',
    invalidChars: 'Use letters only (A–Z).',
    invalidPaste: 'Paste exactly one 5-letter word.',
    tipsComputing: 'Computing ranked suggestions…',
    winMessage: (guesses) => `Solved in ${guesses}/6! R restarts, Q quits.`,
    winMessagePractice: (guesses) => `Solved in ${guesses} guesses! R restarts practice, Q quits.`,
    loseMessage: (answer) => `The word was ${answer.toUpperCase()}. R restarts, Q quits.`,
    guessRegistered: (guess) => `Guess ${guess}/6 registered.`,
    guessRegisteredPractice: (guess) => `Guess ${guess} registered.`,
    dailyLoaded: (count) => `Daily word loaded. ${count.toLocaleString('en-US')} valid guesses.`,
    gameReset: 'Game restarted. Guess the daily word.',
    helpTitle: ' WORDLE TUI ',
    helpIntro: 'Guess the 5-letter word in 6 tries.',
    helpPlay: {
      title: 'How to play',
      items: [
        'Type or paste a word, then press Enter.',
        'Pasting fills the row but never submits.',
      ],
    },
    helpLegendTitle: 'Colors',
    helpLegendCorrect: 'correct',
    helpLegendPresent: 'exists',
    helpLegendAbsent: 'absent',
    helpShortcutsTitle: 'Shortcuts',
    helpShortcuts: [
      [
        ['Enter', 'submit guess'],
        ['Backspace', 'clear previous slot'],
        ['Delete', 'clear current slot'],
        ['Arrows/Home/End', 'move cursor'],
        ['Tab', 'tips'],
        ['?', 'help'],
      ],
      [
        ['Esc', 'quit'],
        ['Ctrl+P', 'progress'],
        ['Ctrl+L', 'switch language'],
        ['Ctrl+R', 'restart'],
        ['Ctrl+D', 'hard mode'],
        ['Ctrl+T', 'practice mode'],
        ['Ctrl+Z', 'undo last guess'],
      ],
    ],
    helpModes: {
      title: 'Modes',
      items: [
        'Hard mode: later guesses must reuse every green and yellow hint.',
        'Practice: unlimited tries, and nothing counts toward daily stats.',
        'Undo removes your last guess, unless the daily result is already recorded.',
      ],
    },
    helpMouse: {
      title: 'Mouse',
      items: [
        'Click a key to type it.',
        'Click a slot in the current row to move the cursor.',
        'Click a tip to fill the row.',
        'Hold Shift to select text.',
      ],
    },
    helpSaving: {
      title: 'Saving',
      items: [
        'Boards, results, and stats are saved on this computer.',
        'English and Portuguese keep separate boards.',
      ],
    },
    helpBack: 'Back: Esc or ?',
    restartConfirmTitle: ' Restart game? ',
    restartConfirmBody: 'You have an unfinished daily puzzle. Restarting clears this language board.',
    restartConfirmPrompt: 'Y / Enter restart · N / Esc cancel',
    rolloverNotice: 'A new daily puzzle is available. Your previous progress was saved.',
    progressTitle: 'Progress',
    progressStats: ({ gamesPlayed, winRate, currentStreak, maxStreak }) =>
      `Games ${gamesPlayed} • Wins ${winRate}% • Streak ${currentStreak} • Best ${maxStreak}`,
    progressNextWord: (nextWordIn) => `Next word in ${nextWordIn}`,
    progressBack: 'Back: Esc or Ctrl+P',
    sharePrompt: 'Share: press S to copy',
    shareCopied: 'Result copied.',
    shareUnavailable: 'Clipboard unavailable. Hold Shift and drag to select the result below.',
    terminalTooSmall: 'Terminal too small for this view. Resize the window.',
    tipsTitle: ' TIPS ',
    tipsCandidateCount: (count) => `${count} candidate${count === 1 ? '' : 's'} remain`,
    tipsBestCandidate: (word) => `Best candidate: ${word.toUpperCase()}`,
    tipsTopGuesses: 'Top entropy guesses (click to use)',
    tipsNoSuggestions: 'No suggestions available.',
    tipsBack: 'Back: Tab or Esc',
    tipsUncertainty: (bits) => `${bits} bits of uncertainty`,
    tipsPathTitle: 'Decision path',
    tipsPathStart: 'start',
    tipsPathNoMatch: 'no answer matches',
    tipsNextQuestion: (word, bits, totalBits) => `Next question: ${word.toUpperCase()}, ${bits} of ${totalBits} bits expected`,
    tipsExpectedRemaining: (count) => `Expected candidates left: ${count}`,
    tipsSolveEstimate: (expected, worst) => `Greedy tree from here: ${expected} more guesses on average, ${worst} at most`,
    tipsBranchSolved: 'solved',
    tipsMoreBranches: (count) => `+${count} more branch${count === 1 ? '' : 'es'}`,
    tipsBasis: 'Basis: each guess is a decision-tree question, and its feedback picks a branch. Guesses rank by expected information gain, H = -sum p*log2(p) bits over the branches.',
    tipsScrollHint: 'Scroll: wheel or arrows',
  },
  pt: {
    title: 'TERMO TUI',
    subtitle: 'Descubra a palavra certa em 6 tentativas.',
    subtitlePractice: 'Modo treino · tentativas ilimitadas · sem estatísticas diárias.',
    controlsPlaying: [
      [
        ['Enter', 'enviar palpite'],
        ['Bksp / Del', 'limpar casa'],
        ['Setas', 'mover cursor'],
        ['Tab', 'dicas'],
      ],
      [
        ['?', 'ajuda e atalhos'],
        ['Ctrl+P', 'progresso'],
        ['Ctrl+L', 'idioma'],
        ['Esc', 'sair'],
      ],
    ],
    controlsFinished: [
      [
        ['S', 'compartilhar'],
        ['R', 'reiniciar'],
        ['Q', 'sair'],
        ['Ctrl+Z', 'desfazer palpite'],
      ],
      [
        ['Tab', 'dicas'],
        ['?', 'ajuda e atalhos'],
        ['Ctrl+P', 'progresso'],
        ['Ctrl+T', 'treino'],
      ],
    ],
    controlsHint: 'Aperte ? para ver a ajuda e os atalhos.',
    accentHint: 'Acentos aparecem automaticamente e não contam nas dicas.',
    guessesUsed: (used, remaining) => {
      const usedPlural = used === 1 ? '' : 's';
      return `${used} tentativa${usedPlural} usada${usedPlural} • ${remaining} restante${remaining === 1 ? '' : 's'}`;
    },
    guessesUsedPractice: (used) => `${used} tentativa${used === 1 ? '' : 's'} usada${used === 1 ? '' : 's'} • ilimitadas`,
    hardModeOn: 'DIFÍCIL',
    hardModeOff: 'Normal',
    hardModeMustUsePosition: (position, letter) =>
      `Modo difícil: a posição ${position} deve ser ${letter.toUpperCase()}.`,
    hardModeMustInclude: (letter) =>
      `Modo difícil: o palpite deve incluir ${letter.toUpperCase()}.`,
    hardModeToggled: (enabled) => (enabled ? 'Modo difícil ligado.' : 'Modo difícil desligado.'),
    practiceLoaded: (count) => `Palavra de treino carregada. ${count.toLocaleString('pt-BR')} palavras aceitas.`,
    practiceReturned: 'Voltou ao jogo diário.',
    undoEmpty: 'Nada para desfazer.',
    undoBlocked: 'Não é possível desfazer um resultado diário já registrado.',
    undoDone: 'Último palpite desfeito.',
    notInDictionary: 'Não conheço essa palavra.',
    wrongLength: 'Só valem palavras com 5 letras.',
    invalidChars: 'Use apenas letras (A–Z, com ou sem acento).',
    invalidPaste: 'Cole exatamente uma palavra de 5 letras.',
    tipsComputing: 'Calculando sugestões ranqueadas…',
    winMessage: (guesses) => `Você descobriu em ${guesses}/6! R reinicia, Q sai.`,
    winMessagePractice: (guesses) => `Você descobriu em ${guesses} tentativas! R reinicia o treino, Q sai.`,
    loseMessage: (answer) => `A palavra era ${answer.toUpperCase()}. R reinicia, Q sai.`,
    guessRegistered: (guess) => `Tentativa ${guess}/6 registrada.`,
    guessRegisteredPractice: (guess) => `Tentativa ${guess} registrada.`,
    dailyLoaded: (count) => `Palavra diária carregada. ${count.toLocaleString('pt-BR')} palavras aceitas.`,
    gameReset: 'Jogo reiniciado. Descubra a palavra de hoje.',
    helpTitle: ' TERMO TUI ',
    helpIntro: 'Descubra a palavra certa em 6 tentativas.',
    helpPlay: {
      title: 'Como jogar',
      items: [
        'Digite ou cole uma palavra e aperte Enter.',
        'Colar preenche a linha, mas nunca envia.',
        'Os acentos aparecem sozinhos e não contam nas dicas.',
      ],
    },
    helpLegendTitle: 'Cores',
    helpLegendCorrect: 'correta',
    helpLegendPresent: 'existe',
    helpLegendAbsent: 'fora',
    helpShortcutsTitle: 'Atalhos',
    helpShortcuts: [
      [
        ['Enter', 'enviar palpite'],
        ['Backspace', 'limpar casa anterior'],
        ['Delete', 'limpar casa atual'],
        ['Setas/Home/End', 'mover cursor'],
        ['Tab', 'dicas'],
        ['?', 'ajuda'],
      ],
      [
        ['Esc', 'sair'],
        ['Ctrl+P', 'progresso'],
        ['Ctrl+L', 'trocar idioma'],
        ['Ctrl+R', 'reiniciar'],
        ['Ctrl+D', 'modo difícil'],
        ['Ctrl+T', 'modo treino'],
        ['Ctrl+Z', 'desfazer palpite'],
      ],
    ],
    helpModes: {
      title: 'Modos',
      items: [
        'Modo difícil: os próximos palpites precisam reutilizar todas as letras verdes e amarelas.',
        'Treino: tentativas ilimitadas, e nada conta nas estatísticas diárias.',
        'Desfazer remove o último palpite, se o resultado diário ainda não foi registrado.',
      ],
    },
    helpMouse: {
      title: 'Mouse',
      items: [
        'Clique em uma tecla para digitar.',
        'Clique em uma casa da linha atual para mover o cursor.',
        'Clique em uma dica para preencher a linha.',
        'Segure Shift para selecionar texto.',
      ],
    },
    helpSaving: {
      title: 'Salvamento',
      items: [
        'Tabuleiros, resultados e estatísticas ficam salvos neste computador.',
        'Inglês e português têm tabuleiros separados.',
      ],
    },
    helpBack: 'Voltar: Esc ou ?',
    restartConfirmTitle: ' Reiniciar jogo? ',
    restartConfirmBody: 'Há um jogo diário incompleto. Reiniciar apaga o tabuleiro deste idioma.',
    restartConfirmPrompt: 'Y / Enter reinicia · N / Esc cancela',
    rolloverNotice: 'Um novo jogo diário está disponível. Seu progresso anterior foi salvo.',
    progressTitle: 'Progresso',
    progressStats: ({ gamesPlayed, winRate, currentStreak, maxStreak }) =>
      `Jogos ${gamesPlayed} • Vitórias ${winRate}% • Sequência ${currentStreak} • Melhor ${maxStreak}`,
    progressNextWord: (nextWordIn) => `Próxima palavra em ${nextWordIn}`,
    progressBack: 'Voltar: Esc ou Ctrl+P',
    sharePrompt: 'Compartilhar: pressione S para copiar',
    shareCopied: 'Resultado copiado.',
    shareUnavailable: 'Área de transferência indisponível. Segure Shift e arraste para selecionar o resultado abaixo.',
    terminalTooSmall: 'Terminal pequeno demais para esta tela. Aumente a janela.',
    tipsTitle: ' DICAS ',
    tipsCandidateCount: (count) => `${count} candidato${count === 1 ? '' : 's'} restante${count === 1 ? '' : 's'}`,
    tipsBestCandidate: (word) => `Melhor candidato: ${word.toUpperCase()}`,
    tipsTopGuesses: 'Melhores palpites por entropia (clique para usar)',
    tipsNoSuggestions: 'Nenhuma sugestão disponível.',
    tipsBack: 'Voltar: Tab ou Esc',
    tipsUncertainty: (bits) => `${bits} bits de incerteza`,
    tipsPathTitle: 'Caminho de decisão',
    tipsPathStart: 'início',
    tipsPathNoMatch: 'nenhuma resposta corresponde',
    tipsNextQuestion: (word, bits, totalBits) => `Próxima pergunta: ${word.toUpperCase()}, ${bits} de ${totalBits} bits esperados`,
    tipsExpectedRemaining: (count) => `Candidatos restantes esperados: ${count}`,
    tipsSolveEstimate: (expected, worst) => `Árvore gulosa a partir daqui: mais ${expected} palpites em média, ${worst} no máximo`,
    tipsBranchSolved: 'resolvido',
    tipsMoreBranches: (count) => `+${count} ramo${count === 1 ? '' : 's'}`,
    tipsBasis: 'Base: cada palpite é uma pergunta de árvore de decisão, e o retorno escolhe um ramo. Os palpites são ordenados pelo ganho de informação esperado, H = -soma p*log2(p) bits sobre os ramos.',
    tipsScrollHint: 'Rolar: roda do mouse ou setas',
  },
};
