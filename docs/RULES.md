# Seneca rules

Ruleset identifier `locus-ludi-seneca-v1`. This ruleset follows the Locus Ludi Seneca reconstruction. [Rule decisions](RULE_DECISIONS.md) records the provisional and modern conventions.

## Deployment

Start with an empty 8 × 8 board and 20 identical counters in reserve per side. White starts by default. Alternate placing one counter on any empty square. After 40 placements, the original starting player takes the first battle turn. Deployment creates no prisoners, including at the transition to battle.

## Battle turns

At the start of the turn, remove exactly one enemy prisoner if any exist, at the current player's choice. Removal precedes movement. If removal ends the game, the turn ends there. A liberated counter is ineligible for removal.

Move one active counter. A step goes one square orthogonally to a vacant square. A leap crosses one friendly counter, including a friendly prisoner, and lands immediately beyond it on a vacant square. A turn can contain any positive number of successive leaps by the same counter, with changes of direction allowed. The starting square and every landing are visited at most once. Steps and leaps cannot be combined.

## Custody

The final destination of a move can establish new imprisonments. Two active counters of the moving side hold an enemy between them on an orthogonal line. At a corner, the two in-board orthogonal neighbors can instead form the pair. The board boundary supplies no captor. A prisoner occupies its square but cannot move or act as a captor.

New imprisonments are triggered by the moving counter or a newly liberated friendly counter participating in the holding pair. Resolve each batch simultaneously. After each batch, including an empty initial batch, find all prisoners without a valid pair and liberate them simultaneously. A prisoner with several pairs remains held as long as any pair survives. Continue processing newly liberated friendly captors until resolution stabilizes. Static geometry alone does not create custody, including when a counter voluntarily enters a square flanked by enemies.

## Repetition and outcome

For each side, forbid the same counter from moving A→B→A→B on three consecutive movement turns of that side. Moving a different counter or selecting a different destination breaks the pattern. Use a threefold draw for equivalent complete turn-boundary positions. Equivalence includes side to move, phase, reserves, counter ownership and status, and movement history relevant to legality. Internal identifiers alone do not make positions different.

Ordinary termination occurs when a player has one counter remaining or the turn player has no legal movement after accounting for mandatory removal. Compare the number of enemies each player actually removed. The greater score wins and equal scores draw. Threefold repetition draws regardless of score. Resolve the ordinary end conditions first if they coincide with a repetition check. The canonical rules have no move limit.

## Display notation

`@d4` places a counter. `d4-d5` is a step and `d4~d6~f6` is a chained leap. `[e6]` marks imprisonment, `+e6` marks liberation, and `xe6` marks removal. A complete turn can be written `xe6; b3-b4`. Results are `1-0`, `0-1`, and `½-½`.
