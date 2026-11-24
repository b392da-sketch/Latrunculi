# Engine architecture

`src/engine/index.ts` is the public API. The package uses strict TypeScript and builds to Node.js ESM with type declarations in `dist/engine/`. The engine uses only JavaScript language and standard library features.

| API | Behavior |
| --- | --- |
| `createGame({ firstPlayer? })` | Create an empty deployment board with full reserves. |
| `legalActions(state)` | Return deterministic representative legal actions. A terminal game returns an empty list. |
| `applyAction(state, action)` | Return the next state and ordered events. Invalid actions throw and leave the input unchanged. |
| `mandatoryRemovals(state)` | Return the squares of prisoners the player may choose from at this boundary. An empty list means there is no removal stage. |
| `result(state)` | Return the outcome or `null` while play continues. |
| `serialize(state)`, `deserialize(json)` | Save and read a versioned JSON snapshot. Deserialize throws on malformed data. |
| `positionKey(state)` | Encode the state features used for turn-boundary repetition. |
| `parseSquare`, `squareName`, `formatAction`, `formatEvent`, `formatResult` | Convert coordinates or format display notation. |

A square is a zero-based integer, with `a1 = 0`, `h1 = 7`, and `h8 = 63`. The board is a 64-element array. Each occupied cell records a stable ID, owner and status. Reserves and removed totals account for pieces outside the board. Treat state and events as immutable values.

A placement is `{ type: 'place', at }`. A battle action is `{ type: 'battle', remove?, path? }`. The path includes the origin and every landing. Omit the removal square unless removal is mandatory. Omit the path when a mandatory removal terminates the game. Removal and movement form one atomic transition.

Events are emitted in transition order. Within each custody batch, imprisonments precede liberations, with square order stabilizing event presentation. Every custody batch sees the same pre-batch position for its decisions. Newly liberated counters of the moving side can trigger another batch. Only the moving side creates new prisoners during its turn, so each continuing batch consumes a previously imprisoned friendly counter or ends when no friendly rescue remains. Removal and phase changes precede any subsequent effects. Termination is the last event.

Leap geometry is a fixed graph for a chosen origin. Every landing preserves both coordinate parities, so the moving counter cannot be a hurdle. A breadth-first search generates one representative per endpoint and removal choice. Validation accepts any legal simple path. Equivalent paths can retain different display and movement events while producing the same state.

The repetition key uses phase, side to move, deployment starter where relevant, reserves, owner/status occupancy, and movement memory expressed in coordinates. Removed totals are implied by board and reserves. The ledger counts visits to each live battle boundary, beginning with the first one. A removal discards visits from earlier material counts because those positions cannot recur. The ledger is independent of the equivalence key. Terminal positions reached by removal alone do not add a visit.

To replay, save the ruleset, initial options and ordered actions. Start with `createGame(options)` and reduce the log with `applyAction(state, action).state`. Snapshots check shape, rule version, conservation, unique IDs, custody, movement memory, repetition key format and outcome consistency. Snapshot validation cannot establish that the position and repetition counts came from a real game. Use an action log to establish that provenance.
