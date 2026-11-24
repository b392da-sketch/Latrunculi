# LATRVNCVLI

LATRVNCVLI implements the Locus Ludi Seneca reconstruction of Ludus Latrunculorum, an ancient strategy board game. M0/M1 provides the historical specification and a headless TypeScript engine. The engine covers deployment, battle movement, capture and rescue, removal, repetition and scoring.

- [Rules](docs/RULES.md) and [provisional decisions](docs/RULE_DECISIONS.md)
- [Historical sources](docs/HISTORICAL_SOURCES.md)
- [Engine API and architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md) and [contributing](CONTRIBUTING.md)

Use Node.js 24.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run simulate
```

The separate simulation command runs 2,000 games with deterministic seeds 1–2,000. It chooses uniformly from the engine's representative legal actions and stops a simulation at 1,000 actions, including deployment. Its report counts truncated runs separately from canonical outcomes. The cap applies only to this validation run.
