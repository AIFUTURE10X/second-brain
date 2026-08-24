import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../lib/brain-model.ts", import.meta.url), "utf8");
const validationSource = await readFile(new URL("../lib/validation.ts", import.meta.url), "utf8");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const saveRouteSource = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");
const searchItemsSource = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const bulkBarSource = await readFile(new URL("../components/brain/BulkTriageBar.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const tableSource = await readFile(new URL("../components/brain/TableView.tsx", import.meta.url), "utf8");
const boardSource = await readFile(new URL("../components/brain/BoardView.tsx", import.meta.url), "utf8");

test("item model and schema persist workflow status", () => {
  assert.match(modelSource, /export type WorkflowStatus = "inbox" \| "active" \| "waiting" \| "done" \| "archived"/);
  assert.match(modelSource, /workflowStatus\?: WorkflowStatus/);
  assert.match(modelSource, /WORKFLOW_STATUS_META/);
  assert.match(schemaSource, /workflowStatus:\s*text\("workflow_status"\)\.notNull\(\)\.default\("active"\)/);
});

test("item validation and APIs accept workflow status", () => {
  assert.match(validationSource, /workflowStatusSchema = z\.enum\(\["inbox", "active", "waiting", "done", "archived"\]\)/);
  assert.match(validationSource, /workflowStatus: workflowStatusSchema\.optional\(\)/);
  assert.match(searchItemsSource, /workflow_status AS "workflowStatus"/);
  assert.match(itemsRouteSource, /workflowStatus: body\.workflowStatus \|\| \(\(body\.type \|\| "note"\) === "task" \|\| body\.reviewedAt === null \? "inbox" : "active"\)/);
  assert.match(saveRouteSource, /workflowStatus:\s*"inbox"/);
});

test("Brain can bulk-update workflow status", () => {
  assert.match(brainSource, /const \[bulkStatus, setBulkStatus\] = useState<WorkflowStatus \| "">\(""\)/);
  assert.match(brainSource, /onStatusChange={setBulkStatus}/);
  assert.match(brainSource, /onApplyStatus={handleBulkApplyStatus}/);
  assert.match(brainSource, /const status = statusOverride \?\? bulkStatus/);
  assert.match(brainSource, /workflowStatus: status/);
});

test("BulkTriageBar exposes workflow status controls", () => {
  assert.match(bulkBarSource, /selectedStatus: WorkflowStatus \| ""/);
  assert.match(bulkBarSource, /onStatusChange: \(value: WorkflowStatus \| ""\) => void/);
  assert.match(bulkBarSource, /onApplyStatus: \(value\?: WorkflowStatus\) => void/);
  assert.match(bulkBarSource, /WORKFLOW_STATUS_META/);
  assert.match(bulkBarSource, /applyStatusChip/);
  assert.match(bulkBarSource, /grid grid-cols-3 gap-1\.5/);
  assert.doesNotMatch(bulkBarSource, /aria-label="Bulk status"/);
});

test("card, table, and board surfaces display workflow status", () => {
  assert.match(itemCardSource, /WORKFLOW_STATUS_META\[item\.workflowStatus \|\| "active"\]/);
  assert.match(tableSource, /WORKFLOW_STATUS_META\[item\.workflowStatus \|\| "active"\]/);
  assert.match(boardSource, /WORKFLOW_STATUS_META\[item\.workflowStatus \|\| "active"\]/);
});
