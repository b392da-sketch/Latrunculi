# Game frontend

The React app in `src/web` supports two-player local play and human-versus-computer play. Vite serves the app and builds a static site in `web-dist/`. The TypeScript engine builds separately to `dist/`.

## State and engine integration

`match.ts` manages the initial configuration, the committed actions and presentation events, the history cursor, and bounded caches of full engine states. Undo and redo restore from the nearest cached state or replay through the engine in short, interruptible slices. Applying a new action from an earlier cursor discards the redo branch. Committing a turn calls `applyAction` once on the committed position.

`App.tsx` owns navigation, settings, and transient interaction state. It derives candidate actions from the engine's `legalActions` and `mandatoryRemovals`. Choosing a prisoner hides it in the preview only. The app then filters actions by the removal choice and selected origin. A leap is previewed with the engine's representative path and applied after confirmation. A step into the selected prisoner's now-vacant square is supported. Cancellation clears only the preview. Removal and movement are committed as one action.

`Board.tsx` renders the board, square labels, path marks, and keyboard navigation. CSS animates presentation of engine events with delays in event order. The already-committed engine state determines legality regardless of animation timing. The history uses engine notation, and the live announcement presents events in order. English player names, outcome strings, and event descriptions are centralized in `presentation.ts`. Static help and historical copy live in `Reference.tsx`.

Computer setup selects an opponent and resolves both sides once. The controller schedules computer turns in a dedicated worker and validates each reply against the current match before committing it through the same path as a human move. Local undo and redo move one canonical action at a time. In computer play they navigate human decision points, preserving the computer's opening and replaying any recorded replies. [Computer play and worker lifecycle](M3_4_INTEGRATION.md)

## Persistence

Save game writes one local slot. Export JSON downloads the same format. Local matches use version 1, which includes the starting player, entire action log, cursor, and preferences. Computer matches use version 2, which adds the difficulty, fixed sides, and match seed. M2 saves open as local matches. Saving while a worker is thinking captures the committed position and full redo history. The app restores positions by replaying every action, including the redo tail, from the engine's initial state. It rejects incompatible versions, invalid metadata, malformed actions and illegal histories. Import replaces the session only after validation and, during an ongoing game, confirmation. Starting another import, changing the match, navigating away, or canceling invalidates a pending file read or replay and its feedback. The save slot is updated only when the user selects Save game. Preferences are also retained separately so they apply to newly started games.

## Visual assets and compatibility

The board, original ringed counters, emblem, and rule illustrations use CSS and original markup. The favicon is an original SVG. The UI uses system fonts and the serif fonts available on the device. It loads no third-party art or fonts.

Use a modern browser with CSS Grid, native dialogs, and local storage for on-device saves. Browser automation targets Chromium desktop and Pixel 7 emulation, Firefox, and Playwright WebKit. WebKit automation is separate from testing Safari on a physical device. Use the keyboard to enter the board, navigate with arrows, activate with Enter or Space, and cancel a selection with Escape. Coordinates and rotation are optional, and the app honors both its reduced-motion setting and the operating-system preference.

This release uses representative leap paths, one manual save slot, and English text. Move history displays up to 60 entries at a time. Full state caches are bounded, although engine replay over a long stretch without removals still costs CPU time. The browser imports and resumes version 1 and 2 logs up to 5 MiB of UTF-8 JSON and 12,000 actions. These limits apply at the application import boundary. A longer live match can still be exported for archival. Optional sound, resignation and agreed draw were deferred.

## Tests and screenshots

Run `npm run typecheck`, `npm test`, and `npm run build`. For browser tests, run `npx playwright install chromium firefox webkit` and `npm run e2e` after building. To use a system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. The Playwright suite checks desktop and mobile layouts, touch and keyboard input, axe accessibility rules, browser errors, and exact agreement between exported or saved gameplay and direct engine replay.

Set `LATRUNCULI_SCREENSHOTS` to an output directory when running the browser suite to capture the same battle position on [desktop](screenshots/latrunculi-desktop.png) and [mobile](screenshots/latrunculi-mobile.png). The M1 simulation and gameplay diagnostic commands remain available.

[Independent review benchmarks and reproduction steps](M2_REVIEW.md)
