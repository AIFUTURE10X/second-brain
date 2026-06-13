import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const cardPageSource = await readFile(new URL("../app/card/[id]/page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/local-file/route.ts", import.meta.url), "utf8");

test("ItemCard opens local file links through the app viewer route", () => {
  assert.match(itemCardSource, /import \{ localFileViewerHref \} from "@\/lib\/local-file-links"/);
  assert.match(itemCardSource, /href=\{localFileViewerHref\(link\)\}/);
  assert.match(itemCardSource, /href=\{localFileViewerHref\(item\.url\)\}/);
});

test("card detail page opens local file links through the app viewer route", () => {
  assert.match(cardPageSource, /import \{ localFileViewerHref \} from "@\/lib\/local-file-links"/);
  assert.match(cardPageSource, /href=\{localFileViewerHref\(link\)\}/);
});

test("local file API route serves only files under an allowed root", () => {
  assert.match(routeSource, /localFilePathFromUrl/);
  assert.match(routeSource, /isPathInsideRoot/);
  assert.match(routeSource, /NextResponse\.json\(\{ error: "Local file is outside the allowed folder" \}/);
  assert.match(routeSource, /Content-Disposition/);
});
