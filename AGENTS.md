# AGENTS.md

## Conventions check (mandatory)

After ANY code change, run `npm run check:conventions` and fix failures before
reporting done. CI enforces the same check on every push. Existing violations
are grandfathered in `scripts/conventions-baseline.json`. Never update the
baseline to silence a NEW violation; fix the code instead. Ratcheting DOWN
after removed debt is the only legitimate baseline update.
