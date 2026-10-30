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

### Generator

1. Place N non-touching cats, one per row and column (random backtracking).
2. Use each cat as a region seed and flood-fill randomly until every cell has a region.
3. Ask the solver for a second solution. If one exists, move one of *its*
   cat cells (never an intended-solution cell) into a neighbouring region,
   keeping the region it leaves connected. Repeat until the solution is
   unique, or restart.

Measured average generation time (20 seeds, Node 22): 4×4–8×8 ≤ 1.2 ms,
9×9 ≈ 12 ms, 10×10 ≈ 75 ms, **11×11 ≈ 0.5 s**. For 10×10 and up, generate in
a Web Worker or ship pre-generated level packs.

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

**Next**
- [ ] Difficulty grading: a human-style deduction solver that rates puzzles by the techniques they need, then a level ladder (4×4 to 11×11)
- [ ] Level select and a daily puzzle screen with a streak
- [ ] Hints that explain the next logical step (uses the deduction solver)
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
