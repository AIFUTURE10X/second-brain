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

const resolve = (suggested, existing) => ingest.resolveAiCategory(suggested, existing);

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

test("parseAutoTagFlag only accepts 1/true", () => {
  assert.equal(ingest.parseAutoTagFlag("1"), true);
  assert.equal(ingest.parseAutoTagFlag("true"), true);
  assert.equal(ingest.parseAutoTagFlag("TRUE"), true);
  assert.equal(ingest.parseAutoTagFlag(" True "), true);
  assert.equal(ingest.parseAutoTagFlag("0"), false);
  assert.equal(ingest.parseAutoTagFlag("false"), false);
  assert.equal(ingest.parseAutoTagFlag("yes"), false);
  assert.equal(ingest.parseAutoTagFlag(""), false);
  assert.equal(ingest.parseAutoTagFlag(undefined), false);
  assert.equal(ingest.parseAutoTagFlag(null), false);
});

test("visionMediaType gates the formats Claude vision accepts", () => {
  assert.equal(ingest.visionMediaType("image/png"), "image/png");
  assert.equal(ingest.visionMediaType("image/jpg"), "image/jpeg");
  assert.equal(ingest.visionMediaType("image/WEBP; charset=binary"), "image/webp");
  assert.equal(ingest.visionMediaType("image/gif"), "image/gif");
  // Accepted by the endpoint but not by the vision API — skip the AI call.
  assert.equal(ingest.visionMediaType("image/avif"), null);
  assert.equal(ingest.visionMediaType("image/bmp"), null);
  assert.equal(ingest.visionMediaType("image/heic"), null);
  assert.equal(ingest.visionMediaType("image/svg+xml"), null);
  assert.equal(ingest.visionMediaType(undefined), null);
});

test("normalizeAiTags lowercases, dedupes and caps model output", () => {
  assert.deepEqual(ingest.normalizeAiTags(["UI", " Design ", "ui", ""]), ["ui", "design"]);
  assert.deepEqual(ingest.normalizeAiTags(["a", "b", "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ingest.normalizeAiTags([1, { x: 1 }, "ok"]), ["1", "ok"]);
  assert.deepEqual(ingest.normalizeAiTags("screenshot"), []);
  assert.deepEqual(ingest.normalizeAiTags(undefined), []);
});

test("resolveAiCategory folds near-duplicate suggestions onto existing categories", () => {
  const existing = [
    "Brand, ads, marketing",
    "Claude Code",
    "Claude Code Design",
    "Design",
    "AI Technology",
    "AI Future Studio Apps",
    "Travel & Lifestyle",
  ];

  // Exact match wins, and restores the stored casing.
  assert.equal(resolve("design", existing), "Design");
  assert.equal(resolve("Claude Code Design", existing), "Claude Code Design");

  // The real prod failure: "Brand" must not become a second Brand category.
  assert.equal(resolve("Brand", existing), "Brand, ads, marketing");
  assert.equal(resolve("Travel", existing), "Travel & Lifestyle");

  // Shortest candidate wins when several share the prefix.
  assert.equal(resolve("Claude", existing), "Claude Code");

  // One-directional: an existing longer name must not swallow the suggestion
  // when the suggestion isn't its prefix.
  assert.equal(resolve("Code", existing), "Code");

  // Too short to disambiguate — don't guess.
  assert.equal(resolve("AI", existing), "AI");

  // Word-boundary only: "Brandenburg" is not "Brand, ads, marketing".
  assert.equal(resolve("Brandenburg", existing), "Brandenburg");

  // Genuinely new categories pass straight through.
  assert.equal(resolve("Pickleball", existing), "Pickleball");
  assert.equal(resolve("  ", existing), "");
  assert.equal(resolve(undefined, existing), "");
  assert.equal(resolve("Anything", []), "Anything");
});

test("mergeIngestAiSuggestion lets the client win field by field", () => {
  const ai = { title: "Vercel deploy log", category: "Work", tags: ["Vercel", "deploy"] };

  // Nothing supplied → everything comes from the AI.
  assert.deepEqual(
    ingest.mergeIngestAiSuggestion({ title: "", category: "", tags: [] }, ai),
    { title: "Vercel deploy log", category: "Work", tags: ["vercel", "deploy"] },
  );

  // Typed a title, chose "Auto" for the category → keeps both choices.
  assert.deepEqual(
    ingest.mergeIngestAiSuggestion({ title: "My title", category: "", tags: [] }, ai),
    { title: "My title", category: "Work", tags: ["vercel", "deploy"] },
  );

  // Explicit category and tags survive untouched (client tags are not lowercased).
  assert.deepEqual(
    ingest.mergeIngestAiSuggestion({ title: "", category: "Personal", tags: ["Screenshot"] }, ai),
    { title: "Vercel deploy log", category: "Personal", tags: ["Screenshot"] },
  );

  // Whitespace-only client values count as unset.
  assert.deepEqual(
    ingest.mergeIngestAiSuggestion({ title: "   ", category: " ", tags: [] }, ai),
    { title: "Vercel deploy log", category: "Work", tags: ["vercel", "deploy"] },
  );

  // AI failed / no key → client values pass through, title stays empty so the
  // route falls back to the timestamp default.
  assert.deepEqual(
    ingest.mergeIngestAiSuggestion({ title: "", category: "Work", tags: [] }, {}),
    { title: "", category: "Work", tags: [] },
  );
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
    autoTag: "1",
  };
  assert.equal(ingest.ingestFieldsSchema.safeParse(payload).success, true);
  assert.equal(ingest.ingestFieldsSchema.safeParse({}).success, true);
  // The strict schema would 400 the whole upload if autoTag weren't declared.
  assert.equal(ingest.ingestFieldsSchema.safeParse({ autoTag: "true" }).success, true);
  assert.equal(ingest.ingestFieldsSchema.safeParse({ type: "screenshot" }).success, false);
  assert.equal(ingest.ingestFieldsSchema.safeParse({ workflowStatus: "done" }).success, false);
});
