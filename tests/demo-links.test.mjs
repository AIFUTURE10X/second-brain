import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEMO_SANDBOX_CSP, blobStoreHost, demoBlobUrl, demoViewerHref, isHtmlAttachment } from "../lib/demo-links.mjs";

const HOST = "abc123.public.blob.vercel-storage.com";

test("an attached .html page on a blob store opens through /demo/", () => {
  assert.equal(demoViewerHref(`https://${HOST}/Tallowmere%20site-x1Y.html`), "/demo/Tallowmere%20site-x1Y.html");
  assert.equal(demoViewerHref(`https://${HOST}/demos/a.htm`), "/demo/demos/a.htm");
});

test("everything else keeps its own link", () => {
  for (const url of [`https://${HOST}/report.pdf`, "https://example.com/page.html", `http://${HOST}/a.html`, "not a url", ""]) {
    assert.equal(demoViewerHref(url), url);
  }
});

test("the store host comes from the read-write token", () => {
  assert.equal(blobStoreHost("vercel_blob_rw_AbC123_secretpart"), HOST);
  assert.equal(blobStoreHost(""), null);
  assert.equal(blobStoreHost(undefined), null);
  assert.equal(blobStoreHost("something-else"), null);
});

test("the viewer serves only .html from the app's own store", () => {
  assert.equal(demoBlobUrl(["demos", "Tallowmere site.html"], HOST), `https://${HOST}/demos/Tallowmere%20site.html`);
  assert.equal(demoBlobUrl(["demos", "Tallowmere%20site.html"], HOST), `https://${HOST}/demos/Tallowmere%20site.html`);
  assert.equal(demoBlobUrl(["..%2Fa.html"], HOST), null);
  assert.equal(demoBlobUrl(["a.html"], null), null);
  assert.equal(demoBlobUrl([], HOST), null);
  assert.equal(demoBlobUrl(["secret.pdf"], HOST), null);
  assert.equal(demoBlobUrl(["..", "a.html"], HOST), null);
  assert.equal(demoBlobUrl(["evil.com/a.html"], HOST), null);
  assert.equal(demoBlobUrl(["a.html?x=1"], HOST), null);
  assert.equal(demoBlobUrl(["a\\b.html"], HOST), null);
});

test("html attachments are recognised by type, name or path", () => {
  assert.ok(isHtmlAttachment({ contentType: "text/html" }));
  assert.ok(isHtmlAttachment({ contentType: "", name: "demo.HTML" }));
  assert.ok(isHtmlAttachment({ url: `https://${HOST}/x.htm` }));
  assert.ok(!isHtmlAttachment({ contentType: "application/pdf", name: "a.pdf" }));
});

test("the demo sandbox never grants same-origin", () => {
  assert.ok(DEMO_SANDBOX_CSP.startsWith("sandbox "));
  assert.ok(DEMO_SANDBOX_CSP.includes("allow-scripts"));
  assert.ok(!DEMO_SANDBOX_CSP.includes("allow-same-origin"));
  assert.ok(!DEMO_SANDBOX_CSP.includes("allow-top-navigation"));
});

test("route, upload allowlist and attachment links are wired", async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const route = await read("app/demo/[...path]/route.ts");
  assert.ok(route.includes('"content-security-policy": DEMO_SANDBOX_CSP'));
  assert.ok(route.includes("demoBlobUrl(path, host)"));
  assert.ok((await read("app/api/upload/route.ts")).includes('"text/html"'));
  assert.ok((await read("components/brain/ItemCard.tsx")).includes("href={demoViewerHref(att.url)}"));
  const modal = await read("components/brain/ItemFormModal.tsx");
  assert.ok(modal.includes("href={demoViewerHref(att.url)}"));
  assert.ok(modal.includes(".html,.htm"));
});
