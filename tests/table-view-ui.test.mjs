import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const tableSource = await readFile(new URL("../components/brain/TableView.tsx", import.meta.url), "utf8").catch(() => "");

test("Brain renders a dedicated table view mode", () => {
  assert.match(brainSource, /import \{ TableView \} from "\.\/brain\/TableView"/);
  assert.match(brainSource, /density === "table"/);
  assert.match(brainSource, /<TableView/);
  assert.match(brainSource, /items={visibleItems}/);
  assert.match(brainSource, /selectedIds={selectedIds}/);
});

test("TableView exposes database-style columns and row actions", () => {
  assert.match(tableSource, /interface TableViewProps/);
  assert.match(tableSource, /items: Item\[\]/);
  assert.match(tableSource, /selectedIds: Set<string>/);
  assert.match(tableSource, /Title/);
  assert.match(tableSource, /Type/);
  assert.match(tableSource, /Category/);
  assert.match(tableSource, /Tags/);
  assert.match(tableSource, /Status/);
  assert.match(tableSource, /onToggleSelected\(item\.id\)/);
  assert.match(tableSource, /onOpenCard\(item\.id\)/);
});

test("TableView uses a compact database layout with clearer interactive cells", () => {
  assert.match(tableSource, /border-separate border-spacing-0/);
  assert.match(tableSource, /sticky top-0 z-10/);
  assert.match(tableSource, /scope="col"/);
  assert.match(tableSource, /h-\[3\.25rem\]/);
  assert.match(tableSource, /rounded-md border/);
  assert.match(tableSource, /slice\(0, 3\)/);
  assert.match(tableSource, /\+\{\(item\.tags \|\| \[\]\)\.length - 3\}/);
  assert.match(tableSource, /href=\{localFileViewerHref\(item\.url\)\}/);
  assert.match(tableSource, /target="_blank"/);
  assert.match(tableSource, /Updated/);
  assert.match(tableSource, /formatCardDate\(item\.updatedAt\)/);
});

test("every card view shows the creation date as day month year", async () => {
  const sources = await Promise.all(
    ["components/brain/ItemCard.tsx", "components/brain/BoardView.tsx", "components/brain/TableView.tsx", "app/shared/[id]/page.tsx"]
      .map(file => readFile(new URL(`../${file}`, import.meta.url), "utf8"))
  );
  for (const source of sources) {
    assert.match(source, /formatCardDate\((item|row)\.createdAt\)/);
  }
});

test("TableView shows compact thumbnails beside titles", () => {
  assert.match(tableSource, /const attachmentThumbnail = \(item\.attachments \|\| \[\]\)\.find/);
  assert.match(tableSource, /const ogThumbnail = item\.ogImage/);
  assert.match(tableSource, /data-fallback-src=\{thumbnailFallback\}/);
  assert.match(tableSource, /h-8 w-12 shrink-0/);
  assert.match(tableSource, /object-cover/);
  assert.match(tableSource, /event\.currentTarget\.hidden = true/);
});
