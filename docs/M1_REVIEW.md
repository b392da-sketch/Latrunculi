# M1 review follow-up

## R01 · Terminal snapshots

A prisoner always has a holding pair of two distinct, active opposing counters orthogonally adjacent to it. Removing the prisoner vacates a square that either captor can step into, including when the prisoner was in a corner. The oscillation restriction can bar a return by at most one counter. The other step remains legal even when the remover still holds another prisoner, since the mandatory removal for this turn has already happened.

A real replay from the empty board reproduces the multi-prisoner case. Deploy White counters at c5, c2 and e4, and Black counters at c3, d4 and h8. Fill the remaining reserves while leaving c4 and h7 vacant. White plays c5-c4 to imprison c3 and d4, and Black plays h8-h7. Removing either prisoner leaves the other on the board, and the test applies each captor's step into the vacated square. Tests also round-trip one-counter termination in random seed 2 at action 891, immobilization at the end of a legal deployment, and threefold after scripted legal movement.

The engine now emits removal-only actions exclusively for one-counter endings, and the snapshot reader requires a recorded boundary for immobilization and threefold.

## R02 · Repetition

The tests replay a 16-action cycle and a 24-action cycle, switching legal leap routes on equivalent visits during the latter. Two deployments in different orders produce distinct IDs with equivalent custody, movement memory and action generation. A further replay imprisons and rescues a counter that was subject to oscillation, checks both custody and rescue in the ledger, removes a prisoner to reset the ledger, and reaches threefold using only the new visits.

## R03 · Gameplay diagnostic

Run `npm run diagnose`. Each pairing uses seeds 1–200 with the same random deployment per seed. Greedy play evaluates the immediate result of each representative battle action. It scores new imprisonment, liberation, material and visible one-step threats, with seeded tie-breaking. It uses the engine for custody and removal. The scoring preview omits repetition counts, while actual play uses the full ledger. The greedy player does not search opponent replies or use a strategic evaluation beyond these terms.

The external cap is 1,000 actions per game, including all 40 deployments. Length and removal statistics for all games include values observed at truncation. Terminal outcomes exclude truncated games.

| Pairing | Completed / truncated | Mean actions, all / completed | Max observed | Mean removals, all / completed | Mean removals by White / Black |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random–random | 42 (21%) / 158 | 954.78 / 784.67 | 1,000 | 27.95 / 27.48 | 14.05 / 13.90 |
| Greedy–random | 200 (100%) / 0 | 186.16 / 186.16 | 436 | 19.87 / 19.87 | 9.99 / 9.89 |
| Greedy–greedy | 3 (1.5%) / 197 | 997.32 / 821.00 | 1,000 | 18.14 / 22.33 | 9.48 / 8.66 |

| Pairing | White wins / Black wins / draws | One-counter / immobilization / threefold |
| --- | ---: | ---: |
| Random–random | 20 / 22 / 0 | 42 / 0 / 0 |
| Greedy–random | 100 / 100 / 0 | 196 / 4 / 0 |
| Greedy–greedy | 1 / 2 / 0 | 3 / 0 / 0 |

The greedy player won all 100 games as White and all 100 as Black against random play. The small number of completed games in the symmetric pairings limits any inference about first-player advantage. The mixed pairing shows that one opportunistic player can finish games quickly against a random opponent. The defensive heuristic made games even slower when both players used it, and both sides removed fewer counters on average. Random play alone cannot explain the long games observed here. The comparison does not establish typical game length for stronger play or isolate a particular rule as the cause.
