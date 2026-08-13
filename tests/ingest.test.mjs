import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile into a temp dir inside the repo (not the OS tmpdir) so the bare
// "zod" import resolves against this project's node_modules — same trick as
// tests/validation.test.mjs. lib/ingest.ts imports lib/validation.ts, so that
// relative specifier is rewritten to the transpiled sibling.
const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(here, ".tmp");
await mkdir(tempDir, { recursive: true });

async function transpile(name, rewrite = source => source) {
  const source = await readFile(path.join(here, "..", "lib", `${name}.ts`), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = path.join(tempDir, `${name}-ingest-test-${process.pid}.mjs`);
  await writeFile(file, rewrite(output));
  return file;
}

const validationModule = await transpile("validation");
const ingestModule = await transpile("ingest", output =>
  output.replace(/["']\.\/validation["']/g, JSON.stringify(pathToFileURL(validationModule).href))
);
const ingest = await import(pathToFileURL(ingestModule).href);

after(async () => {
  await rm(validationModule, { force: true });
  await rm(ingestModule, { force: true });
});

test("normalizeImageContentType accepts capture formats and rejects svg", () => {
  assert.equal(ingest.normalizeImageContentType("image/png"), "image/png");
  assert.equal(ingest.normalizeImageContentType("image/JPEG; charset=binary"), "image/jpeg");
  assert.equal(ingest.normalizeImageContentType("image/jpg"), "image/jpeg");
  assert.equal(ingest.normalizeImageContentType("image/heic"), "image/heic");
  // svg is a script-execution vector when served from the blob origin.
  assert.equal(ingest.normalizeImageContentType("image/svg+xml"), null);
  assert.equal(ingest.normalizeImageContentType("text/plain"), null);
  assert.equal(ingest.normalizeImageContentType(""), null);
  assert.equal(ingest.normalizeImageContentType(undefined), null);
});

test("sanitizeFileName strips paths and guarantees an extension", () => {
  assert.equal(ingest.sanitizeFileName("shot.png", "image/png"), "shot.png");
  assert.equal(ingest.sanitizeFileName("C:\\Users\\phil\\shot.png", "image/png"), "shot.png");
  assert.equal(ingest.sanitizeFileName("../../etc/passwd.png", "image/png"), "passwd.png");
  assert.equal(ingest.sanitizeFileName("capture", "image/jpeg"), "capture.jpg");
  assert.equal(ingest.sanitizeFileName("", "image/png"), "screenshot.png");
  assert.equal(ingest.sanitizeFileName(null, "image/webp"), "screenshot.webp");
  assert.equal(ingest.sanitizeFileName("a?b*c.png", "image/png"), "a_b_c.png");
  assert.equal(ingest.sanitizeFileName("...", "image/png"), "screenshot.png");
});

test("parseCapturedAt keeps the client's UTC offset and rejects junk", () => {
  const parsed = ingest.parseCapturedAt("2026-08-13T14:32:05.1234567+10:00");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.offsetMinutes, 600);
  assert.equal(ingest.parseCapturedAt("2026-08-13T04:32:05Z").offsetMinutes, 0);
  assert.equal(ingest.parseCapturedAt("2026-08-13T04:32:05-05:30").offsetMinutes, -330);
  assert.equal(ingest.parseCapturedAt("not a date").ok, false);
  assert.equal(ingest.parseCapturedAt("").ok, false);
});

test("defaultIngestTitle uses the capture's own wall clock", () => {
  const local = ingest.parseCapturedAt("2026-08-13T14:32:05.1234567+10:00");
  assert.equal(ingest.defaultIngestTitle(local.date, local.offsetMinutes), "Screenshot 2026-08-13 14:32");
  const utc = ingest.parseCapturedAt("2026-01-02T03:04:05Z");
  assert.equal(ingest.defaultIngestTitle(utc.date, utc.offsetMinutes), "Screenshot 2026-01-02 03:04");
});

test("parseTagList mirrors the comma-string parsing in /api/save", () => {
  assert.deepEqual(ingest.parseTagList("screenshot, ui ,,"), ["screenshot", "ui"]);
  assert.deepEqual(ingest.parseTagList(""), []);
  assert.deepEqual(ingest.parseTagList(undefined), []);
});

test("buildIngestContent appends source provenance to the notes", () => {
  assert.equal(ingest.buildIngestContent("my note", "screenshot-app/region"), "my note\n\nvia screenshot-app/region");
  assert.equal(ingest.buildIngestContent("", "screenshot-app/region"), "via screenshot-app/region");
  assert.equal(ingest.buildIngestContent("my note", ""), "my note");
  assert.equal(ingest.buildIngestContent("", ""), "");
});

test("ingestFieldsSchema accepts a client payload and rejects bad fields", () => {
  const payload = {
    title: "Bug repro",
    notes: "see the toolbar",
    source: "screenshot-app/region",
    capturedAt: "2026-08-13T14:32:05.1234567+10:00",
    tags: "screenshot",
    category: "Work",
    type: "clip",
  };
  assert.equal(ingest.ingestFieldsSchema.safeParse(payload).success, true);
  assert.equal(ingest.ingestFieldsSchema.safeParse({}).success, true);
  assert.equal(ingest.ingestFieldsSchema.safeParse({ type: "screenshot" }).success, false);
  assert.equal(ingest.ingestFieldsSchema.safeParse({ workflowStatus: "done" }).success, false);
});
