# Director

The director turns a stat into candidate puzzles by comparing a written expectation to the real ranking. The expectations are the author's stereotypes and conventional guesses. They live in `expectations.json`. They are never shown to players. Player-facing copy only states the measured contrast and a sourced reason.

## What it writes down

For one stat, three lists:

1. Seven countries, or one named group, that conventional, stereotyped, or nationalist thinking would expect to be **highest**.
2. Seven it would expect to be **lowest**.
3. Seven popular, much-discussed countries. The stored list is the United States, the United Kingdom, France, Japan, Germany, China, and Australia. `POPULAR_COUNTRIES.tier1` in `app.js` is a different list and is not what this report prints.

Groups such as Muslim-majority or East Asian are explicit country lists in the same file, with the source of membership named in the playbook here. A country is not added to a group from memory at runtime.

## How surprise is scored

Rank 1 is the highest value when `higherIs` is `top`, and the lowest value when it is `bottom`.

- A country expected to be high scores `(actualRank - 1) / (n - 1)`. It is 0 when the country really is first and 1 when it is last.
- A country expected to be low scores `(n - actualRank) / (n - 1)`. It is 0 when the country really is last and 1 when it is first.
- A popular country is reported with its actual rank and a score of 0. It is context, not a stereotype.

Countries missing from the series are listed as missing. They are not given a rank.

## What it proposes

From the highest surprise scores it proposes, without writing the stereotype into the puzzle:

- A Guess the number pair: show a popular or expected country, and ask for the surprising one.
- A Name it window: strictly between two real values, with a letter rule when that still leaves at least two answers.
- A Match it or Rank it set only when every value is in the series and the order is strict.

Run:

```
node tools/director/run.js
```

That rewrites `tools/director/report.md`. The puzzle copy is chosen by hand from that report, and only after the number is checked against the series.
