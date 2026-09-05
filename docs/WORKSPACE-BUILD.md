# Second Brain workspace features

Work item type: feature. Implementation order approved on 2026-09-05.

## Acceptance criteria

1. Ask retrieves relevant passages from saved card text and stored transcripts, includes inspectable excerpts, and can be scoped to selected cards or a project. Optional PDF/image attachment input is explicit and bounded. Answers and conversations can be saved and resumed; saved notes/tasks retain source links. Existing keyword search stays unchanged.
2. Projects hold an editable goal, category/card scope, and open questions. A source-backed return-to-work brief and Use this actions generate editable proposals, experiments, checklists, handoffs, and comparisons. Creating a task or note requires the user's Save action.
3. Today shows at most three explainable suggestions grounded in library cards and project context. Keep, dismiss, and snooze persist. No notification or scheduled job is enabled automatically.
4. Decision records preserve the choice, rationale, alternatives, sources, and reconsideration date. Connections compare two explicitly selected cards and label generated connections as proposals, with evidence and an experiment.
5. Workspace records use optimistic revision checks and can be exported/imported without overwriting existing records. All new routes use existing authorization. No schema migration is required.

## Verification

Run focused behavioral tests, the full node:test suite, TypeScript, ESLint, conventions, and production build. Exercise UI workflows using a local fixture server that cannot access production storage or paid providers. Check provider request construction with an injected fake fetch. Live provider answer quality and production deployment require separate verification.

## Scope and authority

Reuse the configured OpenAI key and model. Commit and push were subsequently authorized by the user on 2026-09-05. No production migration or paid provider calls are part of this release. Existing extension packaging changes belong to the user and remain untouched. Timestamp links appear only when stored source text actually contains timestamps; legacy transcripts have no timing information. PDF/image understanding is on-demand for selected uploaded attachments, not automatic corpus-wide OCR indexing.

## Using the features

Open **Workspace** next to the library item count. Selecting library cards changes this link to **Use selected cards**. The original Ask button also supports the selected cards and saved conversations.

- **Projects:** create a goal and category/card scope; choose **Where was I?** to prepare a briefing.
- **Use this:** select up to eight cards, choose an action, review the question and click **Ask**.
- **Conversations:** resume saved answers. **Save answer / create task** opens an editable preview before creating a linked library card.
- **Today:** keep, dismiss or snooze a suggestion. **Manage discovery choices** lets you restore it.
- **Decisions:** record the choice, reason, alternatives, evidence and optional review date. Due decisions appear in Today.
- **Connections:** select exactly two cards to prepare a connection question.
- **Workspace backup:** export or restore workspace records. Restore only adds missing records; source cards use the original library backup separately.

Ask reads stored transcripts without triggering transcription jobs. To read a PDF or image, select its card and explicitly choose the uploaded attachment below the conversation. Up to three attachments totaling 10 MB of stored upload sizes are accepted.

The development-only Postgres dependency is `@electric-sql/pglite`; no new production service, database table or credential is required. [Verification record](WORKSPACE-EVIDENCE.md) contains the complete changed-file list and remaining live checks.
