# M3.2 strategic intelligence and search research

This milestone starts from the reviewed M3.1 commit `e8ef6e86`. The published M3.1 controls, browser app, canonical rules and save formats remain the references. The experimental evaluator has no demonstrated advantage over S1 and remains opt-in.

## Reproduction

Use Node 24 and run `npm ci` and `npm run build`. All focused tests run with `npm test`. Run experiments separately.

```sh
NODE_OPTIONS=--expose-gc npx vitest run --reporter=default tests/ai/ledger-profile.simulation.test.ts
NODE_OPTIONS=--expose-gc npx vitest run --reporter=default tests/ai/m32-performance.simulation.test.ts
mkdir -p /tmp/latr-strategy
for mode in overlay strategic extended self tactical; do
  node --expose-gc scripts/ai-strategy-tournament.mjs "$mode" "/tmp/latr-strategy/$mode.jsonl" 101 6 300
done
node --expose-gc scripts/ai-strategy-tournament.mjs node-budget /tmp/latr-strategy/nodes.jsonl 101 4 300
node --expose-gc scripts/ai-strategy-tournament.mjs time-budget /tmp/latr-strategy/time.jsonl 101 4 220
for feature in initiative formation; do
  for weight in 0 1 3 6; do
    node --expose-gc scripts/ai-strategy-tournament.mjs ablation "/tmp/latr-strategy/$feature-$weight.jsonl" 1 3 260 "$feature" "$weight"
  done
done
for mode in opening-legacy opening-positional opening-search; do
  node --expose-gc scripts/ai-strategy-tournament.mjs "$mode" "/tmp/latr-strategy/$mode.jsonl" 101 3 240
done
node --expose-gc scripts/ai-strategy-tournament.mjs strategic /tmp/latr-strategy/strategic-long.jsonl 101 2 1000
node --expose-gc scripts/ai-strategy-tournament.mjs dry /tmp/latr-strategy/s1-long.jsonl 3 1 1000
node scripts/ai-tournament.mjs search-search /tmp/latr-strategy/m31.jsonl
node scripts/ai-dry-study.mjs /tmp/latr-strategy/m31.jsonl --search
```

The existing tournament harness supplies logs and aggregate JSON. All 148 logged games replayed independently with matching canonical results and material. Seeds 1–3 are tuning seeds and 101–106 are held out for the combined preset. A seed supplies two color-swapped games. Every battle comparison shares the same random deployment for the pair. Opening trials use identical A2 battle play and compare only opening policy. The same-depth and extension runs have depth two and 512 successor applications per decision. The equal-node pilot allows depth four with the same 512-node ceiling. The equal-time pilot allows depth three, at most 1,024 successors and a requested 8 ms, with measured wall-clock variability. It is observational and does not reproduce exact actions. Other trials have deterministic budgets. The small batches and external caps bound computational cost. More terminal evidence would require larger caps or more varied starts.

## Ledger profiling and canonical equivalence

The profile preceded the engine change. The quiet fixture uses seed 19, legal deployment, and engine-generated moves confined to opposite halves, letting it accumulate 10,000 keys with canonical repetition enabled. The table reports microseconds per operation. Stages are isolated and overlap, so their timings do not sum to the full transition. In particular, the isolated 1,000-key copy benchmark can reuse a V8 object shape that full transitions do not share.

| Keys | Full apply | Legal actions | Board copy | Ledger copy | Key | Outcome | Features | Custody | Heap delta for 64 held transitions (KiB) | Explicit GC (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 20.92 | 33.95 | 0.27 | 1.97 | 6.66 | 10.38 | 38.47 | 0.71 | 1,480 | 4.12 |
| 1,000 | 227.91 | 16.90 | 0.05 | 4.09 | 3.98 | 4.72 | 8.11 | 0.66 | 20,244 | 4.96 |
| 2,500 | 860.47 | 19.86 | 0.07 | 767.01 | 2.74 | 4.28 | 7.84 | 0.92 | 20,474 | 10.79 |
| 5,000 | 2,004.09 | 18.03 | 0.07 | 1,987.24 | 3.53 | 4.75 | 8.61 | 0.53 | 38,747 | 10.91 |
| 10,000 | 4,882.28 | 15.97 | 0.06 | 4,746.08 | 3.73 | 7.68 | 9.95 | 0.56 | 71,677 | 18.20 |

The main cost was copying visits at each search successor. The engine retained one transition implementation and an internal hook for recording a visit. The search-only overlay adds one immutable layer per ply, shares earlier counts and inherits the engine's reset on removal. This avoids reversible mutations and the risk of incomplete rollback. Incremental hashing and a transposition table offer no evidence of value before keying the full relevant ledger. They were deferred. The existing replay and browser use public canonical transitions and plain ledgers.

Golden digests from the unmodified M3.1 build cover 1,181 consecutive seeded actions, exact snapshots, ordered events, legal action sets and sampled deterministic decisions for A0, A1, A2 and S1. At every step the materialized overlay has the same serialized bytes. Dedicated cases cover divergent threefold ledgers, branching, multiple removals, cascades, oscillator context and terminal removal. Cancellation and a throwing callback leave the original state reusable. The M2 save, import, undo and redo tests still exercise the public engine path.

## Search performance

The following single-process comparisons use identical nodes and scores for canonical and overlay. The effective branching factor includes iterative-deepening work. Depth four completed in the sparse fixture. The multiple-prisoner depth-four attempt reached 1,200 nodes after completing depth three. Heap deltas are observed immediately after a decision with a pre-run GC. They are neither peak heap nor total allocations. The post-GC retained results were near the measurement noise floor. Timings are specific to the cloud machine.

| Position | Root options | Completed / requested | Nodes | Canonical → overlay ms | Overlay successors/s / evals/s | Effective b | Heap delta KiB before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| early-deployment | 62 | 2 / 2 | 2,321 | 17.59 → 9.71 | 239,060 / 232,674 | 47.68 | 20,174 → 16,100 |
| late-deployment | 25 | 2 / 2 | 109 | 8.87 → 7.45 | 14,631 / 11,275 | 9.95 | 8,576 → 8,276 |
| early-battle | 36 | 2 / 2 | 184 | 11.68 → 10.14 | 18,153 / 14,602 | 13.07 | 13,317 → 13,031 |
| midgame | 11 | 1 / 1 | 11 | 0.69 → 0.71 | 15,449 / 15,449 | 11.00 | 787 → 799 |
| midgame | 11 | 2 / 2 | 57 | 2.63 → 2.93 | 19,464 / 15,708 | 7.07 | 3,453 → 3,515 |
| midgame | 11 | 3 / 3 | 343 | 11.96 → 12.96 | 26,474 / 20,299 | 6.64 | 20,873 → 21,245 |
| midgame | 11 | 3 / 4 | 1,200 | 35.09 → 36.65 | 32,739 / 28,947 | 10.27 | 4,899 → 5,597 |
| sparse | 4 | 1 / 1 | 4 | 0.53 → 0.32 | 12,590 / 12,590 | 4.00 | 107 → 114 |
| sparse | 4 | 2 / 2 | 23 | 1.84 → 1.78 | 12,910 / 10,665 | 4.32 | 585 → 544 |
| sparse | 4 | 3 / 3 | 66 | 1.75 → 2.13 | 30,935 / 20,623 | 3.66 | 1,417 → 1,444 |
| sparse | 4 | 4 / 4 | 279 | 5.90 → 7.37 | 37,852 / 29,034 | 3.79 | 5,623 → 5,975 |
| ledger-100 | 31 | 2 / 2 | 119 | 6.08 → 4.95 | 24,021 / 17,763 | 10.42 | 9,624 → 7,785 |
| ledger-1000 | 38 | 2 / 2 | 148 | 58.17 → 5.51 | 26,853 / 19,958 | 11.68 | 15,875 → 9,152 |
| ledger-2500 | 35 | 2 / 2 | 134 | 108.73 → 4.59 | 29,183 / 21,560 | 11.09 | 45,887 → 7,838 |
| ledger-5000 | 33 | 2 / 2 | 132 | 253.10 → 4.74 | 27,832 / 20,874 | 11.00 | 80,844 → 7,836 |
| ledger-10000 | 25 | 2 / 2 | 105 | 437.16 → 4.50 | 23,322 / 17,769 | 9.76 | 36,240 → 6,355 |

First usable fallback generation took 0.016–0.118 ms. Return after the cancellation callback observed cancellation took 0.028–0.248 ms. This excludes an in-progress engine call and worker messaging. Strategic feature passes took 0.027–0.103 ms per observed position. Ablations of one nonzero weight still pay the shared geometry cost.

**Ordering.** Equivalent depth-two scores were obtained with legacy, unordered and phase-aware traversal. In early deployment, phase-aware traversal took 367 nodes instead of 2,321. Both root traversals led with optimal `@b1`, so the root principal variation was not the culprit. Against `@b2`, the natural order found a refuting reply by its third candidate, while legacy vacant-neighbor priority found one at candidate 36. At late deployment, legacy retained its 109-to-628 node advantage over unordered traversal. The phase-aware threshold avoids the measured early failure and retains prior principal variation in battle and late deployment. The fixed eight-placement threshold is still a heuristic.

**Aspiration and extensions.** A ±12 window increased the early-battle count from 184 to 264 and the multiple-prisoner count from 57 to 83 at the same depth. Full-window recovery preserved the values. This pilot offers no basis for a default window. An extension raised the multiple-prisoner count from 57 to 359 at nominal depth two, and early battle exhausted 1,200 nodes after nominal depth one. The exhaustive regression checks this precise frontier rule independently. More explored tactical replies do not imply superior moves under a fixed budget. History and killer ordering were considered, but a more systematic sample is needed to justify them beyond the directly measured phase rule and principal-variation ordering.

## Tournaments

Canonical results are separate from truncations. Completed outcomes in this sample all came in one pairing, and were all immobilizations. Mean/median observed lengths include deployment. The completed lengths for A2 versus strategic were 214.7/224. No completed-game lengths apply to the other rows.

| Trial | Completed / truncated | White / Black / draws | Observed mean / median | Mean removals | Imprisonments / rescues | Mean / max dry | Nodes / ms per battle action | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overlay | 0 / 12 | 0 / 0 / 0 | 300.0 / 300 | 8.75 | 8.83 / 0.08 | 217.6 / 251 | 187 / 7.12 | 296 |
| strategic | 0 / 12 | 0 / 0 / 0 | 300.0 / 300 | 9.83 | 9.83 / 0.00 | 199.4 / 249 | 230 / 15.47 | 266 |
| node-budget | 0 / 8 | 0 / 0 / 0 | 300.0 / 300 | 9.88 | 9.88 / 0.00 | 195.9 / 249 | 512 / 28.52 | 259 |
| time-budget | 0 / 8 | 0 / 0 / 0 | 220.0 / 220 | 15.00 | 15.25 / 0.12 | 79.9 / 113 | 187 / 8.39 | 253 |
| extended | 0 / 12 | 0 / 0 / 0 | 300.0 / 300 | 10.42 | 10.67 / 0.25 | 187.8 / 251 | 194 / 5.83 | 265 |
| self | 0 / 12 | 0 / 0 / 0 | 300.0 / 300 | 9.92 | 9.92 / 0.00 | 211.1 / 249 | 259 / 22.99 | 257 |
| tactical | 3 / 9 | 2 / 1 / 0 | 278.7 / 300 | 15.58 | 16.00 / 0.42 | 103.3 / 239 | 143 / 11.84 | 257 |
| extended-dry | 0 / 2 | 0 / 0 / 0 | 1000.0 / 1000 | 15.50 | 16.00 / 0.50 | 692.5 / 695 | 179 / 5.40 | 265 |
| strategic-long | 0 / 4 | 0 / 0 / 0 | 1000.0 / 1000 | 12.00 | 12.00 / 0.00 | 667.2 / 949 | 179 / 10.12 | 257 |

RSS includes the runtime and accumulated action logs. Tournament timings include process contention. Search completed at least depth two on 3,091/3,120 turns in the overlay trial, 2,923/3,120 in the fixed-depth strategic trial, 1,960/2,080 in the equal-node pilot and 631/1,440 in the equal-time pilot. The signed removal margins below are for the variant over its opponent at truncation, averaged across colors.

- Strategic beat A2 twice as White and once as Black, with nine truncations. Its average removal margin in the truncated games was +4.67, ranging from +2 to +8.
- Against S1, strategic had no completed outcomes in the equal-depth, equal-node or equal-time pilots. Truncated margins were −0.17 (range −3 to +3), −0.38 (−2 to +2), and −2.75 (−12 to +5), respectively. This does not establish a strength gain.
- The extension trial had no completions, with a truncated margin of +0.25 and a −5 to +5 range. Strategic–S1 seeds 101 and 102 were continued with both colors to action 1,000. The four games reproduced their first 300 moves and all truncated again. Strategic's removal margin was then +1.00 (−1 to +3).
- In the fixed-depth strategic matchup, the threat proxy flagged 122 turns and 11 produced no imprisonment. In the overlay control it flagged 118 turns and 15 produced none. A turn count cannot identify which specific threatened prisoner was taken.

### Feature ablation and opening comparisons

The six-game batches used seeds 1–3 for each weight and capped at 260. Every game truncated. The signed margin favors the configured variant and ranges describe variation across the six matches.

| Feature | Weight | Mean removals | Variant removal margin and range | Mean longest dry interval |
| --- | ---: | ---: | ---: | ---: |
| Initiative | 0 | 11.83 | +0.83 (−1 to +3) | 179.0 |
| Initiative | 1 | 11.50 | +1.17 (−1 to +3) | 179.5 |
| Initiative | 3 | 10.67 | +1.00 (−2 to +3) | 198.0 |
| Initiative | 6 | 11.33 | +1.33 (−2 to +6) | 196.5 |
| Formation | 0 | 11.83 | +0.83 (−1 to +3) | 179.0 |
| Formation | 1 | 13.17 | −0.83 (−4 to 0) | 136.7 |
| Formation | 3 | 14.50 | −0.50 (−5 to +3) | 122.0 |
| Formation | 6 | 13.83 | −2.50 (−6 to 0) | 134.3 |

The zero-weight rows share a baseline. Formation encouraged more removals in these matches but did not demonstrate favorable conversion. Initiative did not shorten dry sequences here. Pressure, preparation, closure diversity, escape and confinement were tested as part of the held-out preset and in feature fixtures, with individual weight sweeps still pending. Repetition risk was tested for terminal-score compatibility and stayed at zero for tournaments.

The isolated opening comparisons each played six games to cap 240 with A2 on both sides for battle. All truncated. Average variant removal margins were +1.83 for the M3.1 heuristic versus random, −4.50 for positional versus M3.1 heuristic, and −1.83 for opening search versus positional. Variation reached −9 to +7 across these pilots. This does not establish an advantage for concentrated deployment, distributed deployment, or shallow opening search.

## Dry sequences, sacrifice and endgames

The three longest M3.1 dry slices below came from the original search self-play logs. All had zero short-range threats at the midpoint, even though opposing counters were in orthogonal contact. The table uses counters present, geometric origin/destination pairs, and immediate own-move reversals counted within the dry interval.

| Seed / swap | Actions in dry slice | Counters at midpoint | Midpoint options White / Black | Distinct routes / immediate reversals | Tied best static choices |
| --- | --- | ---: | ---: | ---: | ---: |
| 3 / no | 56–600 | 28 | 40 / 41 | 341 / 15 | 36 of 40 |
| 7 / no | 56–600 | 29 | 37 / 54 | 320 / 11 | 33 of 37 |
| 10 / yes | 60–600 | 31 | 31 / 37 | 297 / 9 | 23 of 31 |

The seed 3 excerpt was `e4-e3, b7-c7, d1-e1, c7-d7, h3-g3, c6-c7, e1-f1`. Seed 7 includes a turning leap `a8~c8~c6` amid quiet steps. These positions fall into an equal-material dense group and two groups with a one-counter margin. Many moves preserved the static material score, but the routes were varied and few were immediate reversals. This evidence is consistent with defensive equilibrium and flat evaluation. It cannot establish its cause. Depth four completed at all three midpoints and selected the same move and score as depth two. The strategic evaluator broke those ties and chose different moves, but its live trial gave no evidence they converted. The two seed 3 S1 games reproduced their original first 600 actions and both reached action 1,000. Their longest dry intervals ranged from 690 to 695.

A legal tactical sacrifice example comes from random seed 13 after action 43. A2 plays `c4-c3` and frees the prisoner on d2. At depth three the search instead plays `a1~a3`. Its principal variation accepts `xd2; g1-g2` and then returns `xa4; c4-c3`, exchanging one actual removal and imprisoning two White counters. The test compares the full bounded replies of both alternatives and verifies that accepting the removal has the better depth-three score. This is a bounded advantage, with no claim of a forced game win.

Sparse synthetic fixtures exercise two counters against five, edge and corner pressure, conversion of a three-versus-two penultimate removal, and an immobilization that would award the win to the blocked side because it leads on material. The benchmark completed depth four in the escape fixture. The experimental confinement bonus is available only to the material leader with at most 12 counters on board. It cannot override a terminal value. None of these tests solves an endgame class and the dry examples were far from sparse.

## Recommendation for M3.3

Use the tested overlay with S1 evaluation as the first worker candidate, and benchmark short histories before making it universal. Phase-aware ordering is worth a larger opening sample. Leave tactical extensions, aspiration windows and all strategic weights optional. Use deterministic node limits for reproducibility and check interruption between engine calls when adding worker integration. Keep investigating deeper forcing lines and escape safety in held-out dense dry positions, and run targeted sparse positions under longer caps. The current experiments support a substantial speedup in long histories and no conclusion about stronger overall play.
