# Computer opponents

The immutable `difficulties` registry and `difficultyIds` list are exported from `src/ai/index.ts`. IDs are stable and intended for use in future saved game settings. `chooseDifficulty(state, id, options)` applies a preset directly to a canonical state. The original A0, A1, A2 and S1 research controls are unchanged.

| ID | Display name | English designation | Battle policy | Depth ceiling | Nodes | Interactive time ceiling |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `tiro` | Tiro | Recruit | Reduced tactical evaluator, seeded rank sample | 1 | 560 | 90 ms |
| `miles` | Miles | Soldier | Basic tactical evaluator, narrower seeded rank sample | 1 | 680 | 180 ms |
| `veteranus` | Veteranus | Veteran | A2 full one-turn evaluation, stable first tie | 1 | 900 | 270 ms |
| `centurio` | Centurio | Centurion | S1 evaluation and alpha-beta, stable traversal | 2 | 1,600 | 450 ms |
| `legatus` | Legatus | Legate | S1 evaluation with a larger iterative search budget | 4 | 6,000 | 1,400 ms |
| `imperator` | Imperator | Commander | S1 evaluation with the largest practical search budget tested | 5 | 20,000 | 2,800 ms |

All levels use seeded random deployment and the exact search overlay. Search levels use phase-aware ordering. Aspiration, tactical extensions and the M3.2 strategic preset stay off. Random deployment remains the common choice because the opening trials did not show a reliable advantage for alternatives. The recorded time targets are ceilings, with no added wait when a decision finishes early.

Tiro and Miles start with the A2 weights. Both retain scores for actual removal **100**, custody **24** and due removal **46**. Tiro disables threats, multiple threats, rescue, redundant pairs and exposed captors. Miles assigns threat **5**, rescue **3**, and exposed captors **1**, with multiple threats and redundant pairs disabled. Veteranus and the search levels use the unchanged A2/S1 weights.

Tiro samples at most 10 candidates within 105 points of the best safe evaluated move, with relative mass `0.82 ^ rank`. Miles uses at most four candidates, a 42-point margin and mass `0.53 ^ rank`. Rank starts at zero. Stable engine order breaks equal scores within the list. A seed drives sampling and both levels take a detected immediate win. A detected immediate loss is excluded when another examined action avoids it. Each decision still comes from the engine's legal list, even when budget exhaustion or cancellation returns a fallback. These choices give the weaker levels predictable bounds on the mistakes they can make.

The upper levels differ in search capacity, but the trials do not establish three statistically separate strength bands above Veteranus. Imperator has the largest budget and can still miss tactics or fail to complete its nominal depth. See [calibration results](M3_3_RESEARCH.md).

## Worker contract for M3.4

Send an `AiRequest` with `requestId` (a unique nonblank string up to 128 characters), the full canonical `state`, a `difficulty` ID and an optional unsigned 32-bit `seed`. `mode` defaults to `interactive`. `limits` can lower `nodes`, `depth` or `timeMs` within the selected preset ceilings. Nodes and time may be zero to request a fallback. Deterministic mode omits the time ceiling and rejects a time override. Use it with a fixed seed and node budget for reproducible action choices.

```ts
const request: AiRequest = {
  requestId: 'match-12:turn-47',
  state,
  difficulty: 'centurio',
  seed: 47,
  mode: 'interactive',
  limits: { timeMs: 300 },
}
const response = handleAiRequest(request)
```

A successful response echoes the ID, contains `ok: true`, and provides a legal `action` or `null` for an ended game. Diagnostics include nodes, completed depth, stop reason, and principal variation. Errors echo the ID when it is valid and contain `invalid-request`, `invalid-state`, or `search-failed`. Timing diagnostics vary even when the move is reproducible.

The handler validates the full canonical snapshot through the engine, including the repetition ledger. It does not reconstruct an action log to establish historical provenance. Pass the canonical committed state and include the entire ledger and movement history. Search overlays are internal and the handler rejects an overlay passed directly. A host must not clone or serialize a private overlay and treat the result as a canonical snapshot.

In M3.4, send work to a dedicated worker. On navigation, undo or a changed match, invalidate the request ID and discard stale responses. For immediate cancellation, terminate the worker and create a replacement. A synchronous search cannot read ordinary worker cancellation messages until it returns. Cooperative hosts may provide a deadline, injected monotonic clock and polling hook. Polling occurs between engine operations. GitHub Pages integration should work without shared memory. Validate the returned action against the current state before committing it through the existing match path. Worker plumbing and AI turns are still outside M3.3.
