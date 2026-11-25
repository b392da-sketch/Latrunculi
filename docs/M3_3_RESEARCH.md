# M3.3 difficulty calibration

PR #5 was verified merged before work began. This milestone starts at `db4d60a`, including the reviewed GitHub Pages workflow. The engine, browser, save format, deployment workflow and M3.1/M3.2 research controls are unchanged. The six named presets are intended player-facing choices. The data supports separation at the lower end and additional search capacity at the upper end. It does not establish six different strength bands.

## Reproduce

Use Node 24 and run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. The experiments are outside fast CI.

```sh
mkdir -p /tmp/latr-m33
for group in lower upper target design additional; do
  NODE_OPTIONS=--expose-gc M33_GROUP="$group" M33_OUTPUT=/tmp/latr-m33 \
    npx vitest run --reporter=default tests/ai/difficulty-calibration.simulation.test.ts
done
NODE_OPTIONS=--expose-gc M33_OUTPUT=/tmp/latr-m33 \
  npx vitest run --reporter=default tests/ai/difficulty-exam.simulation.test.ts
```

The tournament files record seed, starting transcript, configuration, color assignment, every action, terminal result if present, material, dry stretches and usage per color. All 168 logged games replayed with matching canonical outcomes and material. The development seeds and held-out seeds differ. Browser timing is not part of deterministic strength calibration.

## Tactical examination

Nineteen positions include legal replays and explicitly synthetic fixtures. Seven development and ten held-out tactics count toward accuracy. Two additional development cases test mandatory removal choice and oscillation legality, and all levels passed both. The weaker samplers used 16 seeds per position. Deterministic levels used one run per position with preset nodes and no wall-clock limit.

| Level | Development | Held-out |
| --- | ---: | ---: |
| Tiro | 46 / 112 (41%) | 95 / 160 (59%) |
| Miles | 64 / 112 (57%) | 128 / 160 (80%) |
| Veteranus | 6 / 7 | 8 / 10 |
| Centurio | 7 / 7 | 10 / 10 |
| Legatus | 7 / 7 | 10 / 10 |
| Imperator | 6 / 7 | 10 / 10 |

Known-rule cases use exact checks such as a terminal win, avoiding a losing reply, or making a legal removal. Preferences to capture, free a specific prisoner, or seek a draw while behind are judgment calls. The quiet move and sacrifice cases grade all tied moves at the best exhaustive bounded evaluation. That score uses a heuristic at its frontier and is not a game-theoretic solution. Sources and predicates are in [the examination fixture](../tests/ai/difficulty-exam.ts).

Veteranus missed both held-out reply-aware cases. At seed 7 after action 58, its choice allows imprisonment. At seed 27 after action 346 its `c6-c5` capture is refuted. The quiet `e6-f6` scores 24 points better under exhaustive two-ply A2 evaluation. The three search levels passed both. Imperator missed the development criterion requiring immediate rescue in the M2 replay. Legatus played `c1~c3` to rescue, while Imperator played `c5~c7` and accepted the removal. A separate complete depth-four comparison scored those moves −133 and −124 respectively in the mover's perspective. That explains why the deeper evaluator preferred the non-rescue line. It does not establish that the sacrifice is objectively better.

### Weaker policies

| Trial selection | Development hits | Mean score below own best safe move | Mean distinct moves per position |
| --- | ---: | ---: | ---: |
| Tiro ranked | 46 / 112 | 24.4 | 6.00 |
| Tiro 30% gated uniform mix | 80 / 112 | 14.6 | 4.29 |
| Miles ranked | 64 / 112 | 8.5 | 2.57 |
| Miles best only | 96 / 112 | 0 | 1.00 |

The mixture used the best safe move 70% of the time, then sampled uniformly among examined safe moves. It was more accurate overall and won the sole completed matchup against ranked Tiro. Ranking was retained for a beginner profile with bounded errors and more variety near the best choices. Miles keeps a narrower shortlist. Best-only Miles won the sole completed design game, while ranked Miles led on removals in the five truncated games. The completed games and the material margins point in different directions. Noise and softmax were not adopted because rank sampling gave a direct bound on score loss without changing any score.

## Paired tournament results

The primary full-game trials include their 40 legal deployments in the 260-action cap. Each seed uses a shared opening and two games with opponents swapping colors, and each participant has its own deterministic random stream. Lower and midlevel trials use held-out seeds 101–106. Upper trials use 101–104, with self-play 101–102, because the upper batch alone took about three minutes on the cloud machine. Depth ceilings remain unchanged, but the longer tournaments use reduced node limits of 410, 960 and 2,100 for Centurio, Legatus and Imperator. Targeted trials use full node budgets. These separate runs avoid making the full-game sample depend on a host's clock.

The color column gives White wins, Black wins and draws. The reason column gives one-counter, immobilization and threefold endings. Truncations are never counted as draws. The removal margin at cap favors the second policy in the row. A dash indicates self-play or an empty group.

| Pair | Ended / capped | White / Black / draw | Reasons | Mean length all / ended | Median length all / ended | Truncated removal margin (range) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tiro-miles | 10 / 2 | 5 / 5 / 0 | 9 / 1 / 0 | 181.1 / 165.3 | 183.5 / 160.0 | +11.00 (+10 to +12) |
| miles-veteranus | 2 / 10 | 1 / 1 / 0 | 1 / 1 / 0 | 250.9 / 205.5 | 260.0 / 205.5 | +2.50 (-10 to +10) |
| veteranus-centurio | 2 / 10 | 0 / 1 / 1 | 0 / 1 / 1 | 238.3 / 130.0 | 260.0 / 130.0 | +3.60 (+2 to +8) |
| centurio-legatus | 4 / 4 | 0 / 0 / 4 | 0 / 0 / 4 | 208.8 / 157.5 | 227.5 / 157.5 | -0.75 (-6 to +3) |
| legatus-imperator | 4 / 4 | 0 / 0 / 4 | 0 / 0 / 4 | 209.1 / 158.2 | 227.5 / 159.0 | -1.00 (-4 to +6) |
| A0-tiro | 3 / 9 | 1 / 2 / 0 | 3 / 0 / 0 | 251.1 / 224.3 | 260.0 / 226.0 | +9.11 (+4 to +15) |
| A1-miles | 0 / 12 | 0 / 0 / 0 | 0 / 0 / 0 | 260.0 / — | 260.0 / — | -3.17 (-14 to +8) |
| A1-veteranus | 0 / 12 | 0 / 0 / 0 | 0 / 0 / 0 | 260.0 / — | 260.0 / — | +1.83 (-8 to +9) |
| A2-centurio | 2 / 10 | 0 / 1 / 1 | 0 / 1 / 1 | 238.3 / 130.0 | 260.0 / 130.0 | +3.60 (+2 to +8) |
| A2-legatus | 2 / 6 | 0 / 1 / 1 | 0 / 1 / 1 | 227.5 / 130.0 | 260.0 / 130.0 | +3.33 (+2 to +8) |
| A2-imperator | 2 / 6 | 0 / 1 / 1 | 0 / 1 / 1 | 227.1 / 128.5 | 260.0 / 128.5 | +3.17 (+2 to +8) |
| S1-legatus | 4 / 4 | 0 / 0 / 4 | 0 / 0 / 4 | 208.8 / 157.5 | 227.5 / 157.5 | -0.75 (-6 to +3) |
| imperator-imperator | 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 260.0 / — | 260.0 / — | — |

| Pair | Mean removals | Mean imprisonment / rescue | Longest dry mean / max | Mean nodes / ms per battle action | Mean depth | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tiro-miles | 22.7 | 24.0 / 1.2 | 38 / 109 | 36 / 1.73 | 1.00 | 149 |
| miles-veteranus | 17.9 | 19.1 / 1.1 | 92 / 154 | 38 / 1.28 | 1.00 | 235 |
| veteranus-centurio | 14.0 | 14.2 / 0.2 | 136 / 204 | 107 / 3.04 | 1.50 | 284 |
| centurio-legatus | 9.4 | 9.4 / 0.0 | 145 / 209 | 567 / 17.29 | 2.06 | 269 |
| legatus-imperator | 9.8 | 9.8 / 0.0 | 143 / 203 | 1530 / 38.84 | 2.23 | 275 |
| A0-tiro | 18.8 | 19.1 / 0.3 | 52 / 99 | 26 / 0.65 | 0.50 | 284 |
| A1-miles | 13.7 | 14.5 / 0.8 | 109 / 183 | 40 / 1.04 | 1.00 | 286 |
| A1-veteranus | 13.8 | 15.2 / 1.4 | 116 / 183 | 41 / 0.96 | 1.00 | 288 |
| A2-centurio | 14.0 | 14.2 / 0.2 | 136 / 204 | 107 / 3.04 | 1.50 | 291 |
| A2-legatus | 14.5 | 14.8 / 0.2 | 142 / 204 | 496 / 13.58 | 1.50 | 265 |
| A2-imperator | 14.9 | 15.2 / 0.4 | 131 / 204 | 1066 / 28.14 | 1.64 | 284 |
| S1-legatus | 9.4 | 9.4 / 0.0 | 145 / 209 | 568 / 15.68 | 2.06 | 281 |
| imperator-imperator | 11.0 | 11.0 / 0.0 | 202 / 203 | 2100 / 56.87 | 2.38 | 284 |

- Miles beat Tiro five times with each color. Veteranus beat Miles once with each color. Centurio beat Veteranus once as Black, with one draw. Legatus against Centurio and Imperator against Legatus each produced four draws and four truncations.
- Tiro won all three completed A0 games, with a positive removal margin in every truncation. Miles trailed A1 by 3.17 removals on average at the cap, with no completed games. A1 always chooses a best-scoring move and weights threats differently. The data leaves open how much of that gap comes from Miles's sampling versus its evaluator.
- The upper ordering is inconclusive. In Legatus–Imperator, Imperator trailed by one removal on average among truncated games, with a range spanning both sides. The four upper adjacent draws arose from seeds 103 and 104. Three of the four Legatus–Imperator draw sequences were byte-for-byte identical to the corresponding Centurio–Legatus sequences. Imperator completed more search depth on the full-budget fixture set. A deeper completed search and a better truncated material score each measure different things. The sample does not justify reversing the labels or claiming monotonic strength.
- Random versus M3.1 heuristic opening produced five draws and one truncation. Positional and bounded opening search each produced four draws and two truncations against random, all with identical A2 battle play. The material margins in those truncated games ranged from −5 to +6 for the newer alternatives. This leaves random deployment as the baseline choice. An all-pairs tournament was deferred in favor of these adjacent and control comparisons.

### Targeted continuations

Each row starts from an identical legal transcript and swaps which policy plays each color. Full preset node budgets were used for up to 16 new actions. The material row starts with White four removals ahead. Both policies therefore play one game from the side with the advantage and one from the side with the disadvantage.

| Start | Source | Paired policies | Completed / truncated |
| --- | --- | --- | ---: |
| Dense, 39 counters and one removal difference | Seed 7, action 58 | Centurio / Legatus | 0 / 2 |
| Material, 14 counters | Seed 2, action 630 | Legatus / Imperator | 0 / 2 |
| Custody, two eligible prisoners | M1 deployment and two moves | Centurio / Legatus | 0 / 2 |
| Sparse, 11 counters | Seed 2, action 850 | Legatus / Imperator | 2 / 0 |
| Long ledger, 1,081 keys | Quiet seed 19, action 1,120 | Centurio / Legatus | 0 / 2 |

Both sparse games ended in one-counter White wins, one for each policy. Thus they validate conversion of this particular material advantage. They do not distinguish the opponents. The long starts produced no removal in either continuation. Both sides in the custody and dense starts had advantages that changed sign when the colors changed. Individual traces remain available through the reproduction command.

## Interactive performance and resource trade-offs

Node 24.22.3 on an x86-64 AMD EPYC 7763 cloud host with a four-CPU quota. The fixture set includes two deployment starts and five battle starts per level. This is a small spot sample, with one measured decision per level per fixture and no claims about browser latency or slow devices. Deployments used zero search nodes and took under 1 ms each. In battle, preset latency targets are comfortably above the observed medians; no delay is added to fill a target.

| Level | Battle median / max | Completed depths | Nodes min–max | Largest sampled heap delta |
| --- | ---: | ---: | ---: | ---: |
| Tiro | 0.69 / 1.15 ms | 1 | 4–38 | 2.1 MiB |
| Miles | 0.68 / 1.25 ms | 1 | 4–38 | 2.1 MiB |
| Veteranus | 0.79 / 1.30 ms | 1 | 4–38 | 2.1 MiB |
| Centurio | 2.77 / 7.22 ms | 2 | 23–198 | 11.3 MiB |
| Legatus | 88.50 / 173.71 ms | 3–4 | 279–6,000 | 48.4 MiB |
| Imperator | 457.40 / 701.25 ms | 4–5 | 690–20,000 | 63.7 MiB |

Heap delta is sampled after the decision and before explicit GC. It is neither a peak nor total allocations. Largest retained delta after GC was 9 KiB in these battle observations. Process RSS peaked near 258 MiB for the benchmark including Node, Vitest and fixtures. In tournament tables it also includes accumulated match logs and can carry a prior trial's high-water mark. Time ceilings are checked between engine operations.

With identical Centurio actions and scores, median overlay versus canonical time was 6.26 versus 7.85 ms on the dense one-key start, 1.81 versus 1.38 ms in the three-key custody case, and 3.68 versus 101.61 ms at 2,461 keys. Short-history benefits were mixed, while the long-history gain was substantial. Cloning, validating and obtaining a no-search worker-protocol fallback on the long fixture took 7.79 ms median. Return after a cancellation poll took 0.054 ms in one observation. Actual cancellation also includes the time until that poll, and browser worker message and startup time were not measured.

## M3.4 integration recommendations

Use Centurio as the first play-test profile. Retain the current ceilings until measured in a browser worker on slower hardware, with particular attention to Imperator's memory. Validate the full canonical state before searching, present status separately from game commits, and terminate the worker on a stale request. Use no shared-memory requirement on Pages.

Treat Tiro and Miles as visibly different beginner profiles and the three upper choices as increasingly expensive presets. The current sample has a high truncation rate and little evidence of strength separation between Centurio, Legatus and Imperator. Prioritize larger paired endgame samples and browser latency measurements before making stronger claims. See [registry and request contract](AI_DIFFICULTIES.md).
