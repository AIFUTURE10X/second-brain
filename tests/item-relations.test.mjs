import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalRelationPair,
  relationKey,
} from "../lib/item-relations.mjs";

test("canonicalRelationPair sorts two different item ids into a stable pair", () => {
  assert.deepEqual(canonicalRelationPair("bbb", "aaa"), {
    itemAId: "aaa",
    itemBId: "bbb",
  });
  assert.equal(relationKey("bbb", "aaa"), "aaa:bbb");
});

test("canonicalRelationPair rejects self-relations", () => {
  assert.throws(
    () => canonicalRelationPair("same", "same"),
    /Cannot relate an item to itself/
  );
});
