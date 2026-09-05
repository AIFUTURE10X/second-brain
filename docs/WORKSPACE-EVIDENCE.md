## Work item type
feature

## Evidence

### Cause
Implement the approved four-stage build order. Acceptance criteria are in docs/WORKSPACE-BUILD.md: passage-based Ask, saved conversations and outputs, project workspaces and Use this, controlled discoveries, and decision/connection workflows.

### Changed files
app/api/ask/route.ts - scoped source retrieval and deeper Ask.
app/api/settings/route.ts - protect workspace records from ordinary settings writes and bulk reads.
app/api/workspace/records/route.ts - versioned record storage and additive restore.
app/api/workspace/save/route.ts - idempotent linked output saves.
app/workspace/page.tsx - workspace route.
components/Brain.tsx - workspace entry and selected-card handoff.
components/brain/AskBrainPanel.tsx - durable conversation interface.
components/workspace/CardPicker.tsx - bounded source selection.
components/workspace/DecisionEditor.tsx - editable choice and rationale.
components/workspace/KnowledgeChat.tsx - saved evidence-backed conversations.
components/workspace/ProjectEditor.tsx - project goals and source scope.
components/workspace/SaveOutput.tsx - editable output-to-card flow.
components/workspace/SourceEvidence.tsx - inspectable source excerpts.
components/workspace/TodayPanel.tsx - controlled discoveries.
components/workspace/Workspace.tsx - cohesive workspace navigation.
components/workspace/WorkspaceBackup.tsx - backup/restore controls.
docs/WORKSPACE-BUILD.md - acceptance and authority record.
lib/ask-brain.mjs - passage-based context.
lib/knowledge-passages.mjs - literal passage selection.
lib/knowledge-provider.mjs - bounded provider and attachment requests.
lib/workspace-client.ts - checked client persistence.
lib/workspace-discovery.mjs - grounded bounded discovery ranking.
lib/workspace-model.mjs - record and request validation.
lib/workspace-store.ts - atomic revision checks.
lib/workspace-types.ts - shared record types.
package.json, package-lock.json - local Postgres test dependency; preserve existing packaging changes.
tests/ask-passages.test.mjs - passage acceptance tests.
tests/workspace-contracts.test.mjs - validation and provider boundary tests.
tests/workspace-discovery.test.mjs - discovery and feedback tests.
tests/workspace-persistence.test.mjs - production routes against local Postgres.
tests/helpers/workspace-fixture.mjs - isolated database/provider fixture.
tests/helpers/workspace-browser-server.mjs - local UI host using real routes and fixture data.
docs/WORKSPACE-EVIDENCE.md - implementation evidence and verification limits.

### Test evidence
- `npm test`: 316 tests passed, zero failed. Includes passage retrieval, schema/provider boundaries, discovery feedback and six production-route/local-Postgres persistence checks.
- `node --test tests/workspace-persistence.test.mjs`: six passed after the final fixture-host adjustment. Covers concurrent revision conflicts, authorization, pagination/additive restore, scoped transcript retrieval, provider failure, idempotent output saves, and reserved settings keys.
- `npx tsc --noEmit --incremental false`: exit 0.
- `npm run lint -- --ignore-pattern '.worktrees/**' --ignore-pattern 'tests/.tmp/**'`: zero errors, 15 existing warnings in legacy files. The unqualified lint command was stopped after it descended into an unrelated nested worktree's generated build output. New workspace files have no lint warnings.
- `npm run check:conventions`: passed for tracked files and with all task files included through a temporary Git index; the real index was not changed.
- `npm run build`: passed, including the final rebuild after preserving backup status. The final production build was started locally for the backup walkthrough.
- `git diff --check`: passed.
- Passage acceptance tests were first run before implementation: three assertions failed for missing transcript/late-note excerpts, then all passed. Discovery acceptance caught a snoozed card reappearing in a different suggestion kind; the focused test failed before the refinement and passed after it.

### Live verification
Local browser, `http://127.0.0.1:3180`, serving the actual Next UI and production route code against an in-memory Postgres database. Provider responses were deliberately mocked; fixture data never accessed production.

Observed paths:
- Library -> Workspace and the original Ask dialog.
- Create a project with goal, category scope and open questions -> prepare a briefing -> answer saved with source excerpts.
- Edit an answer -> save as Task -> open the existing `/card/<id>` editor; title, content, type and linked sources present.
- Reload -> Conversations -> resume saved messages and saved-card reference.
- Record/edit decision -> persist reasoning, alternatives, sources and review date -> scheduled decision appears in Today.
- Keep, snooze and restore discovery choices. After the refinement a snoozed action no longer reappears as earlier material.
- Choose two cards -> connection proposal with both sources -> explicitly select a PDF attachment -> attachment included in the mocked request and evidence list.
- Original Ask dialog -> a question about welcome workflow -> literal stored transcript excerpt and a verified `t=754` URL for `[12:34]` in the fixture.
- Workspace backup -> choose valid file -> restore seven existing records without replacement. The final production build retained the visible result: "Imported 0; kept 7 existing records unchanged."
- 390 CSS-pixel viewport geometry had no horizontal document overflow. Physical mobile devices and full mobile touch workflows were not tested.

### Publishing state
Implementation verification was completed before publication. The user subsequently authorized commit and push on 2026-09-05. The release contains only the 34 listed Workspace files and the Workspace dependency hunk; unrelated extension packaging changes remain local. No migration, production data change or live paid provider request was performed. See the task handoff for the release SHA and deployment verification.

### Unverified
Live OpenAI answer quality, PDF/image reading accuracy and real-provider latency/cost; full mobile-device behavior; deployed production behavior. Uploaded attachments are read on explicit selection, not automatically OCR-indexed across the library. Legacy transcripts without timings cannot supply timestamp links. Workspace records have a separate backup control; the original library export remains for cards.
