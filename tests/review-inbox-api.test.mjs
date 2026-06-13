import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../lib/brain-model.ts", import.meta.url), "utf8");
const validationSource = await readFile(new URL("../lib/validation.ts", import.meta.url), "utf8");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const saveRouteSource = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");
const searchItemsSource = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");

test("item schema and model include reviewedAt with a historical default", () => {
  assert.match(schemaSource, /reviewedAt:\s*timestamp\("reviewed_at",\s*\{\s*mode:\s*"date"\s*\}\)\.defaultNow\(\)/);
  assert.match(modelSource, /reviewedAt\?:\s*string\s*\|\s*null/);
});

test("item validation accepts reviewedAt for create and update", () => {
  assert.match(validationSource, /reviewedAt:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/);
});

test("item search aliases reviewed_at into the frontend item shape", () => {
  assert.match(searchItemsSource, /reviewed_at AS "reviewedAt"/);
});

test("item create and update convert reviewedAt into database timestamps", () => {
  assert.match(itemsRouteSource, /reviewedAt:\s*body\.reviewedAt\s*\?\s*new Date\(body\.reviewedAt\)\s*:\s*null/);
  assert.match(itemsRouteSource, /const reviewedAtForUpdate\s*=/);
  assert.match(itemsRouteSource, /\.\.\.\(reviewedAtForUpdate !== undefined \? \{ reviewedAt: reviewedAtForUpdate \} : \{\}\)/);
});

test("reviewedAt is stripped after existing URL and category normalization", () => {
  assert.match(
    itemsRouteSource,
    /if \(updates\.url[\s\S]+if \(updates\.category\)[\s\S]+const \{ reviewedAt, \.\.\.updatesWithoutReviewedAt \} = updates;/,
  );
});

test("automation saves land in the review inbox by default", () => {
  assert.match(saveRouteSource, /reviewedAt:\s*null/);
});
