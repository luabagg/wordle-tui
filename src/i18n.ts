export type Language = 'en' | 'pt';

export interface GameStrings {
  title: string;
  subtitle: string;
  subtitlePractice: string;
  controlsPlaying: string;
  controlsFinished: string;
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
  helpInstructions: string;
  helpLegendTitle: string;
  helpLegendCorrect: string;
  helpLegendPresent: string;
  helpLegendAbsent: string;
  helpAutosave: string;
  helpShortcuts: string;
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
}

export const messages: Record<Language, GameStrings> = {
  en: {
    title: 'WORDLE TUI',
    subtitle: 'Guess the 5-letter word in 6 tries.',
    subtitlePractice: 'Practice mode · unlimited attempts · no daily stats.',
    controlsPlaying: 'Type or paste a word. Arrows move. Enter submits. Backspace/Delete clear slots. Ctrl+D hard mode. Ctrl+T practice. Ctrl+Z undo. Ctrl+H help. Ctrl+P progress. Ctrl+L language. Tab tips. Esc quits.',
    controlsFinished: 'Round over. R restarts, Q quits, S shares, Ctrl+Z undo (if allowed), Ctrl+T practice, Ctrl+H help, Ctrl+P progress, Ctrl+L language, Tab tips.',
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
    helpInstructions: 'Type or paste one word, press Enter to submit, and use Backspace/Delete to clear slots. Paste never submits automatically. Hard mode enforces official green/yellow reuse. Practice mode uses unlimited attempts and never records daily stats. Ctrl+Z undoes only the latest submitted row when allowed.',
    helpLegendTitle: 'Legend',
    helpLegendCorrect: 'correct',
    helpLegendPresent: 'exists',
    helpLegendAbsent: 'absent',
    helpAutosave: 'In-progress boards, completed daily results, and statistics are saved on this computer. English and Portuguese sessions are kept separately. Practice boards are not written to daily stats.',
    helpShortcuts: 'Shortcuts: Ctrl+H help, Ctrl+P progress, Ctrl+L language, Tab tips, Ctrl+R restart, Ctrl+D hard mode, Ctrl+T practice, Ctrl+Z undo, Esc quits.',
    helpBack: 'Back: Esc or Ctrl+H',
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
    shareUnavailable: 'Clipboard unavailable. Copy the result below.',
    terminalTooSmall: 'Terminal too small for this view. Resize the window.',
    tipsTitle: ' TIPS ',
    tipsCandidateCount: (count) => `${count} candidate${count === 1 ? '' : 's'} remain`,
    tipsBestCandidate: (word) => `Best candidate: ${word.toUpperCase()}`,
    tipsTopGuesses: 'Top entropy guesses',
    tipsNoSuggestions: 'No suggestions available.',
    tipsBack: 'Back: Tab or Esc',
  },
  pt: {
    title: 'TERMO TUI',
    subtitle: 'Descubra a palavra certa em 6 tentativas.',
    subtitlePractice: 'Modo treino · tentativas ilimitadas · sem estatísticas diárias.',
    controlsPlaying: 'Digite ou cole uma palavra. Setas movem. Enter envia. Backspace/Delete limpam casas. Ctrl+D modo difícil. Ctrl+T treino. Ctrl+Z desfazer. Ctrl+H ajuda. Ctrl+P progresso. Ctrl+L idioma. Tab dicas. Esc sai.',
    controlsFinished: 'Fim da rodada. R reinicia, Q sai, S compartilha, Ctrl+Z desfaz (se permitido), Ctrl+T treino, Ctrl+H ajuda, Ctrl+P progresso, Ctrl+L idioma, Tab dicas.',
    accentHint: 'Acentos aparecem automaticamente e não contam nas dicas.',
    guessesUsed: (used, remaining) => `${used} tentativa${used === 1 ? '' : 's'} usadas • ${remaining} tentativa${remaining === 1 ? '' : 's'} restantes`,
    guessesUsedPractice: (used) => `${used} tentativa${used === 1 ? '' : 's'} usadas • ilimitadas`,
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
    helpInstructions: 'Digite ou cole uma palavra, use Enter para enviar e Backspace/Delete para limpar casas. Colar nunca envia automaticamente. O modo difícil exige reutilizar verdes e amarelos oficiais. O modo treino tem tentativas ilimitadas e não grava estatísticas diárias. Ctrl+Z desfaz só a última linha enviada quando permitido.',
    helpLegendTitle: 'Legenda',
    helpLegendCorrect: 'correta',
    helpLegendPresent: 'existe',
    helpLegendAbsent: 'fora',
    helpAutosave: 'Tabuleiros em andamento, resultados diários concluídos e estatísticas ficam salvos neste computador. Sessões em inglês e português são mantidas separadas. Treinos não entram nas estatísticas diárias.',
    helpShortcuts: 'Atalhos: Ctrl+H ajuda, Ctrl+P progresso, Ctrl+L idioma, Tab dicas, Ctrl+R reinicia, Ctrl+D modo difícil, Ctrl+T treino, Ctrl+Z desfazer, Esc sai do jogo.',
    helpBack: 'Voltar: Esc ou Ctrl+H',
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
    shareUnavailable: 'Área de transferência indisponível. Copie o resultado abaixo.',
    terminalTooSmall: 'Terminal pequeno demais para esta tela. Aumente a janela.',
    tipsTitle: ' DICAS ',
    tipsCandidateCount: (count) => `${count} candidato${count === 1 ? '' : 's'} restante${count === 1 ? '' : 's'}`,
    tipsBestCandidate: (word) => `Melhor candidato: ${word.toUpperCase()}`,
    tipsTopGuesses: 'Melhores palpites por entropia',
    tipsNoSuggestions: 'Nenhuma sugestão disponível.',
    tipsBack: 'Voltar: Tab ou Esc',
  },
};
