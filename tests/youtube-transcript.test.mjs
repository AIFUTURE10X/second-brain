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

test("extractYouTubeDescriptionLinksFromHtml reads links from video descriptions", () => {
  const html = `
    <script>
      var ytInitialPlayerResponse = {
        "videoDetails": {
          "shortDescription": "Main app: https://example.com/app\\nDocs https://docs.example.com/start."
        }
      };
    </script>
  `;

  assert.deepEqual(youtube.extractYouTubeDescriptionLinksFromHtml(html), [
    { url: "https://example.com/app", label: "Main app" },
    { url: "https://docs.example.com/start", label: "Docs" },
  ]);
});

test("extractLinksFromYouTubeDescription unwraps YouTube redirect links and dedupes", () => {
  const description = [
    "Official app: https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fapp.example.com%2Fdownload&redir_token=abc",
    "Again https://app.example.com/download",
  ].join("\n");

  assert.deepEqual(youtube.extractLinksFromYouTubeDescription(description), [
    { url: "https://app.example.com/download", label: "Official app" },
  ]);
});

test("appendYouTubeDescriptionLinksToNotes preserves user notes and avoids duplicate blocks", () => {
  const links = [
    { url: "https://example.com", label: "Website" },
    { url: "https://apps.apple.com/app/example", label: "" },
  ];

  const note = youtube.appendYouTubeDescriptionLinksToNotes("My saved note", links);

  assert.equal(note, [
    "My saved note",
    "",
    "Links from YouTube description:",
    "- Website: https://example.com",
    "- https://apps.apple.com/app/example",
  ].join("\n"));

  assert.equal(youtube.appendYouTubeDescriptionLinksToNotes(note, links), note);
});

const transcriptUiSource = await readFile(
  new URL("../components/brain/TranscriptSection.tsx", import.meta.url), "utf8");

test("transcript section does not offer a paid fetch while the stored copy is loading", () => {
  // The initial read is always in flight on mount. If `loading` started false,
  // the first render would claim no transcript exists and show a Fetch button
  // for a card that already has one — inviting a pointless $0.01 re-fetch.
  assert.match(transcriptUiSource, /const \[loading, setLoading\] = useState\(true\)/);
  // And the button itself stays out of the DOM until that read settles.
  assert.match(transcriptUiSource, /\{!loading && \(\s*<button/);
});

test("transcript section stops clicks escaping to the card it sits in", () => {
  // The expanded grid card collapses on any body click, so controls that let
  // the event bubble would shut the card the moment you used them.
  assert.match(transcriptUiSource, /const stop = \(e: React\.MouseEvent\) => e\.stopPropagation\(\)/);
  assert.match(transcriptUiSource, /aria-label="Video transcript"[\s\S]{0,200}onClick=\{stop\}|onClick=\{stop\}[\s\S]{0,200}aria-label="Video transcript"/);
});
