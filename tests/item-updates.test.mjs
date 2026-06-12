import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnrichUrlOnUpdate, withConcurrencyGuard } from "../lib/item-updates.mjs";

test("shouldEnrichUrlOnUpdate does not enrich when editing text on an existing link card", () => {
  assert.equal(
    shouldEnrichUrlOnUpdate({
      currentUrl: "https://billing.stripe.com/p/session/example",
      nextUrl: "https://billing.stripe.com/p/session/example",
      nextOgTitle: "",
    }),
    false
  );
});

test("shouldEnrichUrlOnUpdate enriches when the card URL changes", () => {
  assert.equal(
    shouldEnrichUrlOnUpdate({
      currentUrl: "https://old.example.com",
      nextUrl: "https://new.example.com",
      nextOgTitle: "",
    }),
    true
  );
});

test("shouldEnrichUrlOnUpdate skips enrichment when caller already supplied preview data", () => {
  assert.equal(
    shouldEnrichUrlOnUpdate({
      currentUrl: "https://old.example.com",
      nextUrl: "https://new.example.com",
      nextOgTitle: "Already enriched",
    }),
    false
  );
});

test("withConcurrencyGuard attaches expectedUpdatedAt when a base timestamp exists", () => {
  const payload = { id: "x", title: "t" };
  const guarded = withConcurrencyGuard(payload, "2026-06-12T10:00:00.000Z");
  assert.deepEqual(guarded, { id: "x", title: "t", expectedUpdatedAt: "2026-06-12T10:00:00.000Z" });
  // Original payload is not mutated
  assert.deepEqual(payload, { id: "x", title: "t" });
});

test("withConcurrencyGuard falls back to last-write-wins on force or missing base", () => {
  const payload = { id: "x", title: "t" };
  assert.equal(withConcurrencyGuard(payload, "2026-06-12T10:00:00.000Z", true), payload);
  assert.equal(withConcurrencyGuard(payload, null), payload);
  assert.equal(withConcurrencyGuard(payload, ""), payload);
});
