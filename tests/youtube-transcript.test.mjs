import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/youtube.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-youtube-"));
const tempModule = path.join(tempDir, "youtube.mjs");
await writeFile(tempModule, transpiled);
const youtube = await import(pathToFileURL(tempModule).href);

test("extractYouTubeId handles common YouTube URL forms", () => {
  assert.equal(youtube.extractYouTubeId("https://www.youtube.com/watch?v=abc123XYZ09"), "abc123XYZ09");
  assert.equal(youtube.extractYouTubeId("https://youtu.be/abc123XYZ09?t=42"), "abc123XYZ09");
  assert.equal(youtube.extractYouTubeId("https://www.youtube.com/shorts/abc123XYZ09"), "abc123XYZ09");
  assert.equal(youtube.extractYouTubeId("https://www.youtube.com/embed/abc123XYZ09"), "abc123XYZ09");
  assert.equal(youtube.extractYouTubeId("https://example.com/watch?v=abc123XYZ09"), null);
});

test("parseYouTubeTranscriptPayload joins json3 caption segments", () => {
  const text = youtube.parseYouTubeTranscriptPayload(JSON.stringify({
    events: [
      { segs: [{ utf8: "First" }, { utf8: " point." }] },
      { segs: [{ utf8: "\n" }] },
      { segs: [{ utf8: "Second point" }] },
    ],
  }));

  assert.equal(text, "First point. Second point");
});

test("parseYouTubeTranscriptPayload decodes XML caption fallback", () => {
  const text = youtube.parseYouTubeTranscriptPayload(
    '<transcript><text start="0" dur="1">Design &amp; code</text><text start="1" dur="1">Tom&#39;s notes</text></transcript>',
  );

  assert.equal(text, "Design & code Tom's notes");
});

test("extractApifyTranscriptText supports plain text and segment outputs", () => {
  assert.equal(
    youtube.extractApifyTranscriptText([{ transcript: "A complete transcript." }]),
    "A complete transcript.",
  );

  assert.equal(
    youtube.extractApifyTranscriptText([{ transcript: [{ text: "First part" }, { text: "second part" }] }]),
    "First part second part",
  );
});
