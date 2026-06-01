import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/image-compression.ts", import.meta.url);
let source = "";
try {
  source = await readFile(sourcePath, "utf8");
} catch {
  assert.fail("lib/image-compression.ts should provide shared upload compression helpers");
}

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-image-compression-"));
const tempModule = path.join(tempDir, "image-compression.mjs");
await writeFile(tempModule, transpiled);
const imageCompression = await import(pathToFileURL(tempModule).href);

test("shouldCompressImage skips small and unsupported files", () => {
  assert.equal(
    imageCompression.shouldCompressImage({ type: "image/jpeg", size: 800 * 1024 }),
    false
  );
  assert.equal(
    imageCompression.shouldCompressImage({ type: "image/heic", size: 4 * 1024 * 1024 }),
    false
  );
  assert.equal(
    imageCompression.shouldCompressImage({ type: "application/pdf", size: 4 * 1024 * 1024 }),
    false
  );
});

test("shouldCompressImage compresses large supported photos", () => {
  assert.equal(
    imageCompression.shouldCompressImage({ type: "image/jpeg", size: 4 * 1024 * 1024 }),
    true
  );
  assert.equal(
    imageCompression.shouldCompressImage({ type: "image/png", size: 2 * 1024 * 1024 }),
    true
  );
});

test("calculateResizeDimensions preserves aspect ratio within the longest side limit", () => {
  assert.deepEqual(
    imageCompression.calculateResizeDimensions(4032, 3024),
    { width: 2000, height: 1500 }
  );
  assert.deepEqual(
    imageCompression.calculateResizeDimensions(1200, 900),
    { width: 1200, height: 900 }
  );
});

test("compressedImageName uses a jpeg extension", () => {
  assert.equal(
    imageCompression.compressedImageName("IMG_1234.HEIC"),
    "IMG_1234.jpg"
  );
  assert.equal(
    imageCompression.compressedImageName("photo"),
    "photo.jpg"
  );
});
