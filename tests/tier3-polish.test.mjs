import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

import { appendNotifiedIds, pickDueReminderNotifications } from "../lib/reminder-notifications.mjs";
import { parseLinkedCardId } from "../lib/vault-link.mjs";

async function loadTsModule(relativePath, prefix) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const file = path.join(dir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await writeFile(file, transpiled);
  return import(pathToFileURL(file).href);
}

const totp = await loadTsModule("../lib/totp.ts", "second-brain-totp-");
const shareLinks = await loadTsModule("../lib/share-links.ts", "second-brain-share-");

const manifestSource = await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const saveRouteSource = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");
const sharedPageSource = await readFile(new URL("../app/shared/[id]/page.tsx", import.meta.url), "utf8");
const vaultSource = await readFile(new URL("../components/Vault.tsx", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const tauriLibSource = await readFile(new URL("../desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");
const tauriCapsSource = await readFile(new URL("../desktop/src-tauri/capabilities/default.json", import.meta.url), "utf8");

// ── Extension shortcuts + annotate (3.1) ─────────────────────────────────────

test("extension declares keyboard commands and handles them", () => {
  assert.match(manifestSource, /"commands"/);
  assert.match(manifestSource, /"save-page"/);
  assert.match(manifestSource, /"annotate-selection"/);
  assert.match(backgroundSource, /chrome\.commands\.onCommand/);
  assert.match(backgroundSource, /annotate: true/);
});

test("save endpoint annotates the existing card for a URL", () => {
  assert.match(saveRouteSource, /annotateExistingCard/);
  assert.match(saveRouteSource, /findUrlDuplicates/);
  assert.match(saveRouteSource, /annotated: true/);
});

// ── Desktop notifications (3.2) ──────────────────────────────────────────────

test("due-reminder picker respects status, snooze, dedupe, and staleness", () => {
  const now = new Date("2026-06-12T12:00:00Z");
  const reminders = [
    { id: "due", status: "pending", dueAt: "2026-06-12T11:59:00Z" },
    { id: "snoozed", status: "pending", dueAt: "2026-06-12T11:00:00Z", snoozedUntil: "2026-06-12T13:00:00Z" },
    { id: "snooze-passed", status: "pending", dueAt: "2026-06-12T11:00:00Z", snoozedUntil: "2026-06-12T11:30:00Z" },
    { id: "future", status: "pending", dueAt: "2026-06-12T12:01:00Z" },
    { id: "sent", status: "sent", dueAt: "2026-06-12T11:00:00Z" },
    { id: "already", status: "pending", dueAt: "2026-06-12T11:00:00Z" },
    { id: "stale", status: "pending", dueAt: "2026-06-10T11:00:00Z" },
  ];
  const due = pickDueReminderNotifications(reminders, ["already"], now);
  assert.deepEqual(due.map(r => r.id), ["due", "snooze-passed"]);
});

test("notified-id memory is capped", () => {
  const grown = appendNotifiedIds(Array.from({ length: 199 }, (_, i) => `id-${i}`), ["a", "b"]);
  assert.equal(grown.length, 200);
  assert.equal(grown.at(-1), "b");
});

test("Brain wires the notification toggle; Tauri registers the plugin", () => {
  assert.match(brainSource, /pickDueReminderNotifications/);
  assert.match(brainSource, /ensureNotificationPermission/);
  assert.match(tauriLibSource, /tauri_plugin_notification::init\(\)/);
  assert.match(tauriCapsSource, /"notification:default"/);
});

// ── Signed share links (3.3) ─────────────────────────────────────────────────

test("share tokens verify and reject tampering", () => {
  const original = process.env.SHARE_SECRET;
  process.env.SHARE_SECRET = "test-share-secret";
  try {
    const id = "12345678-1234-1234-1234-123456789abc";
    const token = shareLinks.shareTokenForCard(id);
    assert.ok(token.length === 64);
    assert.equal(shareLinks.verifyShareToken(id, token), true);
    assert.equal(shareLinks.verifyShareToken(id, token.slice(0, -1) + "0"), false);
    assert.equal(shareLinks.verifyShareToken("other-id", token), false);
    assert.equal(shareLinks.verifyShareToken(id, ""), false);
    assert.match(shareLinks.shareUrlForCard("https://brain.app/", id), /^https:\/\/brain\.app\/shared\/12345678.*\?share=[0-9a-f]{64}$/);
  } finally {
    if (original === undefined) delete process.env.SHARE_SECRET;
    else process.env.SHARE_SECRET = original;
  }
});

test("shared page verifies the token before reading the card", () => {
  assert.match(sharedPageSource, /verifyShareToken\(id, share\)/);
  assert.match(sharedPageSource, /notFound\(\)/);
  assert.match(sharedPageSource, /robots: \{ index: false/);
});

// ── Vault extras (3.4) ───────────────────────────────────────────────────────

test("TOTP matches the RFC 6238 SHA-1 test vectors (6-digit)", async () => {
  // RFC secret "12345678901234567890" in base32.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal((await totp.generateTotp(secret, { now: 59_000 })).code, "287082");
  assert.equal((await totp.generateTotp(secret, { now: 1_111_111_109_000 })).code, "081804");
  assert.equal((await totp.generateTotp(secret, { now: 1_234_567_890_000 })).code, "005924");
  const result = await totp.generateTotp(secret, { now: 59_000 });
  assert.equal(result.secondsRemaining, 1);
  assert.equal(await totp.generateTotp("not base32!!", {}), null);
  assert.equal(totp.normalizeTotpSecret("gezd gnbv-gy3t"), "GEZDGNBVGY3T");
});

test("vault entries can link to a card by id or URL", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.equal(parseLinkedCardId(id), id);
  assert.equal(parseLinkedCardId(`https://brain.app/card/${id}`), id);
  assert.equal(parseLinkedCardId("https://brain.app/other"), "");
  assert.equal(parseLinkedCardId("garbage"), "");
});

test("vault renders TOTP codes and auto-clears sensitive copies", () => {
  assert.match(vaultSource, /TotpCode/);
  assert.match(vaultSource, /copySensitive/);
  assert.match(vaultSource, /CLIPBOARD_CLEAR_MS/);
  assert.match(vaultSource, /Open linked card/);
});
