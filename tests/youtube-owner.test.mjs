import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/youtube-owner.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-youtube-owner-"));
const tempModule = path.join(tempDir, "youtube-owner.mjs");
await writeFile(tempModule, transpiled);
const youtubeOwner = await import(pathToFileURL(tempModule).href);

test("extractYouTubeOwnerHintFromUrl reads handle-style channel owners", () => {
  assert.equal(
    youtubeOwner.extractYouTubeOwnerHintFromUrl("https://www.youtube.com/@RasMic/videos"),
    "Ras Mic",
  );
});

test("extractYouTubeOwnerHintFromUrl reads custom channel path owners", () => {
  assert.equal(
    youtubeOwner.extractYouTubeOwnerHintFromUrl("https://youtube.com/c/DreamLabsAI"),
    "Dream Labs AI",
  );
  assert.equal(
    youtubeOwner.extractYouTubeOwnerHintFromUrl("https://youtube.com/user/NateHerkAI"),
    "Nate Herk AI",
  );
});

test("extractYouTubeOwnerNameFromTitle strips YouTube suffixes", () => {
  assert.equal(youtubeOwner.extractYouTubeOwnerNameFromTitle("Ras Mic - YouTube"), "Ras Mic");
  assert.equal(youtubeOwner.extractYouTubeOwnerNameFromTitle("Dream Labs AI"), "Dream Labs AI");
});
