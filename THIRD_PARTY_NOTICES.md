# Third-Party Notices

This project bundles generated five-letter word data in `src/dict/en/`
(English) and Brazilian Portuguese data used for the daily answer and guess
lists.

## English word lists

- **Wordle allowed guesses**: `https://raw.githubusercontent.com/tabatkins/wordle-list/main/words`
  - License: MIT (https://github.com/tabatkins/wordle-list)
- **Common English word filter**: `word-list` npm package
  - License: MIT (https://github.com/sindresorhus/word-list)

The English answer list is derived by taking the 5-letter words from the
Wordle allowed-guesses list that also appear in the `word-list` common English
words.

## fserb/pt-br

Source: https://github.com/fserb/pt-br

License: MIT.

Used for the bundled Brazilian Portuguese five-letter guess dictionary and daily
answer list.
