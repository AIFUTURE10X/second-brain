import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const kanbanSource = await readFile(new URL("../components/brain/TaskKanbanBoard.tsx", import.meta.url), "utf8").catch(() => "");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");

test("the Tasks section renders a dedicated three-column Kanban board", () => {
  assert.match(brainSource, /import \{ TaskKanbanBoard, type TaskKanbanColumnKey \} from "\.\/brain\/TaskKanbanBoard"/);
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

test("saving a new task opens the Kanban and starts the task in Todo", () => {
  assert.match(brainSource, /!editingId && saved\.type === "task" && !andAddAnother/);
  assert.match(brainSource, /applySavedView\("tasks"\)/);
  assert.match(itemsRouteSource, /\(body\.type \|\| "note"\) === "task" \|\| body\.reviewedAt === null \? "inbox" : "active"/);
});

test("each Kanban card has a direct column control wired to persistence", () => {
  assert.match(kanbanSource, /onMoveTask: \(item: Item, column: TaskKanbanColumnKey\) => void/);
  assert.match(kanbanSource, /aria-label={`Move \$\{item\.title \|\| "task"\} to`}/);
  assert.match(kanbanSource, /onMoveTask\(item, event\.target\.value as TaskKanbanColumnKey\)/);
  assert.match(kanbanSource, /disabled={movingTaskId === item\.id \|\| item\.completed}/);
  assert.match(brainSource, /const handleMoveTask = async \(item: Item, column: TaskKanbanColumnKey\)/);
  assert.match(brainSource, /workflowStatus = column === "todo" \? "inbox" : column === "in-progress" \? "active" : "done"/);
  assert.match(brainSource, /onMoveTask={handleMoveTask}/);
});
