# M3.1 AI architecture

`src/ai/index.ts` exports `chooseAction(state, config)` for headless use. Call it with a canonical `GameState` and an optional policy, deployment strategy, seed, depth, limits and feature weights. It returns one representative complete engine action or `null` for a terminal game, together with diagnostics. The AI leaves the input state intact. All candidate generation and transitions use the engine. Removal, movement, and any custody cascade are part of a single search ply.

| Policy | Behavior |
| --- | --- |
| `random` (A0) | Uniform over engine actions. Counters, destinations, and removal choices can have different marginal probabilities. |
| `legacy` (A1) | A one-turn reproduction of the M1 evaluator. Weights are 20 per net removal, +10 per enemy prisoner, −12 per friendly prisoner, and −2 per threatened active friendly counter. It counts one-step closures. Ties use the seeded generator by default. |
| `tactical` (A2) | A one-turn evaluator with discounted custody, removal due, rescue, and tactical pressure. |
| `search` | Iterative-deepening alpha-beta minimax using the tactical evaluator. |

A1 recreates the M1 diagnostic's treatment of hypothetical threefold outcomes. It values a child that actually ended by threefold according to the historical static score. The engine still returns the canonical draw, and A2 and search score it as zero. Tests compare A1's scores with the historical preview on a repeat-sensitive fixture.

## Search and limits

Search evaluates from the root player's perspective. Each node maximizes or minimizes according to the actual engine turn, including at the deployment-to-battle boundary. Feature weights are bounded to ±1,000,000 and the resulting nonterminal score is confined to ±500,000. Terminal wins score 1,000,000 minus elapsed plies. Terminal losses use the negative counterpart and draws score zero. This prefers faster wins and delays forced losses. Material-scored immobilization uses the engine winner.

Depth defaults to 2 and can range from 1 to 64. `nodeBudget` counts successor applications across all iterations and defaults to 5,000. The root always produces legal actions before any search budget is consumed. On interruption, search returns the best completed iteration, or a legal root fallback before depth one completes. One-turn policies may use the best examined action if interrupted. A0 makes no successor applications. Diagnostics include branching, nodes, evaluations, cutoffs, completed depth, score, principal variation, stop reason and elapsed and first-usable times.

Ordering gives the previous principal variation priority, then uses cheap hints for terminal removal, material removal, likely imprisonments, possible rescues and available neighbors in deployment. These are traversal hints and never remove candidates. Exact ordering by all child outcomes would require applying the candidates before pruning. The benchmark measures that cost separately. Equivalent leap routes are already represented once by the engine per origin, destination and removal choice. Search deliberately uses no transposition table. A board key can match even when the full state holds a different repetition ledger and the same successor ends only one of the games by threefold.

The Mulberry32 seed or a caller-owned generator controls random choices. Search uses stable traversal order by default. `tieBreak: 'seeded'` shuffles the root once and retains traversal-based tie resolution. One-turn policies can also use seeded ties. Fix the seed and node budget and omit time or external interruption for deterministic actions, scores and node counts. Timings are observational.

Optional `timeBudgetMs`, `now`, and `shouldStop` are checked between successor applications. An ongoing engine call or root action generation finishes before the check. The module has no React, DOM, storage, networking or worker dependency. A future worker can receive structured-cloneable states and serializable config, run with a deadline, and poll an external cancellation flag. A regular message cannot interrupt synchronous search until the worker yields. The caller can terminate a worker or supply a shared cancellation flag when the host supports it.

## Evaluation features

Raw counts are returned per side by `extractFeatures`. A positive weight rewards a lead in an offensive feature or a reduction in own prisoners, exposed captors, isolation or exposed edges.

| Family | Features and default tactical weights |
| --- | --- |
| Material | Real enemy removals **100**, own prisoner liability **24**, and one due removal **46** for the side currently required to remove a prisoner. Active balance is observable at weight 0 because it is closely coupled to custody and removals. |
| Custody | Additional holding pairs **4**, opportunity to rescue **7**, and exposed captors **3**. Rescue counts prisoners whose every current holding pair has an exposed member. It does not prove that one turn can break all pairs. |
| Tactical exposure | One-step or one-hop closures **9** per threatened enemy, and closure squares targeting multiple victims **5**. The approximation preserves the stationary mate but omits oscillation, mandatory removal and later hops. Search resolves actual captures, rescues and chains through the engine. |
| Mobility and shape | Movable counters and distinct one-step or one-hop origin/destination opportunities, friendly adjacency, local superiority among immediate neighbors, capped cohesion, isolation, direct leap access, exposed edges, center distance and contact. All have tactical weight 0 by default. |

`probeMobility` measures geometric chained reachability using engine movement geometry and separately measures actual legal origins, destinations and origin/destination pairs for the current side in battle. It includes average options per active counter and restricted counters. It also reports candidate chained closure threats where a representative long path reaches the gap while the stationary mate remains in place. Neither geometric measure predicts event cascades. The experimental mobility variant adds movable **3** and geometric options **1**.

Deployment defaults to random for comparable battle experiments. The optional heuristic rewards movable counters **3**, geometric options **1**, support **1**, reduced isolation **1**, and direct leap access **1**. Its opening evaluation favors prospective movement and can expose poor local distributions. Contact, concentration-related cohesion and centrality are observable hooks with zero weight. `deployment: 'search'` applies the same bounded whole-action search, and switched positions use the evaluator for their actual phase. Static deployment sandwiches never earn capture credit. This remains an exploratory policy.

## M3.2 optional search controls

The A0, A1, A2 and S1 objects in `referencePolicies` are frozen M3.1 defaults. No new option is active by default. An old decision made with a fixed seed, node budget and clock produces the same action, value, principal variation and counts.

- `transition: 'overlay'` applies the same validated engine transition and replaces only the ledger copy with a search-local immutable layer holding one visit. Lookup inherits previous counts. A material removal uses the empty base supplied by the canonical transition. Branches share parents and never modify them. The engine's public application, snapshot, save and UI paths still use plain canonical ledgers. The differential tests materialize overlays to prove exact serialization and ordered events against the canonical oracle.
- `orderingStyle: 'phase'` follows unordered traversal in deployment while more than eight placements remain, then uses M3.1 ordering with the prior principal variation. The threshold is experimental. Set `ordering: false` for a fully unordered reference.
- `aspirationWindow` bounds a later iteration around the last completed score. Either boundary triggers a full-window re-search. All failed-window nodes count toward the budget. An interrupted re-search returns the previous complete iteration.
- `tacticalExtensions` adds up to four extra plies per line at the nominal frontier. A live battle frontier is unstable if the side to move has mandatory removal, or the incoming action liberated a counter or imprisoned two or more. The extension searches all legal complete replies, including all removal choices. It uses no stand-pat bound or speculative pruning. The selective horizon is exact relative to this bounded rule and approximate relative to deeper fixed-depth search. Geometric double threats alone do not trigger it, as the approximation cannot prove they survive replies.

The overlay's lifetime is bounded by the search stack and depth plus extensions. No reversible make/unmake step, transposition table, or incremental hash is used. A full repetition-ledger cache key would be costly and sparse in these trees. A position-only table would be incorrect. Transposition tables, history and killer heuristics remain deferred. See the measured costs and ablations in [M3.2 research](M3_2_RESEARCH.md), and feature definitions in [AI features](AI_FEATURES.md).

## M3.3 preset and protocol layer

The immutable difficulty registry supplies budgets, evaluation weights and optional rank sampling to the shared search. Sampling happens only after evaluating actual engine successors. No policy changes legality, custody or terminal scoring. Existing control configurations opt into none of these additions.

`handleAiRequest` exposes a serializable input and output contract. It validates a full canonical snapshot and calls the configured search with only supported resource overrides. The browser runs it in `src/web/ai.worker.ts`. The controller in `src/web/computer-turn.ts` and `src/web/use-computer-turn.ts` owns request identity, cancellation, and scheduling. A successful request still goes through the match's canonical action commit. See [AI difficulties](AI_DIFFICULTIES.md), [M3.3 calibration](M3_3_RESEARCH.md), and [M3.4 browser integration](M3_4_INTEGRATION.md).
