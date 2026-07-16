"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isQuitCommand = isQuitCommand;
exports.isRestartCommand = isRestartCommand;
exports.isHelpCommand = isHelpCommand;
exports.isProgressCommand = isProgressCommand;
exports.isBackCommand = isBackCommand;
exports.isShareCommand = isShareCommand;
exports.isLanguageSwitchCommand = isLanguageSwitchCommand;
exports.isTipsCommand = isTipsCommand;
exports.resolveKey = resolveKey;
function isQuitCommand(key, status) {
    return (key.ctrl && key.name === 'c')
        || (key.ctrl && key.name === 'q')
        || key.name === 'escape'
        || (status !== 'playing' && key.name === 'q');
}
function isRestartCommand(key, status) {
    return (key.ctrl && key.name === 'r') || (status !== 'playing' && key.name === 'r');
}
function isHelpCommand(key) {
    return Boolean(key.ctrl && key.name === 'h');
}
function isProgressCommand(key) {
    return Boolean(key.ctrl && key.name === 'p');
}
function isBackCommand(key) {
    return !key.ctrl && key.name === 'escape';
}
function isShareCommand(key, status) {
    return status !== 'playing' && !key.ctrl && key.name === 's';
}
function isLanguageSwitchCommand(key) {
    return Boolean(key.ctrl && key.name === 'l');
}
function isTipsCommand(key) {
    return !key.ctrl && key.name === 'tab';
}
function resolveKey(context, str, key) {
    const { view, status, introPending } = context;
    if ((key.ctrl && key.name === 'c') || (key.ctrl && key.name === 'q')) {
        return { type: 'quit' };
    }
    if (view === 'help') {
        if (introPending || key.name === 'escape' || (key.ctrl && key.name === 'h')) {
            return { type: introPending ? 'dismissIntro' : 'backToGame' };
        }
        return { type: 'noop' };
    }
    if (view === 'progress') {
        if (key.name === 'escape' || (key.ctrl && key.name === 'p')) {
            return { type: 'backToGame' };
        }
        return { type: 'noop' };
    }
    if (view === 'tips') {
        if (key.name === 'escape' || key.name === 'tab') {
            return { type: 'backToGame' };
        }
        return { type: 'noop' };
    }
    if (key.ctrl && key.name === 'h')
        return { type: 'openHelp' };
    if (key.ctrl && key.name === 'p')
        return { type: 'openProgress' };
    if (isLanguageSwitchCommand(key))
        return { type: 'switchLanguage' };
    if (isTipsCommand(key))
        return { type: 'openTips' };
    if (isQuitCommand(key, status))
        return { type: 'quit' };
    if (introPending)
        return { type: 'dismissIntro' };
    if (isRestartCommand(key, status))
        return { type: 'restart' };
    if (isShareCommand(key, status))
        return { type: 'share' };
    if (key.name === 'return')
        return { type: 'submit' };
    if (key.name === 'backspace' || key.name === 'delete')
        return { type: 'backspace' };
    if (key.name === 'left')
        return { type: 'moveCursor', offset: -1 };
    if (key.name === 'right')
        return { type: 'moveCursor', offset: 1 };
    if (key.name === 'home')
        return { type: 'setCursor', position: 0 };
    if (key.name === 'end')
        return { type: 'setCursor', position: 'end' };
    if (str && !key.ctrl)
        return { type: 'type', char: str };
    return { type: 'noop' };
}
