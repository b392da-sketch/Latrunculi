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
