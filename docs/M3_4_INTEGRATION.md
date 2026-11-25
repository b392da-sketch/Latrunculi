# M3.4 computer play

Choose **Play the computer** on the main menu. Each opponent has a Latin name, an English designation, and a short description. Centurio (Centurion) is preselected. Choose White, Black, or Random. White places first, and the game identifies the computer's side and your side. The **New local game** entry starts a shared-device match.

## Match controller

The frontend holds a typed local or computer configuration. A computer match fixes both sides, the difficulty ID, and a 32-bit seed at setup. Random assignment is resolved once. Presentation preferences are stored alongside the match. The computer's seed for a decision is derived from the match seed and the committed history cursor. A resumed live turn uses the same seed. Interactive deadlines can change the depth reached on different runs, so a newly searched reply can differ. Redo always uses the recorded action.

The controller schedules a worker when the game page is active, the canonical state is nonterminal and belongs to the computer, and presentation and history operations have settled. Scheduling follows the turn in the committed state, including when the same side places last and moves first in battle. A delay between consecutive computer actions comes from presenting the previous action's events. Both the app setting and the OS preference reduce that pacing. Board focus and arrow navigation remain available during computer turns. Board action activation is disabled while the computer owns the turn. Status and engine events are announced, and the normal match view omits search diagnostics.

## Worker lifecycle

The controller uses the pending, thinking, and applying states during a request. The app also distinguishes awaiting human input, presenting events, paused, recoverable error, and game over. A Vite module worker receives a structured-cloned canonical snapshot (including repetition and oscillation history), the preset, the per-turn seed, and a request ID. It uses the M3.3 registry's resource ceilings and `handleAiRequest` to validate the snapshot, search, and return a complete action or structured error. It uses ordinary worker messaging with no shared-memory or cross-origin-isolation dependency.

Each reply must match the active request and match generation, and the current canonical state must still be the one requested, belong to the computer, and be nonterminal. The common match commit applies the canonical legality check and commits removal, movement, and custody events as a single action. The worker is terminated after its first reply. New games, history moves, loading and import, navigation, replacement, effect changes, and unmount revoke the current request and terminate its worker. Deferred startup and effect cleanup prevent duplicate turns during React Strict Mode replay.

Startup and runtime failures, invalid replies, and timeouts leave the committed state available to save. **Retry computer turn** starts a new request with the same opponent and turn seed. A legal reply from a node- or time-limited search is accepted. An ordinary worker message cannot interrupt synchronous search, so immediate cancellation terminates the worker.

## History and saves

Local undo and redo navigate one canonical action at a time. Computer undo cancels work in progress and returns to the preceding human decision, including any completed computer replies. An AI-first opening remains at the beginning of the history. Redo walks the recorded action and its computer continuation, including consecutive computer turns at a phase boundary. If a cursor has a recorded future, the computer waits for history navigation. A newly committed choice from an earlier human position replaces that future. Both modes retain bounded checkpoints and the complete action log.

Version 1 saves and exports retain the M2 local format. Version 2 adds the resolved ownership, difficulty, and seed. Both contain the starting player, committed actions, cursor, redo tail, and preferences. Saving during search stores the committed prefix and any existing redo tail. Resume reconstructs canonical state and schedules a computer action when the restored cursor is at the live end and it is the computer's turn. The existing 5 MiB and 12,000-action limits apply to import and resume. Live play follows the canonical termination rules. Invalid metadata is rejected before replay, and a stale read or replay cannot replace a newer match.

## Production worker benchmark

Chromium 156 on an AMD EPYC 7763 cloud host loaded the production worker bundle from `/Latrunculi/`. Six canonical snapshots covered empty deployment, early battle at ply 45, a dense midgame at ply 64, multiple prisoners, an 11-counter endgame at ply 850, and a quiet 2,500-action history with 2,461 repetition keys. Each preset/snapshot pair got one cold request on a fresh worker and one warm request reusing that worker, both with seed 47. The app uses the cold path for each turn. All 144 replies across normal and throttled runs matched canonical legal actions.

Battle timings below are milliseconds. Each round-trip cell gives the median and maximum across the five battle positions. Search is the median time reported by the worker protocol at normal speed. The depth range includes both configurations and both requests.

| Opponent | Cold round trip | Warm round trip | Cold round trip, page 4× | Warm round trip, page 4× | Median search, cold / warm | Completed depth |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tiro | 21.7 / 29.7 | 3.8 / 8.9 | 25.6 / 44.5 | 5.0 / 13.9 | 4.6 / 2.6 | 1 |
| Miles | 18.6 / 29.0 | 4.2 / 9.2 | 24.5 / 43.7 | 4.3 / 16.7 | 4.4 / 2.5 | 1 |
| Veteranus | 25.0 / 32.2 | 3.7 / 9.5 | 28.6 / 46.5 | 5.9 / 17.2 | 6.5 / 2.4 | 1 |
| Centurio | 33.0 / 44.0 | 13.4 / 14.3 | 42.2 / 57.8 | 13.2 / 18.7 | 11.7 / 9.5 | 2 |
| Legatus | 200.0 / 528.9 | 126.3 / 285.0 | 190.2 / 385.3 | 141.7 / 263.1 | 183.0 / 125.2 | 3–4 |
| Imperator | 654.9 / 987.5 | 475.0 / 751.9 | 570.8 / 990.7 | 496.9 / 724.9 | 633.5 / 464.7 | 4–5 |

- Deployment cold round trips had a 16.3 ms median and a 26.9 ms maximum normally, or 19.5 ms and 27.4 ms with page throttling. Imperator's normal cold results were 987.5 ms in early battle, 654.9 ms in the dense midgame, 271.2 ms with multiple prisoners, 406.3 ms in the sparse endgame, and 783.0 ms with the long history.
- The cold-minus-warm inbound difference estimates startup and module load. Its normal median and maximum were 10.9 ms and 42.9 ms, or 14.8 ms and 23.8 ms throttled. Warm message transit in both directions, including structured clone and scheduling, had a median and maximum of 0.4 ms and 1.6 ms normally, or 1.0 ms and 6.2 ms throttled. The probe does not isolate structured clone from transit.
- Worker handling time minus search time estimates snapshot validation and dispatch overhead. The normal median was 1.9 ms cold and 0.3 ms warm. On the 2,500-action history it ranged from 13.5 to 20.5 ms cold and 5.5 to 8.9 ms warm.
- The widest gap on a 16 ms page timer was 25.3 ms normally and 27.0 ms throttled. Calling `terminate()` on the dense Imperator request took less than 0.2 ms in both runs, with no reply during the following 90 ms. This measures the API call and observable delivery, not background thread reclamation. Page JS heap ended roughly 4.3 MiB and 3.8 MiB above its starting readings respectively, without forcing garbage collection. These readings exclude dedicated-worker heap.
- CDP throttling targets the page. Dedicated-worker compute speed may scale differently. The throttled numbers are neither measurements on a slow device nor evidence that the worker was four times slower. The measurements support retaining the M3.3 ceilings on the tested setup.

## Reproduction and browser coverage

```sh
npm ci
npm run typecheck
npm test
npx vitest run tests/web-worker-fixtures.simulation.test.ts
npm run build -- --base=/Latrunculi/
npx playwright install chromium firefox webkit
LATRUNCULI_PAGES_SMOKE=1 npm run e2e -- e2e/computer-game.spec.ts
```

To reproduce timings, keep the Pages build and run the preview command in one terminal and the probe in another.

```sh
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --base=/Latrunculi/
node scripts/browser-ai-benchmark.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` to use a system Chromium. Set `LATRUNCULI_SCREENSHOTS` to an output directory for the Playwright captures. Desktop and mobile Chromium exercise the real worker, canonical deployment and battle, save/resume, keyboard controls, and axe. The Pages smoke exercises base-path scripts, styles and worker assets, navigation, local storage and reload/resume. Firefox and WebKit remain in the Playwright matrix. Their browser downloads returned HTTP 403 in the development environment.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Computer setup | [Desktop setup](screenshots/computer-setup-desktop.png) | [Mobile setup](screenshots/computer-setup-mobile.png) |
| Computer match | [Desktop match](screenshots/computer-match-desktop.png) | [Mobile match](screenshots/computer-match-mobile.png) |

Physical-device playtesting should check Imperator's time to move on a lower-powered phone, consecutive computer moves at the phase boundary with a screen reader, and whether newcomers can follow leap and custody events in both motion settings. Longer head-to-head playtests can investigate perceived difficulty gaps and the frequency of drawn or prolonged games. The presets describe playing behavior, and the current calibration does not establish Elo bands.
