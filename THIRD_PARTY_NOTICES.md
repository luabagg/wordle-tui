# Third-Party Notices

This project bundles generated five-letter word data in `src/dict/en/`
(English) and `src/dict/pt-br/` (Brazilian Portuguese) used for the daily
answer and guess lists.

## English word lists

- **Wordle allowed guesses**: `https://raw.githubusercontent.com/tabatkins/wordle-list/main/words`
  - License: MIT (https://github.com/tabatkins/wordle-list)
- **Word frequency data**: `https://norvig.com/ngrams/count_1w.txt`
  - Derived from the Google Books Ngram data, which Google makes freely available for any purpose.
  - Source: Peter Norvig's compilation at https://norvig.com/ngrams/

The English answer list is derived by taking the top 2,500 most frequent 5-letter words from the frequency data that also appear in the Wordle allowed-guesses list.

## fserb/pt-br

Source: https://github.com/fserb/pt-br

License: MIT.

Used for the bundled Brazilian Portuguese five-letter guess dictionary and daily
answer list.
