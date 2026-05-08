import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnrichUrlOnUpdate } from "../lib/item-updates.mjs";

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
