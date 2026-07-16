"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const i18n_1 = require("../src/i18n");
(0, node_test_1.default)('messages exist for en and pt', () => {
    strict_1.default.equal(i18n_1.messages.en.notInDictionary, 'Not in dictionary.');
    strict_1.default.equal(i18n_1.messages.pt.notInDictionary, 'Não conheço essa palavra.');
});
