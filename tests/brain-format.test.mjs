import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadTsModule(relPath, name) {
  const source = await readFile(new URL(relPath, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const tempDir = await mkdtemp(path.join(tmpdir(), `second-brain-${name}-`));
  const tempModule = path.join(tempDir, `${name}.mjs`);
  await writeFile(tempModule, transpiled);
  return import(pathToFileURL(tempModule).href);
}

const fmt = await loadTsModule("../lib/brain-format.ts", "brain-format");
const model = await loadTsModule("../lib/brain-model.ts", "brain-model");

test("sourceFromUrl maps known hosts, strips www, falls back to hostname", () => {
  assert.deepEqual(fmt.sourceFromUrl("https://www.youtube.com/watch?v=x"), { key: "YouTube", label: "YouTube" });
  assert.deepEqual(fmt.sourceFromUrl("https://github.com/foo/bar"), { key: "GitHub", label: "GitHub" });
  assert.deepEqual(fmt.sourceFromUrl("https://example.org/a"), { key: "example.org", label: "example.org" });
  assert.equal(fmt.sourceFromUrl("not a url"), null);
  assert.equal(fmt.sourceFromUrl(""), null);
});

test("formatStamp renders local date-time and rejects garbage", () => {
  assert.equal(fmt.formatStamp("2026-01-05T08:30:00"), "2026-01-05 08:30");
  assert.equal(fmt.formatStamp("garbage"), "");
});

test("timeAgo buckets minutes, hours, days, then falls back to a date", () => {
  const now = Date.now();
  assert.equal(fmt.timeAgo(new Date(now).toISOString()), "just now");
  assert.equal(fmt.timeAgo(new Date(now - 5 * 60000).toISOString()), "5m ago");
  assert.equal(fmt.timeAgo(new Date(now - 3 * 3600000).toISOString()), "3h ago");
  assert.equal(fmt.timeAgo(new Date(now - 5 * 86400000).toISOString()), "5d ago");
  const old = new Date(now - 60 * 86400000).toISOString();
  assert.equal(fmt.timeAgo(old), new Date(old).toLocaleDateString());
});

test("toDateTimeLocal produces a datetime-local value preserving the instant", () => {
  assert.equal(fmt.toDateTimeLocal(null), "");
  assert.equal(fmt.toDateTimeLocal(""), "");
  assert.equal(fmt.toDateTimeLocal("nope"), "");
  const iso = "2026-06-12T07:30:00.000Z";
  const out = fmt.toDateTimeLocal(iso);
  assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(new Date(out).getTime(), new Date(iso).getTime());
});

test("formatReminderDue formats valid dates and rejects garbage", () => {
  assert.equal(fmt.formatReminderDue("garbage"), "");
  assert.ok(fmt.formatReminderDue("2026-06-12T07:30:00.000Z").length > 0);
});

test("resolveContentType forces markdown for .md files and defaults empty types", () => {
  assert.equal(fmt.resolveContentType(new File([""], "notes.md", { type: "" })), "text/markdown");
  assert.equal(fmt.resolveContentType(new File([""], "notes.MARKDOWN", { type: "" })), "text/markdown");
  assert.equal(fmt.resolveContentType(new File([""], "a.txt", { type: "text/plain" })), "text/plain");
  assert.equal(fmt.resolveContentType(new File([""], "blob", { type: "" })), "application/octet-stream");
});

test("fileIcon picks icons by content type with markdown name fallback", () => {
  assert.equal(fmt.fileIcon("image/png"), "🖼");
  assert.equal(fmt.fileIcon("application/pdf"), "📄");
  assert.equal(fmt.fileIcon("text/csv"), "📊");
  assert.equal(fmt.fileIcon("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "📝");
  assert.equal(fmt.fileIcon("text/markdown"), "Ⓜ");
  assert.equal(fmt.fileIcon("application/octet-stream", "readme.md"), "Ⓜ");
  assert.equal(fmt.fileIcon("text/plain"), "📃");
  assert.equal(fmt.fileIcon("application/zip"), "📎");
});

test("formatSize renders B, KB, and MB", () => {
  assert.equal(fmt.formatSize(512), "512 B");
  assert.equal(fmt.formatSize(2048), "2.0 KB");
  assert.equal(fmt.formatSize(5 * 1024 * 1024), "5.0 MB");
});

test("viewModeIcon and viewModeLabel cover active modes", () => {
  assert.equal(fmt.viewModeIcon("list"), "☰");
  assert.equal(fmt.viewModeIcon("compact"), "≡");
  assert.equal(fmt.viewModeIcon("table"), "▦");
  assert.equal(fmt.viewModeIcon("board"), "▥");
  assert.equal(fmt.viewModeLabel("list"), "List");
  assert.equal(fmt.viewModeLabel("compact"), "Compact");
  assert.equal(fmt.viewModeLabel("table"), "Table");
  assert.equal(fmt.viewModeLabel("board"), "Board");
});

test("checklistProgress counts completed over total", () => {
  assert.deepEqual(fmt.checklistProgress(), { completed: 0, total: 0 });
  assert.deepEqual(
    fmt.checklistProgress([
      { id: "1", text: "a", completed: true },
      { id: "2", text: "b", completed: false },
      { id: "3", text: "c", completed: true },
    ]),
    { completed: 2, total: 3 }
  );
});

const emptyForm = () => ({
  title: "",
  content: "",
  url: "",
  noteEntries: [],
  checklistItems: [],
  websiteLinks: [],
  tags: "",
  category: "",
  attachments: [],
  reminderDueAt: "",
  reminderMessage: "",
  relatedItemIds: [],
});

test("hasMeaningfulFormContent ignores blank fields and whitespace-only entries", () => {
  assert.equal(model.hasMeaningfulFormContent(emptyForm()), false);
  assert.equal(
    model.hasMeaningfulFormContent({ ...emptyForm(), noteEntries: [{ id: "1", body: "   ", createdAt: "", updatedAt: "" }] }),
    false
  );
});

test("hasMeaningfulFormContent detects each meaningful field", () => {
  assert.equal(model.hasMeaningfulFormContent({ ...emptyForm(), title: "x" }), true);
  assert.equal(model.hasMeaningfulFormContent({ ...emptyForm(), checklistItems: [{ id: "1", text: "do it", completed: false }] }), true);
  assert.equal(
    model.hasMeaningfulFormContent({ ...emptyForm(), attachments: [{ url: "u", name: "n", contentType: "t", size: 1 }] }),
    true
  );
  assert.equal(model.hasMeaningfulFormContent({ ...emptyForm(), relatedItemIds: ["a"] }), true);
  assert.equal(model.hasMeaningfulFormContent({ ...emptyForm(), websiteLinks: [{ url: "https://example.com", label: "" }] }), true);
});

test("newEntryId returns unique non-empty ids", () => {
  const a = model.newEntryId();
  const b = model.newEntryId();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("REMINDER_TIME_OPTIONS spans 07:00 to 22:00 in half-hour steps", () => {
  assert.equal(model.REMINDER_TIME_OPTIONS.length, 31);
  assert.equal(model.REMINDER_TIME_OPTIONS[0], "07:00");
  assert.equal(model.REMINDER_TIME_OPTIONS.at(-1), "22:00");
});
