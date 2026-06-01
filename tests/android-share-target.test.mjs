import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")
);

test("PWA manifest advertises Android photo sharing", () => {
  assert.equal(manifest.share_target.action, "/share");
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.enctype, "multipart/form-data");

  const files = manifest.share_target.params.files;
  assert.ok(Array.isArray(files), "share_target.params.files should be an array");
  assert.ok(files.some(file => (
    file.name === "files" &&
    Array.isArray(file.accept) &&
    file.accept.includes("image/*")
  )));
});
