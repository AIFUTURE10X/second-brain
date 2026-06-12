import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/session.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-session-"));
const tempModule = path.join(tempDir, "session.mjs");
await writeFile(tempModule, transpiled);
const session = await import(pathToFileURL(tempModule).href);

const SECRET = "test-secret-at-least-32-bytes-long-0123456789";

test("mint + verify round-trips", async () => {
  const token = await session.mintSessionToken(SECRET);
  assert.equal(await session.verifySessionToken(SECRET, token), true);
});

test("token format is v1.<expiry>.<sig>", async () => {
  const now = 1_700_000_000_000;
  const token = await session.mintSessionToken(SECRET, now);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "v1");
  assert.equal(Number(parts[1]), now + session.SESSION_TTL_MS);
});

test("expired token is rejected", async () => {
  const now = 1_700_000_000_000;
  const token = await session.mintSessionToken(SECRET, now);
  const afterExpiry = now + session.SESSION_TTL_MS + 1;
  assert.equal(await session.verifySessionToken(SECRET, token, afterExpiry), false);
  // boundary: exactly at expiry is also rejected
  assert.equal(await session.verifySessionToken(SECRET, token, now + session.SESSION_TTL_MS), false);
});

test("wrong secret is rejected", async () => {
  const token = await session.mintSessionToken(SECRET);
  assert.equal(await session.verifySessionToken("different-secret", token), false);
});

test("tampered expiry is rejected", async () => {
  const token = await session.mintSessionToken(SECRET);
  const [v, exp, sig] = token.split(".");
  const tampered = [v, String(Number(exp) + 60_000), sig].join(".");
  assert.equal(await session.verifySessionToken(SECRET, tampered), false);
});

test("malformed tokens are rejected without throwing", async () => {
  for (const bad of [null, undefined, "", "v1", "v1.123", "v2.123.abc", "v1.notanumber.abc", "v1.123.!!!not-base64!!!", "v1..", "junk"]) {
    assert.equal(await session.verifySessionToken(SECRET, bad), false, `should reject: ${bad}`);
  }
});

test("missing secret fails closed", async () => {
  const token = await session.mintSessionToken(SECRET);
  assert.equal(await session.verifySessionToken(undefined, token), false);
  assert.equal(await session.verifySessionToken("", token), false);
});

test("sha256Hex produces the known digest", async () => {
  // echo -n "hello" | sha256sum
  assert.equal(
    await session.sha256Hex("hello"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

test("safeEqual compares correctly", async () => {
  assert.equal(await session.safeEqual("abc", "abc"), true);
  assert.equal(await session.safeEqual("abc", "abd"), false);
  assert.equal(await session.safeEqual("", ""), true);
  assert.equal(await session.safeEqual("a", "ab"), false);
});
