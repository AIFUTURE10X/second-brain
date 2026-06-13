import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("../app/api/items/suggest-organization/route.ts", import.meta.url), "utf8").catch(() => "");

test("organization suggestions endpoint reuses the existing AI tagger", () => {
  assert.match(routeSource, /aiTagAndCategorize/);
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /db\.select\(\)\.from\(items\)\.where\(eq\(items\.id, id\)\)/);
  assert.match(routeSource, /db\.select\(\{ name: categories\.name \}\)\.from\(categories\)\.orderBy\(asc\(categories\.name\)\)/);
  assert.match(routeSource, /return NextResponse\.json\(\{ tags: ai\.tags, category: ai\.category \}\)/);
});
