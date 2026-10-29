import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const fetchItemsBody = brainSource.slice(
  brainSource.indexOf("const fetchItems = useCallback"),
  brainSource.indexOf("}, [archivedOnly, trySelfMigrate]);"),
);

test("only the newest items request may update the grid", () => {
  assert.match(fetchItemsBody, /const seq = \+\+fetchSeqRef\.current;/);
  // Checked after the response arrives, after the body is read, and before an error toast.
  const guards = fetchItemsBody.match(/if \(seq !== fetchSeqRef\.current\) return;/g) || [];
  assert.equal(guards.length, 3);
  assert.ok(fetchItemsBody.indexOf("const rows = await res.json();") < fetchItemsBody.indexOf("setItems(rows);"));
});

test("a polling delta that started before a newer search or reload is dropped", () => {
  assert.match(brainSource, /const seq = fetchSeqRef\.current;\s+try \{\s+const res = await fetch\(`\/api\/items\?since=/);
  assert.match(brainSource, /if \(!delta \|\| seq !== fetchSeqRef\.current\) return;/);
});
