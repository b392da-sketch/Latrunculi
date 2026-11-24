# M3.1 research

## Reproduction

Use Node 24. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. The fast Vitest suite includes the AI assertions in CI. The performance test and tournaments run separately.

```sh
NODE_OPTIONS=--expose-gc npx vitest run --reporter=default tests/ai/performance.simulation.test.ts
mkdir -p /tmp/latr-ai
for pairing in random-legacy legacy-tactical tactical-tactical tactical-search search-search tactical-mobility deployment; do
  node scripts/ai-tournament.mjs "$pairing" "/tmp/latr-ai/$pairing.jsonl"
done
```

The tournament command accepts optional seed-count and cap arguments. Each seed produces two games with colors swapped and independent deterministic random streams for the two participants. Battle-policy comparisons reuse exactly the same legal random deployment for both games. The deployment-only comparison uses separate opening policies with identical battle evaluators. JSONL records the configuration and each complete action log, events summarized by frequency, outcome or truncation, material and cost. All 392 recorded logs were replayed independently and matched their recorded terminal status and material. Standard output gives the structured aggregate. Search used depth 2 and at most 512 successor states per action. The two search pairings used 20 games each to keep computation bounded. Their 15,589 search turns would scale to roughly 78,000 at 100 games with comparable lengths. The other three required pairings used 100 games each. The core comparison shares a 600-action simulation cap, including 40 deployments. The separate deployment pilot uses 400. Times vary with CPU contention and are excluded from reproducibility claims.

## Tournaments

Observed lengths include truncated games. Completed-only lengths exclude them. W/B/D counts canonical results only. The reason columns are one-counter, immobilization, and threefold.

| Pairing | Completed / truncated | White / Black / draw | Reasons | Observed mean / median | Completed mean / median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random–legacy | 100 / 0 | 50 / 50 / 0 | 99 / 1 / 0 | 200.7 / 189 | 200.7 / 189 |
| Legacy–tactical | 11 / 89 | 5 / 5 / 1 | 8 / 2 / 1 | 583.7 / 600 | 451.6 / 487 |
| Tactical–tactical | 39 / 61 | 26 / 13 / 0 | 38 / 1 / 0 | 529.1 / 600 | 418.3 / 419 |
| Tactical–search | 11 / 9 | 6 / 5 / 0 | 10 / 1 / 0 | 478.6 / 566.5 | 379.3 / 361 |
| Search–search | 0 / 20 | 0 / 0 / 0 | 0 / 0 / 0 | 600 / 600 | — |
| Tactical–mobility | 28 / 12 | 19 / 9 / 0 | 28 / 0 / 0 | 443.2 / 435 | 376.0 / 362.5 |
| Random–heuristic deployment | 1 / 11 | 1 / 0 / 0 | 0 / 1 / 0 | 387.6 / 400 | 251 / 251 |

Legacy won all 50 games as each color against random. Tactical beat legacy five times as each color, with one draw when Tactical played Black. Search beat Tactical six times as White and five as Black. Mobility-weighted Tactical won four as White and one as Black. Its opponent won 15 as White and eight as Black. The sole completed deployment trial was won by the heuristic opening as White. These color counts are conditional on completion.

The following means use all games. Dry intervals count consecutive battle turns without removal. Nodes, evaluations and machine milliseconds are per battle action across both participants.

| Pairing | Removals | Imprisonments / liberations | Dry mean / max | Nodes / evaluations / ms |
| --- | ---: | ---: | ---: | ---: |
| Random–legacy | 20.0 | 20.2 / 0.2 | 40.1 / 133 | 32.0 / 32.0 / 1.02 |
| Legacy–tactical | 22.7 | 24.0 / 1.3 | 161.7 / 312 | 34.3 / 34.3 / 1.09 |
| Tactical–tactical | 28.0 | 28.9 / 0.8 | 126.0 / 301 | 29.3 / 29.3 / 0.80 |
| Tactical–search | 23.4 | 24.1 / 0.7 | 145.8 / 434 | 100.1 / 77.1 / 3.17 |
| Search–search | 13.3 | 13.4 / 0.1 | 394.6 / 544 | 174.3 / 134.9 / 11.81 |
| Tactical–mobility | 29.5 | 30.7 / 1.2 | 116.0 / 461 | 28.4 / 28.4 / 0.92 |
| Random–heuristic deployment | 25.0 | 26.3 / 1.2 | 77.3 / 162 | 33.3 / 33.3 / 2.97 |

Tactical–search completed depth two on 4,372 of 4,389 search turns. Search–search completed it on 11,092 of 11,200. Truncated games are positional observations only.

| Pairing with truncations | Mean removals at cap | Mean removals credited to each policy at cap | Mean prisoners at cap |
| --- | ---: | --- | ---: |
| Legacy–tactical | 22.4 | Legacy 10.74 / Tactical 11.65 | <0.1 |
| Tactical–tactical | 28.5 | 14.26 per side | <0.1 |
| Tactical–search | 22.1 | Tactical 6.89 / Search 15.22 | 0 |
| Search–search | 13.3 | 6.67 per side | 0 |
| Tactical–mobility | 30.6 | Tactical 14.50 / Mobility 16.08 | 0 |
| Random–heuristic deployment | 25.5 | Random 12.55 / Heuristic 13.00 | 0 |

### Prolonged games

- **Deeper search did not consistently accelerate play.** Using the same first ten paired deployments, Tactical self-play finished 6/20 with mean length 542.4. Tactical–search finished 11/20 with mean length 478.6, while Search self-play finished 0/20 and averaged 13.3 removals versus 27.8 for the matched Tactical self-play subset. Search's longer dry intervals and rare closures are consistent with defensive equilibrium. The experiment does not identify a unique cause.
- **Threat exposure was usually avoided upstream.** The short-step/hop proxy flagged 270 of 11,200 Search self-play turns and 24 of those had no imprisonment. Tactical self-play flagged 3,241 of 48,914 and 497 had no imprisonment. The counts are turn-level approximations. They do not identify the specific threat converted, and they miss many chained threats.
- **Physical contact remained common.** Search self-play had no orthogonally adjacent opposition on 235 of 11,200 turns. Tactical self-play had no contact on 10,817 of 48,914. Search self-play rarely generated closure threats despite adjacency. Its 13.3 mean removals and zero turns with at most 12 counters show that sparse endgames cannot explain its delays.
- **Sparse positions mattered in some one-ply matchups.** There were 7,283 sparse battle turns in 34,160 truncated Tactical self-play turns, versus 640 in 14,754 completed turns. These pooled counts mix game length and late-game exposure. They do not prove sparse positions caused truncation.
- **The mobility experiment changed progress without demonstrating stronger play.** On matched seeds 1–20, baseline Tactical self-play finished 14/40 with 28.1 mean removals. The mixed mobility pairing finished 28/40 with 29.5 mean removals, but the variant won only five completed games. It led in average removed material among the truncated games. Keep these weights experimental.
- **Rescues occurred but were infrequent in these policies.** Search self-play averaged 0.1 liberation per game, compared with 0.8 for Tactical self-play and 1.3 for Legacy–tactical. This is observed event frequency, not a limit of the rules.
- **The deployment result is inconclusive.** Only 1/12 completed and the material margin at truncation was less than one removal. No opening advantage or Elo estimate follows from this sample.

## Tactical regression suite

Tests use engine replay for seeds and deployment transcripts. Compact board fixtures below are synthetic. They obey the local rules needed for each assertion, and no legal provenance is claimed for their full positions. Tests accept any move meeting the stated outcome unless a unique example is intentionally checked.

| Case and start | Acceptable outcome and reason | Depth and status |
| --- | --- | --- |
| Horizontal, double and corner custody, synthetic `tactical.test.ts` | Immediate imprisonment of d4, c3 and d4, or a1 respectively. | One ply; effect exact, preference heuristic. |
| Two prisoners, legal `multiplePrisoners()` deployment and two moves | Remove c3 or d4 exactly once and complete the turn. | One ply; legality exact. Also compared with exhaustive search at depth two. |
| Vacated prison square, synthetic c4/e4 hold d4 | Remove d4 and occupy it to imprison d5. | One ply; effect exact, preference heuristic. |
| Rescue, legal M2 rescue transcript | Imprison captor c4 and liberate d4. | One ply; verified event, heuristic choice. |
| Multi-stage cascade, synthetic c5/e4/d3*/b3/c2*/e2 formation | Imprison d4, c3 and d2 and liberate d3 and c2 in engine order. | One ply; exact event order, heuristic choice. |
| Refuted temptation, legal random seed 7 at action 58 | Avoid a6–a5 because c5–c6 and d6–c6 can imprison. Depth two selects a6~c6, with no immediate imprisoning reply. | Two ply, 12,000 nodes; reply set exact, root preference heuristic. |
| Turning chain, synthetic a2/b2/c3*/e4/a1 | Use a2~c2~c4 over a friendly prisoner to imprison d4. | One ply; effect exact, preference heuristic. |
| Delayed material, synthetic double-imprisonment fixture | Choose a line where every enemy reply permits a real removal next turn. | Three ply, 10,000 nodes; reply property exhausted. |
| Terminal removal, legal seed 2 action 890 | Remove the penultimate enemy to win immediately. | Two ply; exact forced end and distance score. |
| Avoid terminal loss, synthetic White a2/c1 vs Black d1/a5/b3/a1/h8 | Avoid a2–b2, the sole action allowing immediate loss on the next reply. | Two ply; checked for every root candidate and reply. |
| Material-scored immobilization, synthetic blocked 3×3 White cluster | Black avoids e3–d3 because it blocks White but White leads on removed material. | Two ply; exact terminal result. |
| Threefold, synthetic start followed by two applied cycle histories | Same key at plies 9 and 17, but a1–a2 draws only at ply 17. The losing side selects the draw. | One ply for preference, two ply against exhaustive score. Exact history rule. |
| Oscillation, synthetic two-counter teams followed by four applied actions | d4–d5 remains unavailable despite geometric reachability. | Two ply; mechanic exact. |

The remaining fast tests check both score perspectives, terminal handling, exact alpha-beta agreement with exhaustive minimax in four small trees (including deployment transition and multiple removals), the principal variation, interruption and deterministic node limits, legality and immutability in play, and seeded baseline and tournament reproduction.

## Search performance

Node 24, five timed repetitions after warmup at completed depth 2. Elapsed times are medians and are specific to the cloud workspace. The effective branching factor solves `b + b² = nodes` for all counted successor applications, including depth-one work. Heap deltas are sampled immediately after a separate call after explicit GC and are allocation observations, not peak or retained heap. Ordered and unordered scores agreed in all positions.

| Position | Root options | Nodes off → on | Median ms off → on | Eval/s on | Effective b on | Fallback ms on | Heap delta on KiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Early deployment | 62 | 367 → 2,321 | 1.47 → 6.84 | 330,311 | 47.68 | 0.005 | 14,435 |
| Late deployment | 25 | 628 → 109 | 19.15 → 3.92 | 21,446 | 9.95 | 0.004 | 7,307 |
| Early battle | 36 | 222 → 184 | 7.47 → 6.66 | 22,218 | 13.07 | 0.023 | 11,392 |
| Multiple prisoners | 11 | 137 → 57 | 4.42 → 1.89 | 24,386 | 7.07 | 0.026 | 3,811 |
| Late battle | 30 | 117 → 99 | 2.68 → 2.36 | 29,269 | 9.46 | 0.011 | 3,280 |
| Sparse, synthetic | 6 | 21 → 21 | 0.34 → 0.36 | 41,254 | 4.11 | 0.005 | 381 |
| Quiet, 2,461 ledger keys | 29 | 116 → 116 | 98.43 → 102.84 | 846 | 10.28 | 0.027 | 7,679 |

Returning after the callback observed cancellation took 0.005–0.011 ms in these runs. That sample excludes the preceding engine operation and is separate from end-to-end worker cancellation latency. In early battle the approximate feature pass took 0.103 ms, the geometric and legal mobility probe took 0.196 ms, and enumerating all exact one-turn events took 0.49 ms. In the long-ledger position they took 0.014, 0.100 and 24.44 ms. Exact custody features from every legal successor and exact terminal ordering were therefore deferred. Early placement ordering increased the node count sharply, while late placement ordering helped. The default deployment policy does not search, and experiments can disable ordering.

## M3.2 research priorities

1. Sample and inspect long dry sequences in Search self-play. Compare whether a small, configurable preference for maintaining tactical options increases removals without sacrificing material.
2. Evaluate search around forced removal, rescue and chained threats with matched starts and time budgets. Add more exhaustive small-tree references before introducing selective depth extensions.
3. Profile repetition-ledger transitions independently of evaluation. Any future cache must include enough history to preserve exact threefold outcomes, and cached positions should be checked against uncached search.
4. Run larger held-out pairs for opening and mobility experiments and measure terminal results separately from truncated material. The current data cannot establish difficulty levels or ratings.
