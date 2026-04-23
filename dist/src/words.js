"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWordBank = loadWordBank;
exports.randomAnswer = randomAnswer;
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
const localBank = {
    answers: offlineAnswers,
    validWords: [...new Set([...offlineAnswers, ...extraValidWords])],
};
function loadWordBank() {
    return localBank;
}
function randomAnswer(answers) {
    return answers[Math.floor(Math.random() * answers.length)];
}
