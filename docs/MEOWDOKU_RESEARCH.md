# Meowdoku clone: research & plan

> "Meodoku" in the original request is the game **Meowdoku: Brain Puzzle Games**
> by **Oakever Games** (Android `com.oakever.meowdoku`, iOS id `6761760135`,
> also on web portals such as Yandex Games and Playgama). Research date: 2026-10-30.

## 1. What the game is

Meowdoku is a cat-themed version of the classic **Star Battle** logic puzzle
(1-star variant), the same puzzle LinkedIn ships as **Queens**. It is marketed
as "Sudoku meets Minesweeper", but there are no numbers.

### Rules

An N×N grid is divided into N colored regions. Place N cats so that:

1. every **row** holds exactly one cat;
2. every **column** holds exactly one cat;
3. every **colored region** holds exactly one cat;
4. no two cats **touch**, diagonals included.

Each level has exactly **one solution**, reachable by deduction alone, with no guessing.

### Mechanics seen in the original

| Feature | What sources report |
| --- | --- |
| Lives | 3 hearts. Placing a cat on a wrong cell costs a heart; losing all 3 restarts the level. |
| Marking | Tap to cycle a cell between empty, X (ruled out) and cat. Some builds use double-tap for a cat. |
| Board sizes | From about a 4×4 or 5×5 tutorial up to 9×9 mid-game, then 10×10 and 11×11 late. |
| Levels | About 288–300 hand-made levels, mostly rated "hard", plus a **daily puzzle**. |
| Hints | Not in the mobile app (reported). Fan web versions give 3 hints per puzzle that explain a logic step. |
| Other | Leaderboards, works offline, cute cat art and sounds. |
| Monetization | Free with ads, often an interstitial after every level. This is the most common complaint in reviews. |

Takeaways for our version: keep the core loop and hearts, add explaining hints,
and skip the ad-every-level model.

### UI reference (from a player screenshot, level 29, Arabic)

See `docs/reference/meowdoku-level-screen.png`. Top to bottom:

1. Round white **back** button, **Level** and **Points** counters (brown, rounded font), round **settings** gear.
2. White pill with **3 golden fish**, which are the lives.
3. White card with **3 rule tiles**, each a mini 3×3 example plus text: one cat per color, one cat per row and column, cats can't touch.
4. A white **tab of cat heads**, one per region, in pastel versions of the region colors. A head turns into the tuxedo cat once that region's cat is found.
5. The **board**: white rounded card, rounded colored cells with gaps, big white X marks, tuxedo cat faces. Placing a cat **auto-crosses its row, column, region and neighbours**.
6. Three round **power-ups** with red count badges: cat, lightbulb, mouse.
7. Ad banner (not cloned).

Our version matches this layout, using container-width (`cqw`) sizes measured from
the screenshot. Power-up effects are our best guess, because the screenshot doesn't
show them: **cat** places a correct cat, **bulb** crosses out cells ruled out by
deduction, and **mouse** removes X marks wrongly placed on a cat's cell.

### Behaviour (from a 33 s screen recording of level 29)

Reference frames: `docs/reference/meowdoku-home.png`, `meowdoku-cat-placement-frames.png`
(4 fps), `meowdoku-out-of-fish.png`.

- **Home:** "MEOWDOKU" logo (brown, blue cat-eared O, orange O with a striped tail) on a
  faint tiled background; avatar frame top-left, a currency pill (yarn toy) top-centre,
  gear top-right, a leaderboard podium with a countdown on the left, then an orange
  **Level N** button and a periwinkle **Daily challenge** button with a countdown tab.
- **Level start:** cells pop in diagonally from the bottom-left, the rules card gets an
  orange glow, and a toast says what % of players completed the level.
- **Points** shown in the header are *this level's* score, starting at 0. A correct cat
  shows `+576`, sends a sparkle to the counter, and the counter counts up.
- **Placing a cat:** a colour burst, `+points`, and **"Clear!"** (yellow, English even
  in Arabic). The ruled-out cells are then crossed in a **wave**: the touching cells
  first, then the row sweeping outward, then the column. Each X is drawn as two pen
  strokes, and "Clear!" pops at the far end of the row and the column.
- **Wrong cat:** the cell flashes orange-red with an X, a white heart pops and breaks,
  and the cell is left with a **red X**. A fish crumbles into a white outline, and
  placed cats look worried for a moment.
- **Out of fish:** a dark overlay, bubbly blue title "نفدت السمكات", a crying cat
  hugging a broken fish, "Left: N 🐱", **Get 3 fish** (watch an ad), and **Retry**.
  Retry replays the intro with points reset to 0.

Our version reproduces all of this, with these differences:
- **Get 3 fish** works once per attempt with no ad.
- No leaderboard and no completion-percentage toast, since both need a backend; we won't fake the numbers.
- The yarn pill shows the daily-challenge streak.

## 2. Legal note

Game rules and mechanics are not copyrightable, and Star Battle is a public
puzzle genre. Do **not** reuse the "Meowdoku" name, logo, cat art, sounds or
the original hand-made level files. The working title here is **"Cat Grid"**;
pick a final name and draw original art.

## 3. Technical design (this repo)

Stack: **Vue 3 + TypeScript + Vite**, tests with **Vitest**.

```
src/game/
  types.ts      Puzzle, Mark, CellIndex
  rng.ts        seeded PRNG (mulberry32), shuffle, dailySeed(date)
  solver.ts     backtracking row-by-row solver; findSolutions(limit) for uniqueness
  generator.ts  random cat layout → grow regions → repair until unique
  rules.ts      blockedBy, conflictingCats, isSolved
  useGame.ts    composable: marks, hearts, undo, restart, new puzzle
  game.test.ts
src/components/GameBoard.vue
src/App.vue     minimal playable shell
```

### Level generator

`src/game/logic.ts` is a **human-style solver**. It uses only deductions a player
can see, always taking the easiest one available:

| Level | Technique | Meaning |
| --- | --- | --- |
| 1 | single | a row, column or region has one open cell left, so the cat goes there |
| 2 | confine | a group lies inside one other group (a region within one row): cross out the rest of that group |
| 3 | squeeze | a cat here would wipe out every open cell of another group |
| 4–6 | confine k=2…4 | k regions fit inside k rows (or any kind pairing): those rows belong to them |

A puzzle's **difficulty** is the hardest technique the solver needed. If the solver
finishes, the solution is also proven unique.

`src/game/generator.ts`:
1. Places N non-touching cats.
2. Grows a region around each cat. Each region gets a random "appetite", so sizes
   range from one-cell entry points to large areas, and growth prefers cells hugged
   by the region, which keeps shapes as compact blobs like the original's.
3. While the solver gets stuck, or the difficulty is outside the level's band, moves
   one border cell (never a cat cell) into a neighbouring region. It targets cells of
   a rival solution first. If that fails, it starts over.

`src/game/levels.ts` sets the **size curve** (4×4 up to 10×10 by level 29, then a
9–11 rotation) and the **difficulty band** per level (singles first, then confinement
and squeezes, then multi-group confinement, with a "breather" every third late level).

`npm run levels` pre-builds **300 levels** into `src/levels/levels.json` (42 KB) on all
cores in about 2 minutes. A test re-verifies every level: correct size, inside its band,
logically solvable, and exactly one solution. Levels past the pack, and the daily 8×8,
are generated on the device with the same rules.

Difficulty histogram of the pack: L1: 3, L2: 7, L3: 119, L4: 145, L5: 22, L6: 4.

The **bulb** asks the same solver for the next step. It crosses out what that step
rules out and highlights the group that proves it, or for a forced cat it highlights
the cell without placing it.

## 4. Roadmap

**Done (this commit)**
- [x] Puzzle engine: solver, unique-solution generator, rule checks, seeded daily puzzle
- [x] Minimal playable board: tap cycle (empty, X, cat), 3 hearts, undo, restart, size picker, new puzzle
- [x] Unit tests (uniqueness for 4×4–11×11, determinism, connected regions, rules)

**UI pass (matches the reference screenshot)**
- [x] Header, fish lives, rule tiles, cat-head region strip, board, power-ups
- [x] Tap = X, double-tap = cat, drag to paint/erase, auto-X around placed cats
- [x] Levels with fixed seeds (10×10 by level 29), points, saved progress, Arabic/English (RTL)
- [x] Home screen, win and game-over dialogs, settings (language, reset)

**Recording pass**
- [x] Home screen (logo, daily challenge with countdown, streak), intro animation, rules glow
- [x] Per-level score with count-up, +points / "Clear!" / burst effects, auto-cross wave, pen-drawn X
- [x] Mistake animation (broken heart, red X, crumbling fish, worried cats), out-of-fish screen with refill
- [x] Daily challenge (8×8, UTC date seed) with a streak

**Generator pass**
- [x] Human-style logic solver with difficulty levels; deduction-only, unique puzzles
- [x] Compact, varied regions; difficulty band per level; 300-level pre-built pack
- [x] Bulb = next logical step with highlighted reason
- [x] Exact colours, X stroke and cell radius sampled from the recording; pill badges

**Next**
- [ ] Level select; leaderboard and completion stats (needs a backend)
- [ ] Sounds, haptics, richer win animation
- [ ] Web Worker generation for large boards; PWA/offline
- [ ] Optional: leaderboard backend, ports via Capacitor

## Sources

- Google Play listing: https://play.google.com/store/apps/details?id=com.oakever.meowdoku
- App Store listing: https://apps.apple.com/us/app/meowdoku/id6761760135
- Android Central review: https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem
- AppiReview: https://www.appireview.com/com.oakever.meowdoku
- Level map (fan site): https://meowdokuonline.net/meowdoku-levels/
- Level walkthroughs: https://levelsolve.com/meowdoku/
- Fan web version with hints: https://meowdoku.run/
- Guide: https://gridpaw.com/meowdoku-guide/
- Star Battle vs Queens: https://queensultimate.com/blog/queens-vs-star-battle
