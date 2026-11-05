# Director

The director turns a stat into candidate puzzles by comparing two written expectations to the real ranking. Both live in `expectations.json`. Neither is shown to players. Player-facing copy only states the measured contrast and a sourced reason.

## Two lenses

Both lists are written before the ranks are read.

1. **Conventional.** The stereotyped or nationalist guess for this particular stat: who that habit would put first, and who it would put last.
2. **Paternalistic.** The guess that Western and white-majority countries are the most progressive, safe, healthy, educated, or gender-equal, and that Global South, Muslim-majority, and African countries lag on all of those. On a stat where a higher number is the better or richer outcome, this lens expects the West high and those regions low. On a stat where a higher number is the worse outcome, it expects those regions high and the West low. On population in 2100 it uses the same regions' fertility story: those regions highest, the West lowest.

For each lens, each stat stores seven expected highs and seven expected lows. A third list is seven popular, much-discussed countries: the United States, the United Kingdom, France, Japan, Germany, China, and Australia. `POPULAR_COUNTRIES.tier1` in `app.js` is a different list and is not what this report prints.

Groups such as Muslim-majority or East Asian are explicit country lists in the same file. A country is not added to a group from memory at runtime.

## How surprise is scored

Rank 1 is the highest value. Each lens is scored on its own.

- A country expected to be high scores `(actualRank - 1) / (n - 1)`. It is 0 when the country really is first and 1 when it is last.
- A country expected to be low scores `(n - actualRank) / (n - 1)`. It is 0 when the country really is last and 1 when it is first.
- A popular country is reported with its actual rank and no stereotype score.

Countries missing from the series are listed as missing. They are not given a rank. The same country can score twice when the two lenses point it in different directions.

## What it proposes

The highest scores become a **Rank it** board first: the most surprising countries that have a figure, in real order. A board is kept only when at least four values are present and all of them differ. **Match it** is the fallback, and only when those countries do not form that strict order. Guess the number stays a pair, with one published value shown and the most surprising country left to guess. Name it stays a window between two real values.

Run:

```
node tools/director/run.js
```

That rewrites `tools/director/report.md`. The puzzle copy is chosen by hand from that report, and only after the number is checked against the series.
