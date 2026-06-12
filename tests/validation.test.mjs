import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile into a temp file inside the repo (not the OS tmpdir) so the bare
// "zod" import resolves against this project's node_modules.
const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(here, "..", "lib", "validation.ts"), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = path.join(here, ".tmp");
await mkdir(tempDir, { recursive: true });
const tempModule = path.join(tempDir, `validation-${process.pid}.mjs`);
await writeFile(tempModule, transpiled);
const v = await import(pathToFileURL(tempModule).href);

after(async () => {
  await rm(tempModule, { force: true });
});

test("itemUpdateSchema rejects unknown keys (mass-assignment fix)", () => {
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", title: "t", isAdmin: true }).success, false);
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", createdAt: "2020-01-01" }).success, false);
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", updatedAt: "2020-01-01" }).success, false);
});

test("itemUpdateSchema requires id and accepts a real edit payload", () => {
  assert.equal(v.itemUpdateSchema.safeParse({ title: "no id" }).success, false);
  const brainEditPayload = {
    id: "c424ef84-0f4b-4b6a-bd35-ccc767b5fa69",
    type: "task",
    title: "Edited",
    content: "body",
    url: "",
    notes: "",
    noteEntries: [{ id: "e1", body: "note", createdAt: "2026-06-12T00:00:00.000Z", updatedAt: "2026-06-12T00:00:00.000Z" }],
    checklistItems: [{ id: "c1", text: "row", completed: false, completedAt: null }],
    tags: ["a", "b"],
    category: "Testing",
    attachments: [{ url: "https://x/y.png", name: "y.png", contentType: "image/png", size: 123 }],
    favourite: true,
    actionRequired: false,
  };
  assert.equal(v.itemUpdateSchema.safeParse(brainEditPayload).success, true);
});

test("itemUpdateSchema accepts the small flag payloads the cards send", () => {
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", pinned: true }).success, true);
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", favourite: false }).success, true);
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", checklistItems: [{ text: "row" }] }).success, true);
  assert.equal(v.itemUpdateSchema.safeParse({ id: "x", attachments: [] }).success, true);
});

test("itemCreateSchema enforces the type enum", () => {
  assert.equal(v.itemCreateSchema.safeParse({ type: "bookmark", title: "x" }).success, false);
  assert.equal(v.itemCreateSchema.safeParse({ type: "memory", title: "x" }).success, true);
  assert.equal(v.itemCreateSchema.safeParse({ type: "thought", title: "x", tags: [], category: "" }).success, true);
});

test("saveSchema is permissive for automation but still validates", () => {
  assert.equal(v.saveSchema.safeParse({ url: "https://example.com" }).success, true);
  assert.equal(v.saveSchema.safeParse({ text: "a thought", tags: "a, b, c" }).success, true);
  assert.equal(v.saveSchema.safeParse({ title: "x", some_extra_field: 42 }).success, true);
  assert.equal(v.saveSchema.safeParse({}).success, false);
  assert.equal(v.saveSchema.safeParse({ notes: "only notes" }).success, false);
  assert.equal(v.saveSchema.safeParse({ url: "https://x", type: "bookmark" }).success, false);
});

test("category schemas require names and reject junk keys", () => {
  assert.equal(v.categoryCreateSchema.safeParse({}).success, false);
  assert.equal(v.categoryCreateSchema.safeParse({ name: "   " }).success, false);
  assert.equal(v.categoryCreateSchema.safeParse({ name: "Ideas", color: "#fff", parentId: null }).success, true);
  assert.equal(v.categoryUpdateSchema.safeParse({ id: "c1", position: 99 }).success, false);
  assert.equal(v.categoryUpdateSchema.safeParse({ id: "c1", name: "Renamed", parentId: null }).success, true);
  assert.equal(v.categoryReorderSchema.safeParse({ orders: [{ id: "c1", position: 0 }] }).success, true);
  assert.equal(v.categoryReorderSchema.safeParse({ orders: [{ id: "c1", position: 0.5 }] }).success, false);
});

test("settingsPutSchema requires a value but accepts falsy ones", () => {
  assert.equal(v.settingsPutSchema.safeParse({ key: "k" }).success, false);
  assert.equal(v.settingsPutSchema.safeParse({ key: "k", value: false }).success, true);
  assert.equal(v.settingsPutSchema.safeParse({ key: "k", value: null }).success, true);
  assert.equal(v.settingsPutSchema.safeParse({ key: "", value: 1 }).success, false);
});

test("reminderUpdateSchema validates status and shape", () => {
  assert.equal(v.reminderUpdateSchema.safeParse({ id: "r1", status: "snoozed" }).success, false);
  assert.equal(v.reminderUpdateSchema.safeParse({ id: "r1", status: "done" }).success, true);
  assert.equal(v.reminderUpdateSchema.safeParse({ id: "r1", message: "hi", dueAt: "2026-06-13T07:00" }).success, true);
  assert.equal(v.reminderUpdateSchema.safeParse({ id: "r1", junk: true }).success, false);
});

test("tagsMergeSchema requires non-empty from and to", () => {
  assert.equal(v.tagsMergeSchema.safeParse({ from: [], to: "x" }).success, false);
  assert.equal(v.tagsMergeSchema.safeParse({ from: ["a"], to: "  " }).success, false);
  assert.equal(v.tagsMergeSchema.safeParse({ from: ["a", "A"], to: "a" }).success, true);
});

test("importSchema requires array shapes when present", () => {
  assert.equal(v.importSchema.safeParse({ items: "nope" }).success, false);
  assert.equal(v.importSchema.safeParse({ categories: [{ name: "X" }], items: [{ title: "t" }] }).success, true);
  assert.equal(v.importSchema.safeParse({}).success, true);
});

test("formatIssues produces path-prefixed messages", () => {
  const result = v.itemUpdateSchema.safeParse({ id: "x", tags: ["ok", 5] });
  assert.equal(result.success, false);
  const messages = v.formatIssues(result.error);
  assert.ok(messages.some(m => m.startsWith("tags.1:")));
});
