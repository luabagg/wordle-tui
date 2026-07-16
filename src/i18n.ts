export type Language = 'en' | 'pt';

export interface GameStrings {
  title: string;
  subtitle: string;
  controlsPlaying: string;
  controlsFinished: string;
  accentHint: string;
  guessesUsed: (used: number, remaining: number) => string;
  notInDictionary: string;
  wrongLength: string;
  winMessage: (guesses: number) => string;
  loseMessage: (answer: string) => string;
  guessRegistered: (guess: number) => string;
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
    controlsPlaying: 'Type letters. Arrows move. Enter submits. Backspace deletes. Ctrl+H help. Ctrl+P progress. Ctrl+L language. Tab tips. Esc quits.',
    controlsFinished: 'Round over. R restarts, Q quits, S shares, Ctrl+H help, Ctrl+P progress, Ctrl+L language, Tab tips.',
    accentHint: '',
    guessesUsed: (used, remaining) => `${used} guess${used === 1 ? '' : 'es'} used • ${remaining} remaining`,
    notInDictionary: 'Not in dictionary.',
    wrongLength: 'Words must be 5 letters.',
    winMessage: (guesses) => `Solved in ${guesses}/6! R restarts, Q quits.`,
    loseMessage: (answer) => `The word was ${answer.toUpperCase()}. R restarts, Q quits.`,
    guessRegistered: (guess) => `Guess ${guess}/6 registered.`,
    dailyLoaded: (count) => `Daily word loaded. ${count.toLocaleString('en-US')} valid guesses.`,
    gameReset: 'Game restarted. Guess the daily word.',
    helpTitle: ' WORDLE TUI ',
    helpIntro: 'Guess the 5-letter word in 6 tries.',
    helpInstructions: 'Type a word, press Enter to submit and Backspace to correct.',
    helpLegendTitle: 'Legend',
    helpLegendCorrect: 'correct',
    helpLegendPresent: 'exists',
    helpLegendAbsent: 'absent',
    helpAutosave: 'Your daily progress is saved on this computer.',
    helpShortcuts: 'Shortcuts: Ctrl+H help, Ctrl+P progress, Ctrl+L language, Tab tips, Ctrl+R restart, Esc quits.',
    helpBack: 'Back: Esc or Ctrl+H',
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
    controlsPlaying: 'Digite letras. Setas movem. Enter envia. Backspace apaga. Ctrl+H ajuda. Ctrl+P progresso. Ctrl+L idioma. Tab dicas. Esc sai.',
    controlsFinished: 'Fim da rodada. R reinicia, Q sai, S compartilha, Ctrl+H ajuda, Ctrl+P progresso, Ctrl+L idioma, Tab dicas.',
    accentHint: 'Acentos aparecem automaticamente e não contam nas dicas.',
    guessesUsed: (used, remaining) => `${used} tentativa${used === 1 ? '' : 's'} usadas • ${remaining} tentativa${remaining === 1 ? '' : 's'} restantes`,
    notInDictionary: 'Não conheço essa palavra.',
    wrongLength: 'Só valem palavras com 5 letras.',
    winMessage: (guesses) => `Você descobriu em ${guesses}/6! R reinicia, Q sai.`,
    loseMessage: (answer) => `A palavra era ${answer.toUpperCase()}. R reinicia, Q sai.`,
    guessRegistered: (guess) => `Tentativa ${guess}/6 registrada.`,
    dailyLoaded: (count) => `Palavra diária carregada. ${count.toLocaleString('pt-BR')} palavras aceitas.`,
    gameReset: 'Jogo reiniciado. Descubra a palavra de hoje.',
    helpTitle: ' TERMO TUI ',
    helpIntro: 'Descubra a palavra certa em 6 tentativas.',
    helpInstructions: 'Digite uma palavra, use Enter para enviar e Backspace para corrigir.',
    helpLegendTitle: 'Legenda',
    helpLegendCorrect: 'correta',
    helpLegendPresent: 'existe',
    helpLegendAbsent: 'fora',
    helpAutosave: 'Seu progresso diário fica salvo neste computador.',
    helpShortcuts: 'Atalhos: Ctrl+H ajuda, Ctrl+P progresso, Ctrl+L idioma, Tab dicas, Ctrl+R reinicia, Esc sai do jogo.',
    helpBack: 'Voltar: Esc ou Ctrl+H',
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
