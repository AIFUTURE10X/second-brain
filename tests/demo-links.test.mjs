import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEMO_SANDBOX_CSP, blobStoreHost, demoTarget, demoViewerHref, isHtmlAttachment } from "../lib/demo-links.mjs";

const HOST = "abc123.public.blob.vercel-storage.com";

test("an attached .html page on a blob store opens through /demo/", () => {
  assert.equal(demoViewerHref(`https://${HOST}/Tallowmere%20site-x1Y.html`), "/demo/abc123/Tallowmere%20site-x1Y.html");
  assert.equal(demoViewerHref(`https://${HOST}/demos/a.htm`), "/demo/abc123/demos/a.htm");
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
  // Next hands the route decoded segments; they are encoded exactly once.
  assert.deepEqual(demoTarget(["abc123", "demos", "Tallowmere site.html"], HOST), { serve: `https://${HOST}/demos/Tallowmere%20site.html` });
  assert.deepEqual(demoTarget(["abc123", "demo%20v2.html"], HOST), { serve: `https://${HOST}/demo%2520v2.html` });
  assert.deepEqual(demoTarget(["abc123", "what?#1.html"], HOST), { serve: `https://${HOST}/what%3F%231.html` });
  assert.equal(demoTarget(["abc123"], HOST), null);
  assert.equal(demoTarget([], HOST), null);
  assert.equal(demoTarget(["abc123", "secret.pdf"], HOST), null);
  assert.equal(demoTarget(["abc123", "..", "a.html"], HOST), null);
  assert.equal(demoTarget(["abc123", "evil.com/a.html"], HOST), null);
  assert.equal(demoTarget(["abc123", "a\\b.html"], HOST), null);
  assert.equal(demoTarget(["bad.host", "a.html"], HOST), null);
});

test("a page on another store goes back to that store, never served as ours", () => {
  assert.deepEqual(demoTarget(["other9", "pitch.html"], HOST), { redirect: "https://other9.public.blob.vercel-storage.com/pitch.html" });
  assert.deepEqual(demoTarget(["abc123", "pitch.html"], null), { redirect: `https://${HOST}/pitch.html` });
  // Viewer link, then route: the same file on the same store.
  const href = demoViewerHref("https://other9.public.blob.vercel-storage.com/a%20b.html");
  assert.equal(href, "/demo/other9/a%20b.html");
  const segments = href.slice("/demo/".length).split("/").map(decodeURIComponent);
  assert.deepEqual(demoTarget(segments, HOST), { redirect: "https://other9.public.blob.vercel-storage.com/a%20b.html" });
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
  assert.ok(route.includes("demoTarget(path, host)"));
  assert.ok(route.includes("50 * 1024 * 1024"));
  assert.ok((await read("app/api/upload/route.ts")).includes('"text/html"'));
  assert.ok((await read("components/brain/ItemCard.tsx")).includes("href={demoViewerHref(att.url)}"));
  const modal = await read("components/brain/ItemFormModal.tsx");
  assert.ok(modal.includes("href={demoViewerHref(att.url)}"));
  assert.ok(modal.includes(".html,.htm"));
});
