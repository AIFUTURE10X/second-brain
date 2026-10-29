# AGENTS.md

## AI OS link

Part of Phil's AI OS — registry slug: `second-brain` (project id 27).
- Status and next action live in the registry row, not in this file. On Phil's PC, from any folder:
  `node C:/Projects/ai-os-system/scripts/project.mjs show second-brain`
  When the next action changes: `node C:/Projects/ai-os-system/scripts/project.mjs next second-brain "<text>"`.
- Notable work goes to the AI OS journal: `node C:/Projects/ai-os-system/scripts/project.mjs log second-brain "<entry>"`.
  Tasks, findings and decisions go to the ai-os Neon DB with `project_id = 27`.
- Durable learnings go in this file or the OS vault.

## Conventions check (mandatory)

After ANY code change, run `npm run check:conventions` and fix failures before
reporting done. CI enforces the same check on every push. Existing violations
are grandfathered in `scripts/conventions-baseline.json`. Never update the
baseline to silence a NEW violation; fix the code instead. Ratcheting DOWN
after removed debt is the only legitimate baseline update.
