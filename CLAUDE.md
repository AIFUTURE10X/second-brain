# CLAUDE.md

Guidance for Claude Code in this repository.

## Conventions check (mandatory)

After ANY code change, run `npm run check:conventions` and fix failures before
reporting done. CI enforces the same check on every push; catching it locally is
cheaper than a red X. Existing violations are grandfathered in
`scripts/conventions-baseline.json` — never update the baseline to silence a
NEW violation; fix the code instead.
