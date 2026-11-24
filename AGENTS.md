# Development workflow

Use Node.js 24 and install dependencies with `npm ci`. Run `npm run typecheck`, `npm test`, and `npm run build` before requesting a review.

Keep the TypeScript engine independent of browsers, databases, networking, and the user interface. Add focused regression tests for rule changes.

Document every rule change in `docs/RULES.md` and record its source, rationale, and status in `docs/RULE_DECISIONS.md`. Identify published rules, interpretations of the Seneca reconstruction, and modern digital conventions. Keep other reconstructions separate.

Open a pull request for independent review. Leave merging to the reviewer.
