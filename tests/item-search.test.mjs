import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");

test("item search indexes URL and source metadata for YouTube channel owner lookup", () => {
  assert.match(routeSource, /coalesce\(url,\s*''\)/);
  assert.match(routeSource, /coalesce\(site_name,\s*''\)/);
});
