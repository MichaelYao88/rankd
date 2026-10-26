# AdSense-safe daily window

Ranki.gg is waiting on AdSense review. Every daily on or before **2026-11-03** (the archive through that day, which covers 2026-10-27 plus the seven days after it) should not show a clearly sensitive puzzle. Puzzle ids are unchanged. Only `daily_order` was exchanged, so the set of puzzles is the same.

`CONFIG.adsenseSafeThrough` in `app.js` is that cutoff. `inAdsenseSafeWindow(dateKey)` is true for dates on or before it. Set `adsenseSafeThrough` to `""` after approval; the helper then stays off. The schedule does not move itself. Re-apply or revert with the pairs below.

```
python3 tools/adsense_safe_window.py --check
python3 tools/adsense_safe_window.py --plan
python3 tools/adsense_safe_window.py --apply
```

`--apply` is safe to repeat. It only swaps a clearly sensitive daily that is still inside the window.

## What counts as sensitive

There is no `sensitive` column in `puzzles.csv`. `build.py` stamps `sensitive: true` on the puzzle object in `puzzles-data.js`. Studio shows that as a tag. Practice datasets use `sens` in `practice-data.js` (rape lists are omitted there). That flag is wider than this window: ethnicity tables, LGBT legal indexes, crime convictions and similar stay flagged, and most of them were already after 2026-11-03.

An earlier AdSense pass softened wording (rape written as "grape", child sexual abuse material written as "child-sex image" / "child corn"). Those puzzles are still clearly sensitive. They were already scheduled after 2026-11-03, so this pass did not move them. `penis-girth` (Reported Circumference) is explicit and is **not** flagged `sensitive` in the data. It is also already after the window (kept on its date).

For this window, only these are clearly sensitive and were moved:

- sexual content (pornography, child sexual abuse, sex offences, age of consent, Reported Circumference)
- sexual violence and intimate partner violence
- homicide, murder, serial killers, suicide
- drugs (overdose, drug deaths, cannabis)

## Swaps

Each pair exchanged `daily_order`. Nothing else moved.

| Puzzle | Was | Now |
|---|---|---|
| Homicide Rates (`homicide`) | 2026-10-18 #013 | 2026-11-04 #030 |
| City English (`ef-epi-city`) | 2026-11-04 #030 | 2026-10-18 #013 |
| Female Homicide (`homicide-women`) | 2026-10-20 #015 | 2026-11-06 #032 |
| Market Transition (`market-economy-age`) | 2026-11-06 #032 | 2026-10-20 #015 |
| Suicide Rates (`suicide`) | 2026-10-22 #017 | 2026-11-10 #036 |
| Green Machines (`renewables`) | 2026-11-10 #036 | 2026-10-22 #017 |
| Homicide by Sex (`homicide-sex`) | 2026-10-25 #020 | 2026-11-27 #053 |
| Stars and Stripes (`pew-us-favorable`) | 2026-11-27 #053 | 2026-10-25 #020 |

To revert after approval, exchange those eight orders back (same pairs) in `puzzles-data.js`, `puzzles.csv` and `puzzles.xlsx`.

Partners were the earliest later puzzles that are not clearly sensitive, not `sensitive: true`, and not a borderline topic, and that do not sit next to a clearly sensitive day. That keeps homicide and suicide from landing on back-to-back days.

## Window, before and after

| Date | # | Before | After |
|---|---|---|---|
| 2026-10-06 | 001 | Grindset Nations | Grindset Nations |
| 2026-10-07 | 002 | Fatal Crash Rates | Fatal Crash Rates |
| 2026-10-08 | 003 | Bottoms Up | Bottoms Up |
| 2026-10-09 | 004 | Happy Places | Happy Places |
| 2026-10-10 | 005 | Rice Buckets | Rice Buckets |
| 2026-10-11 | 006 | Heavyweights | Heavyweights |
| 2026-10-12 | 007 | Long Livers | Long Livers |
| 2026-10-13 | 008 | Tomato Towns | Tomato Towns |
| 2026-10-14 | 009 | Fertility Rate | Fertility Rate |
| 2026-10-15 | 010 | Madam Speaker | Madam Speaker |
| 2026-10-16 | 011 | Wine O'Clock | Wine O'Clock |
| 2026-10-17 | 012 | Lab Coats | Lab Coats |
| 2026-10-18 | 013 | Homicide Rates | City English |
| 2026-10-19 | 014 | Tear Jerkers | Tear Jerkers |
| 2026-10-20 | 015 | Female Homicide | Market Transition |
| 2026-10-21 | 016 | Potato-eaters | Potato-eaters |
| 2026-10-22 | 017 | Suicide Rates | Green Machines |
| 2026-10-23 | 018 | Full House | Full House |
| 2026-10-24 | 019 | Into the Woods | Into the Woods |
| 2026-10-25 | 020 | Homicide by Sex | Stars and Stripes |
| 2026-10-26 | 021 | Foreign Relations | Foreign Relations |
| 2026-10-27 | 022 | Working Women | Working Women |
| 2026-10-28 | 023 | Straight A's | Straight A's |
| 2026-10-29 | 024 | Tall Girls | Tall Girls |
| 2026-10-30 | 025 | Trump Voters | Trump Voters |
| 2026-10-31 | 026 | Defense Budgets | Defense Budgets |
| 2026-11-01 | 027 | Carbon Footprints | Carbon Footprints |
| 2026-11-02 | 028 | Top of the Class | Top of the Class |
| 2026-11-03 | 029 | Alcohol per Adult | Alcohol per Adult |

## Borderline puzzles left in the window

These stayed on purpose.

| Date | Puzzle | Why it stayed |
|---|---|---|
| 2026-10-07 | Fatal Crash Rates (`crash-rate`) | Traffic deaths, not homicide, murder or suicide |
| 2026-10-08 | Bottoms Up (`alcohol`) | Alcohol |
| 2026-10-11 | Heavyweights (`obesity`) | Mild body topic |
| 2026-10-14 | Fertility Rate (`fertility`) | Births, not sexual content |
| 2026-10-16 | Wine O'Clock (`top5-wine`) | Alcohol |
| 2026-10-23 | Full House (`fertility-c`) | Births, not sexual content |
| 2026-10-28 | Straight A's (`uk-alevel-aaa-ethnicity`) | Ethnicity and exam results. Repo `sensitive` flag. Not a voting split |
| 2026-10-29 | Tall Girls (`height-girls-19`) | Mild body topic |
| 2026-10-30 | Trump Voters (`trump-2024-race-gender`) | Race/ethnicity voting split |
| 2026-11-02 | Top of the Class (`uk-gcse-ethnicity`) | Ethnicity and exam results. Repo `sensitive` flag |
| 2026-11-03 | Alcohol per Adult (`alcohol-c`) | Alcohol |

## Ids, stats, links, archive unlock

- Puzzle ids did not change. Community stats (`community-stats.json` and the live snapshot) are keyed by puzzle id, so they follow the puzzle.
- Daily and archive progress is stored as `d:YYYY-MM-DD`. `getResult` only uses that row when `result.id` is still the puzzle on that date, so an old play of Homicide Rates on 2026-10-18 is not shown as the result for City English.
- `#d=YYYY-MM-DD` still opens that calendar day. `#p=<puzzle id>` still opens that puzzle. `#r=<seed>` is still the practice seed.
- Archive unlock (`rankd.archiveUnlock.v1`) is a count of days back from today, not a puzzle id. Swapping order does not change who is unlocked.
