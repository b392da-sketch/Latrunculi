# Provisional rule decisions

The [Seneca publication and diagrams](https://locusludi.ch/wp-content/uploads/2022/08/LUDUS-LATRUNCULORUM_rules_GB.pdf), pp. 1–3, support the core rules. These decisions come from the project brief. They define details left open by the publication or add conventions for digital play. They remain provisional pending independent review.

| Topic | Implemented behavior | Rationale |
| --- | --- | --- |
| Deployment transition | Start battle with all deployed counters active. | Require a battle action to establish custody. |
| Friendly prisoners as hurdles | A leap may cross a friendly prisoner. | Count the prisoner as a physical counter while restricting its own actions. |
| Leap sequence | Allow turns and optional stops, with no revisiting the origin or another landing. | Specify finite paths and the set of legal actions. |
| Capture timing | Evaluate custody at the final landing. | Resolve one movement effect for the complete turn. |
| Custody triggers | Require participation by the moving counter or a newly liberated friendly counter. | Preserve action-triggered custody and allow a counter to enter a flanked square. |
| Overlapping custody | Retain custody while any valid pair survives. | Recognize every pair that can actively maintain custody. |
| Cascades | Apply new imprisonments in simultaneous batches and recheck liberation after each batch. | Make resolution deterministic without relying on board iteration order. |
| Mandatory removal | The player chooses one prisoner and then moves, unless removal ends the game. | Preserve a meaningful choice and allow other prisoners to be rescued later. |
| Oscillation | Forbid A→B→A→B by the same counter across three consecutive movement turns of its player. | Give the back-and-forth prohibition a reproducible boundary. |
| Threefold repetition | Draw on a third equivalent complete turn-boundary position. | Supply a modern safeguard for longer cycles. |
| Notation | Use the display conventions in [the rules draft](RULES.md). | Keep action data independent of display formatting. |
| First turn | Default to White and give the deployment starter the first battle turn. | The source describes screen colors but leaves turn order unspecified. |
| Equal scores | Draw when the ordinary end conditions are met and removal totals tie. | The publication awards victory to the higher total and leaves ties open. |
| Precedence | Resolve one-counter and no-move outcomes before checking threefold at a boundary. | Preserve the publication's ordinary end conditions when they apply. |

The Seneca text permits successive leaps and immediate assistance from a freed counter. It leaves the landing path, restraint on revisiting squares, and ordering of multiple custody changes unspecified. The implementation checks holding pairs against a shared post-imprisonment position and applies those liberations simultaneously. Only friendly liberated counters initiate further imprisonments during the current action. The brief settles these choices without a material conflict with the Seneca diagrams.

The PDF describes removal on the captor's next turn while the holding counters are still free. Where two separate pairs hold the same prisoner, the implementation allows any surviving pair to maintain custody. Ordinary final scores count removed pieces only.
