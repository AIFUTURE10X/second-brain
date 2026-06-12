import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatDoneAmbiguous,
  formatFindResults,
  matchTaskCandidates,
  parseDoneCommand,
  parseFindCommand,
  shortId,
} from "../lib/telegram-commands.mjs";
import {
  initialReadingStatus,
  isToRead,
  nextReadingStatus,
  readingStatusLabel,
} from "../lib/reading-status.mjs";

const telegramSource = await readFile(new URL("../app/api/telegram/route.ts", import.meta.url), "utf8");
const manifestSource = await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const searchLibSource = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");

// ── Telegram /find + /done (2.7) ─────────────────────────────────────────────

test("find/done commands parse and other messages pass through", () => {
  assert.equal(parseFindCommand("/find react hooks"), "react hooks");
  assert.equal(parseFindCommand("/search agentic os"), "agentic os");
  assert.equal(parseFindCommand("/f x"), "x");
  assert.equal(parseFindCommand("/t buy milk"), null);
  assert.equal(parseFindCommand("plain message"), null);

  assert.equal(parseDoneCommand("/done buy milk"), "buy milk");
  assert.equal(parseDoneCommand("/done 4f5e6d7c"), "4f5e6d7c");
  assert.equal(parseDoneCommand("/donate x"), null);
});

test("done argument matches id prefixes first, then title substrings", () => {
  const tasks = [
    { id: "4f5e6d7c-aaaa", title: "Buy milk" },
    { id: "9b8c7d6e-bbbb", title: "Buy bread and milk" },
    { id: "11112222-cccc", title: "Call dentist" },
  ];
  assert.deepEqual(matchTaskCandidates("4f5e6d", tasks).map(t => t.id), ["4f5e6d7c-aaaa"]);
  assert.equal(matchTaskCandidates("milk", tasks).length, 2);
  assert.deepEqual(matchTaskCandidates("dentist", tasks).map(t => t.title), ["Call dentist"]);
  assert.deepEqual(matchTaskCandidates("", tasks), []);
});

test("find results format with card links and a more-count", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: `id-${i}`,
    type: "link",
    title: `Result ${i}`,
    url: `https://example.com/${i}`,
  }));
  const text = formatFindResults(rows, { baseUrl: "https://brain.app/", query: "test" });
  assert.match(text, /Results for "test"/);
  assert.match(text, /1\. ◈ Result 0/);
  assert.match(text, /https:\/\/brain\.app\/card\/id-0/);
  assert.match(text, /…and 2 more/);
  assert.equal(formatFindResults([], { query: "nada" }), 'No results for "nada".');
  assert.match(formatDoneAmbiguous([{ id: "abcdefgh-123", title: "A" }, { id: "ijklmnop-456", title: "B" }]), /Found 2 open tasks/);
  assert.equal(shortId("abcdefgh-123"), "abcdefgh");
});

test("telegram webhook wires /find and /done through shared search", () => {
  assert.match(telegramSource, /parseFindCommand/);
  assert.match(telegramSource, /hybridSearchItems/);
  assert.match(telegramSource, /parseDoneCommand/);
  assert.match(telegramSource, /matchTaskCandidates/);
  assert.match(telegramSource, /\/find <query>/);
});

// ── Extension context menu (2.6) ─────────────────────────────────────────────

test("extension registers context menus in a background worker", () => {
  assert.match(manifestSource, /"contextMenus"/);
  assert.match(manifestSource, /"service_worker": "background\.js"/);
  assert.match(backgroundSource, /save-link/);
  assert.match(backgroundSource, /save-selection/);
  assert.match(backgroundSource, /save-page/);
  assert.match(backgroundSource, /\/api\/save/);
  assert.match(backgroundSource, /x-api-key/);
});

// ── Read-later (2.9) ─────────────────────────────────────────────────────────

test("reading status cycles and only links start tracked", () => {
  assert.equal(initialReadingStatus("link"), "unread");
  assert.equal(initialReadingStatus("note"), null);
  assert.equal(nextReadingStatus("unread"), "reading");
  assert.equal(nextReadingStatus("reading"), "done");
  assert.equal(nextReadingStatus("done"), "unread");
  assert.equal(nextReadingStatus(null), "unread");
  assert.equal(isToRead({ readingStatus: "unread" }), true);
  assert.equal(isToRead({ readingStatus: "reading" }), true);
  assert.equal(isToRead({ readingStatus: "done" }), false);
  assert.equal(isToRead({}), false);
  assert.equal(readingStatusLabel("reading"), "◐ reading");
});

test("items API defaults link creates to unread and search returns the column", () => {
  assert.match(itemsRouteSource, /initialReadingStatus/);
  assert.match(searchLibSource, /reading_status AS "readingStatus"/);
  assert.match(searchLibSource, /archived_at AS "archivedAt"/);
});
