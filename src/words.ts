export interface WordBank {
  answers: string[];
  validWords: string[];
}

const offlineAnswers = [
  'crane', 'adieu', 'stare', 'flame', 'grind', 'lucky', 'brave', 'crown', 'pride', 'stone',
  'tiger', 'frost', 'cloud', 'vivid', 'shiny', 'sugar', 'bloom', 'smile', 'ocean', 'zesty',
  'waltz', 'quest', 'mango', 'spice', 'tempo', 'piano', 'laser', 'jolly', 'gamer', 'rhyme',
];

const extraValidWords = [
  'about', 'other', 'which', 'their', 'there', 'apple', 'angle', 'alien', 'alert', 'arise',
  'raise', 'rates', 'tears', 'stale', 'slate', 'later', 'water', 'house', 'mouse', 'light',
  'night', 'fight', 'might', 'thing', 'think', 'bring', 'drink', 'sleep', 'sweep', 'creek',
  'bleak', 'speak', 'close', 'charm', 'chase', 'grace', 'frame', 'blame', 'plane', 'trace',
  'trade', 'tried', 'truce', 'proud', 'sound', 'round', 'found', 'bound', 'sharp', 'share',
  'spare', 'spear', 'heart', 'earth', 'chart', 'start', 'smart', 'apart', 'party', 'racer',
  'cider', 'rider', 'wider', 'under', 'older', 'young', 'eager', 'fable', 'cable', 'table',
  'baker', 'maker', 'taker', 'taken', 'token', 'honey', 'money', 'funny', 'sunny', 'rainy',
  'storm', 'chill', 'grape', 'berry', 'lemon', 'melon', 'peach', 'plums', 'cocoa', 'mocha',
];

const localBank: WordBank = {
  answers: offlineAnswers,
  validWords: [...new Set([...offlineAnswers, ...extraValidWords])],
};

export function loadWordBank(): WordBank {
  return localBank;
}

export function randomAnswer(answers: string[]): string {
  return answers[Math.floor(Math.random() * answers.length)];
}
