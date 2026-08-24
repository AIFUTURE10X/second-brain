import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const kanbanSource = await readFile(new URL("../components/brain/TaskKanbanBoard.tsx", import.meta.url), "utf8").catch(() => "");
const layoutPickerSource = await readFile(new URL("../components/brain/TaskLayoutPicker.tsx", import.meta.url), "utf8").catch(() => "");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const taskWorkflow = await import("../lib/task-workflow.mjs").catch(() => null);

test("the Tasks section renders a dedicated three-column Kanban board", () => {
  assert.match(brainSource, /import \{ TaskKanbanBoard, type TaskKanbanColumnKey \} from "\.\/brain\/TaskKanbanBoard"/);
  assert.match(brainSource, /view === "task"[\s\S]*?<TaskKanbanBoard/);
  assert.match(kanbanSource, /label: "Todo"/);
  assert.match(kanbanSource, /label: "In Progress"/);
  assert.match(kanbanSource, /label: "Done"/);
});

test("task columns derive from existing completion and workflow status", () => {
  assert.ok(taskWorkflow);
  assert.equal(taskWorkflow.taskKanbanColumn({ type: "task", completed: true, workflowStatus: "active" }), "done");
  assert.equal(taskWorkflow.taskKanbanColumn({ type: "task", workflowStatus: "done" }), "done");
  assert.equal(taskWorkflow.taskKanbanColumn({ type: "task", workflowStatus: "active" }), "in-progress");
  assert.equal(taskWorkflow.taskKanbanColumn({ type: "task", workflowStatus: "inbox" }), "todo");
});

test("the Kanban renders a purpose-built compact task card", () => {
  assert.doesNotMatch(kanbanSource, /renderCard/);
  assert.match(kanbanSource, /className="flex h-\[9rem\] flex-col/);
  assert.match(kanbanSource, /className="line-clamp-2 text-base font-semibold leading-snug text-gray-100/);
  assert.match(kanbanSource, /WebkitLineClamp: 2/);
  assert.match(kanbanSource, /maxHeight: "2\.75rem"/);
  assert.equal(taskWorkflow.taskDisplayTitle({ title: "  ", content: "Do the actual work" }), "Do the actual work");
  assert.equal(taskWorkflow.taskDisplayTitle({ title: "Ship it", content: "Final verification" }), "Ship it");
  assert.match(kanbanSource, /onOpenTask: \(item: Item\) => void/);
  assert.match(brainSource, /onOpenTask={handleEdit}/);
});

test("Tasks offers a second List layout using the normal small list cards", () => {
  assert.match(layoutPickerSource, /export type TaskLayout = "board" \| "list"/);
  assert.match(layoutPickerSource, /aria-label="Task layout"/);
  assert.match(layoutPickerSource, /label: "Board"/);
  assert.match(layoutPickerSource, /label: "List"/);
  assert.match(brainSource, /const \[taskLayout, setTaskLayout\] = useState<TaskLayout>\("board"\)/);
  assert.match(brainSource, /<TaskLayoutPicker layout={taskLayout} onLayoutChange={setTaskLayout}/);
  assert.match(brainSource, /const renderTaskListCard = \(item: Item, idx: number\) => renderItemCardAtDensity\(item, idx, "list"\)/);
  assert.match(brainSource, /taskLayout === "board" \? \(/);
  assert.match(brainSource, /visibleItems\.map\(renderTaskListCard\)/);
  assert.match(brainSource, /sb_task_layout/);
});

test("saving a new task opens the Kanban and starts the task in Todo", () => {
  assert.match(brainSource, /!editingId && saved\.type === "task" && !andAddAnother/);
  assert.match(brainSource, /applySavedView\("tasks"\)/);
  assert.match(itemsRouteSource, /\(body\.type \|\| "note"\) === "task" \|\| body\.reviewedAt === null \? "inbox" : "active"/);
});

test("each Kanban card has status tabs in its footer wired to persistence", () => {
  assert.match(kanbanSource, /onMoveTask: \(item: Item, column: TaskKanbanColumnKey\) => void/);
  assert.match(kanbanSource, /className="mt-auto grid shrink-0 grid-cols-3/);
  assert.match(kanbanSource, /aria-label={`Move \$\{taskTitle\} to \$\{option\.label\}`}/);
  assert.match(kanbanSource, /onMoveTask\(item, option\.key\)/);
  assert.match(brainSource, /const handleMoveTask = async \(item: Item, column: TaskKanbanColumnKey\)/);
  assert.match(brainSource, /const taskUpdates = taskMoveUpdates\(item, column\)/);
  assert.match(brainSource, /onMoveTask={handleMoveTask}/);
});

test("Done tasks can move back to Todo or In Progress", () => {
  assert.ok(taskWorkflow);
  assert.equal(taskWorkflow.canMoveTask({ type: "task", workflowStatus: "done" }, "in-progress"), true);
  assert.equal(taskWorkflow.canMoveTask({ type: "task", completed: true, workflowStatus: "inbox" }, "todo"), true);
  assert.equal(taskWorkflow.canMoveTask({ type: "task", workflowStatus: "active" }, "todo"), true);
  assert.equal(taskWorkflow.canMoveTask({ type: "task", workflowStatus: "inbox" }, "in-progress"), true);
  assert.deepEqual(taskWorkflow.taskMoveUpdates({ type: "task", workflowStatus: "done" }, "in-progress"), {
    workflowStatus: "active",
    completed: false,
    completedAt: null,
  });
  assert.deepEqual(taskWorkflow.taskMoveUpdates({ type: "task", completed: true, workflowStatus: "inbox" }, "todo"), {
    workflowStatus: "inbox",
    completed: false,
    completedAt: null,
  });
  assert.match(kanbanSource, /onClick=\{\(\) => onOpenTask\(item\)\}/);
  assert.match(kanbanSource, /const disabled = movingTaskId === item\.id \|\| active/);
  assert.match(brainSource, /const taskUpdates = taskMoveUpdates\(item, column\)/);
  assert.match(itemsRouteSource, /updates\.completed === undefined \? current\.completed : updates\.completed/);
  assert.doesNotMatch(itemsRouteSource, /Done tasks cannot be moved back to an active column/);
});
