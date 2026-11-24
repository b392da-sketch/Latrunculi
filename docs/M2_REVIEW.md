# M2 independent review follow-up

## R01 · Long matches and import safety

The 44d867b baseline retained every repetition ledger. With no removals their key counts grew with each turn and each retained copy held all earlier keys. A 160 KiB compact JSON file with 5,000 legal actions retained 573 MiB on the Node heap and blocked Chromium's main thread for 5.7 seconds. The title of a match, the size of a JSON file, and the number of pieces on the board are poor proxies for the replay cost.

The revised history retains the action and event logs, current state, up to 32 periodic checkpoints, and 24 recent states. Checkpoint spacing increases as the log grows. On a cache miss, undo/redo replays from the nearest earlier saved state. Every restored position still has the engine's exact repetition ledger. The move list displays up to 60 entries at once. Local resume and JSON import validate the entire version 1 log, including the redo tail. Browser replay and cold history recovery yield between slices of roughly 12 ms and can be canceled. A single engine operation, JSON parsing, and garbage collection can still take longer than a slice.

The app accepts at most 5 MiB of UTF-8 JSON, 12,000 actions including the redo tail, and 64 square entries per action path. The engine still validates the actual path against the rules. These are application import safeguards. Live play has no new turn cap. Local save declines a log it would be unable to resume, and JSON export remains available for archival with a warning when the file exceeds the import budget.

### Measurements

The quiet fixture uses seed 19 and confines each side to three ranks with two empty ranks between them. It generates each action using the engine and checks termination and removal counts throughout. The removal fixture uses seed 2 with ordinary random play. It finishes legally at action 891 with 30 removals, including a terminal removal. Both fixtures start with a legal deployment and use ordinary repetition and outcome logic. The baseline was run through 5,000 quiet actions. The 10,000-action baseline was skipped because of the memory growth already measured.

Node 24 on the cloud workspace. Retained heap is the difference before and after replay with an explicit GC, excluding fixture generation. Numbers are individual runs except the revised commit column, which uses the median of five ordinary commits from an ongoing tip. The baseline commit was measured after one undo. The removal case measures committing at the penultimate position because its tip is terminal. Hot undo and redo each use one step near the loaded cursor. Cold seek jumps directly to the midpoint. File size shows exported JSON and the equivalent compact input.

| History | Actions | Export / compact bytes | Node import before → after (ms) | Retained heap before → after (MiB) | Commit after (ms) | Hot undo / redo after (ms) | Cold midpoint after (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Quiet | 100 | 7,236 / 3,082 | 2.60 → 3.07 | 0.16 → 0.05 | 0.04 | 0.19 / 0.04 | 0.60 |
| Quiet | 1,000 | 83,165 / 32,589 | 160.85 → 140.28 | 4.99 → 0.85 | 0.44 | 0.02 / 0.01 | 2.94 |
| Quiet | 5,000 | 420,751 / 163,727 | 7,802.53 → 5,007.97 | 573.35 → 7.13 | 4.11 | 0.03 / 0.01 | 228.22 |
| Quiet | 10,000 | 842,871 / 327,670 | — → 28,083.79 | — → 13.89 | 6.31 | 0.04 / 0.01 | 1,257.65 |
| 30 removals | 891 | 74,218 / 29,363 | 53.65 → 21.64 | 1.62 → 0.51 | 0.02 | 0.03 / 0.01 | 0.54 |

Baseline commit timings at 100, 1,000, 5,000, and 891 actions were 0.12, 0.69, 2.44, and 0.05 ms respectively. Baseline hot undo and redo took at most 0.11 ms and 0.01 ms. The original timeline made cold seeks immediate at the cost of retaining every state. The revised architecture trades that retention for bounded replay work between checkpoints. The browser yields during cold recovery.

Chromium 156, production preview, compact input via file picker. Wall time includes Playwright input and waiting for the restored-match message. Responsiveness is the widest observed gap in a 16 ms page timer during the operation. The longer wall time at 5,000 actions reflects cooperative replay, while the page continued servicing timers. The results describe this machine and fixture, and do not establish latency on slower devices.

| History | Browser import before → after (ms) | Widest timer gap before → after (ms) |
| --- | ---: | ---: |
| Quiet 100 | 183.1 → 160.2 | 68.7 → 62.5 |
| Quiet 1,000 | 354.4 → 269.4 | 256.7 → 34.2 |
| Quiet 5,000 | 5,798.1 → 5,990.3 | 5,660.8 → 57.0 |
| Quiet 10,000 | — → 24,680.5 | — → 54.6 |
| 891 with removals | 212.8 → 160.5 | 79.1 → 33.5 |

From the repository root, reproduce the Node numbers and generate compact fixtures.

```sh
mkdir -p /tmp/latrunculi-bench
NODE_OPTIONS=--expose-gc LATRUNCULI_BENCH_FIXTURES=/tmp/latrunculi-bench \
  npx vitest run --reporter=default tests/history-performance.simulation.test.ts
```

Set `LATRUNCULI_BENCH_MAX=5000` for the shorter range. For the browser probe, build and start `npm run preview -- --host 127.0.0.1 --port 4173`, then run `node scripts/browser-history-benchmark.mjs /tmp/latrunculi-bench`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using a system Chromium.

## R02 · Stale imports

Each file read and replay has an abort signal. Actions that replace or advance the session, newly initiated imports, and navigation invalidate pending work. File reads check the signal before opening confirmation, and replay checks it before installing a match or reporting an error. Deferred promises exercise the five reported races deterministically. Ordinary confirmation and import errors are also checked in the browser.

## R03 · Browser and accessibility

The turn card now precedes the board in DOM order and in the mobile layout. The browser suite checks native dialog focus and focus return, keyboard traversal, touch, save and restore, import and download, responsive layout, and motion preferences. Axe checks cover the menu, deployment, battle, settings, rules and confirmation. The corrected illustrations place corner custody on a real board corner and show the right colors and move for a rescue. The engine validates the illustrated leap, holding pairs and rescue.
