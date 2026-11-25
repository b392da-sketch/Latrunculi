# LATRVNCVLI

LATRVNCVLI implements the Locus Ludi Seneca reconstruction of Ludus Latrunculorum, an ancient strategy board game. Play locally with two people sharing a device, or select **Play the computer** and choose one of six opponents. Centurio is selected initially. Choose White, Black, or a random side. White places first. **Continue saved game** reopens the last match you saved, including its opponent and move history.

- [Rules](docs/RULES.md) and [provisional decisions](docs/RULE_DECISIONS.md)
- [Historical sources](docs/HISTORICAL_SOURCES.md)
- [Engine API and architecture](docs/ARCHITECTURE.md)
- [Frontend architecture, persistence, and screenshots](docs/FRONTEND.md)
- [Headless AI architecture](docs/AI_ARCHITECTURE.md) and [M3.1 research](docs/AI_RESEARCH.md) and [M3.2 research](docs/M3_2_RESEARCH.md)
- [AI difficulty presets](docs/AI_DIFFICULTIES.md) and [M3.3 calibration](docs/M3_3_RESEARCH.md)
- [Computer play, worker benchmarks, and screenshots](docs/M3_4_INTEGRATION.md)
- [Roadmap](docs/ROADMAP.md) and [contributing](CONTRIBUTING.md)

Use Node.js 24.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. For validation, run the following commands.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox webkit
npm run e2e
```

The separate `npm run simulate` command runs 2,000 games with deterministic seeds 1–2,000. It chooses uniformly from the engine's representative legal actions and stops a simulation at 1,000 actions, including deployment. Its report counts truncated runs separately from canonical outcomes. The cap applies only to this validation run.

`npm run diagnose` compares random and one-turn greedy play in three pairings. See the [M1 review results](docs/M1_REVIEW.md) for the protocol, findings, and terminal-state checks.
