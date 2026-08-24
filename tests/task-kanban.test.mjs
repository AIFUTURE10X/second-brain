import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const kanbanSource = await readFile(new URL("../components/brain/TaskKanbanBoard.tsx", import.meta.url), "utf8").catch(() => "");

test("the Tasks section renders a dedicated three-column Kanban board", () => {
  assert.match(brainSource, /import \{ TaskKanbanBoard \} from "\.\/brain\/TaskKanbanBoard"/);
  assert.match(brainSource, /view === "task"[\s\S]*?<TaskKanbanBoard/);
  assert.match(kanbanSource, /label: "Todo"/);
  assert.match(kanbanSource, /label: "In Progress"/);
  assert.match(kanbanSource, /label: "Done"/);
});

test("task columns derive from existing completion and workflow status", () => {
  assert.match(kanbanSource, /item\.completed \|\| item\.workflowStatus === "done"/);
  assert.match(kanbanSource, /item\.workflowStatus === "active"/);
  assert.match(kanbanSource, /return "todo"/);
});

test("the Kanban reuses the full task card instead of a reduced card", () => {
  assert.match(kanbanSource, /renderCard: \(item: Item, index: number\) => ReactNode/);
  assert.match(kanbanSource, /renderCard\(item, index\)/);
  assert.match(brainSource, /const renderItemCard = \(item: Item, idx: number\) => \(/);
  assert.match(brainSource, /renderCard={renderItemCard}/);
});
