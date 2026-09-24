import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import vm from "node:vm";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pdfCaptureSource = await read("extension/pdf-capture.js");
const manifest = JSON.parse(await read("extension/manifest.json"));
const popupHtml = await read("extension/popup.html");
const backgroundSource = await read("extension/background.js");
const saveRouteSource = await read("app/api/save/route.ts");

// pdf-capture.js is a classic script that sets globalThis.SecondBrainPdf.
function loadPdfCapture(globals = {}) {
  const context = vm.createContext({ fetch, Blob, Response, URL, URLSearchParams, ...globals });
  vm.runInContext(pdfCaptureSource, context);
  return context.SecondBrainPdf;
}

const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const dataUrl = bytes => `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;

// ── Detection + naming ───────────────────────────────────────────────────────

test("PDF tabs are detected by document type, falling back to the URL", () => {
  const pdf = loadPdfCapture();
  assert.equal(pdf.isPdfTab("https://example.com/viewer?id=7", "application/pdf"), true);
  assert.equal(pdf.isPdfTab("https://example.com/paper.pdf", "text/html"), false); // landing page at a .pdf URL
  assert.equal(pdf.isPdfTab("file:///C:/Docs/Report.PDF", ""), true); // not injectable → URL check
  assert.equal(pdf.isPdfTab("https://example.com/paper", ""), false);
  assert.equal(pdf.isPdfTab("not a url", ""), false);
  assert.equal(pdf.isLocalFileUrl("file:///C:/Docs/a.pdf"), true);
  assert.equal(pdf.isLocalFileUrl("https://example.com/a.pdf"), false);
});

test("PDF file names come from the URL, else the tab title", () => {
  const pdf = loadPdfCapture();
  assert.equal(pdf.pdfFileName("https://arxiv.org/pdf/2401.00001v2.pdf", "Some Title"), "2401.00001v2.pdf");
  assert.equal(pdf.pdfFileName("file:///C:/Users/me/My%20Report.pdf", "My Report.pdf"), "My Report.pdf");
  assert.equal(pdf.pdfFileName("https://example.com/viewer?id=7", "Attention: Is All You Need?"), "Attention Is All You Need.pdf");
  assert.equal(pdf.pdfFileName("https://example.com/", ""), "document.pdf");
  assert.equal(pdf.pdfFileName("https://example.com/%E0%A4%A", "Fallback"), "Fallback.pdf"); // malformed escape
  assert.equal(pdf.pdfFileName("https://example.com/x", "a".repeat(300)).length, 124);
  assert.equal(pdf.formatSize(2048), "2 KB");
  assert.equal(pdf.formatSize(6_292_117), "6.0 MB");
});

// ── Reading the tab's PDF ────────────────────────────────────────────────────

function fakeChrome(result) {
  const calls = [];
  return {
    calls,
    chrome: {
      scripting: {
        executeScript: async injection => {
          calls.push(injection);
          return [{ result }];
        },
      },
    },
  };
}

test("web PDFs are read inside the tab and returned as a PDF blob", async () => {
  const { chrome, calls } = fakeChrome({ dataUrl: dataUrl(pdfBytes) });
  const pdf = loadPdfCapture({ chrome });
  const blob = await pdf.readTabPdf({ id: 7, url: "https://example.com/paper.pdf" });
  assert.equal(blob.type, "application/pdf");
  assert.equal(blob.size, pdfBytes.length);
  assert.equal(calls[0].target.tabId, 7);
  assert.deepEqual([...calls[0].args], [50 * 1024 * 1024]); // spread: array is from the vm realm
  assert.equal(typeof calls[0].func, "function");
});

test("login walls and oversized files are rejected before upload", async () => {
  const html = loadPdfCapture(fakeChrome({ dataUrl: dataUrl("<html>Please sign in</html>") }));
  await assert.rejects(html.readTabPdf({ id: 1, url: "https://example.com/paper.pdf" }), /isn't serving a PDF/);

  const big = loadPdfCapture(fakeChrome({ tooLarge: 60 * 1024 * 1024 }));
  await assert.rejects(big.readTabPdf({ id: 1, url: "https://example.com/big.pdf" }), /60\.0 MB — the limit is 50\.0 MB/);

  const failed = loadPdfCapture(fakeChrome({ error: "the site returned 403" }));
  await assert.rejects(failed.readTabPdf({ id: 1, url: "https://example.com/p.pdf" }), /Couldn't read the PDF: the site returned 403/);
});

test("local PDFs are read by the extension and explain the file-access toggle when blocked", async () => {
  const allowed = loadPdfCapture({ fetch: async () => new Response(pdfBytes) });
  const blob = await allowed.readTabPdf({ id: 1, url: "file:///C:/Docs/a.pdf" });
  assert.equal(blob.size, pdfBytes.length);

  const blocked = loadPdfCapture({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(blocked.readTabPdf({ id: 1, url: "file:///C:/Docs/a.pdf" }), err => {
    assert.equal(err.code, "file-access");
    assert.match(err.message, /Allow access to file URLs/);
    return true;
  });
});

// ── Upload protocol ──────────────────────────────────────────────────────────

test("extension uploads speak the same Blob protocol as @vercel/blob's upload()", async t => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/api/upload"
      ? { type: "blob.generate-client-token", clientToken: "vercel_blob_client_store1_token" }
      : { url: "https://store1.public.blob.vercel-storage.com/paper-a1b2.pdf", pathname: "paper-a1b2.pdf", contentType: "application/pdf" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = new Blob([pdfBytes], { type: "application/pdf" });

  process.env.VERCEL_BLOB_API_URL = `${base}/blob-api`;
  t.after(() => delete process.env.VERCEL_BLOB_API_URL);
  const { upload } = await import("@vercel/blob/client");
  await upload("paper.pdf", body, {
    access: "public",
    contentType: "application/pdf",
    handleUploadUrl: `${base}/api/upload`,
    headers: { "x-api-key": "secret" },
  });
  const sdk = seen.splice(0);

  const attachment = await loadPdfCapture().uploadPdf(body, "paper.pdf", {
    host: base,
    key: "secret",
    blobApiUrl: `${base}/blob-api`,
  });
  const ours = seen.splice(0);

  assert.equal(sdk.length, 2);
  assert.equal(ours.length, 2);
  const [sdkToken, sdkPut] = sdk;
  const [ourToken, ourPut] = ours;

  assert.equal(ourToken.method, sdkToken.method);
  assert.equal(ourToken.url, sdkToken.url);
  assert.equal(ourToken.headers["x-api-key"], sdkToken.headers["x-api-key"]);
  assert.deepEqual(JSON.parse(ourToken.body), JSON.parse(sdkToken.body));

  assert.equal(ourPut.method, sdkPut.method);
  assert.equal(ourPut.url, sdkPut.url);
  for (const header of ["authorization", "x-api-version", "x-vercel-blob-access", "x-content-type"]) {
    assert.equal(ourPut.headers[header], sdkPut.headers[header], header);
  }
  assert.deepEqual(ourPut.body, sdkPut.body);

  assert.deepEqual({ ...attachment }, {
    url: "https://store1.public.blob.vercel-storage.com/paper-a1b2.pdf",
    name: "paper.pdf",
    contentType: "application/pdf",
    size: pdfBytes.length,
  });
});

test("upload failures surface the server's reason", async () => {
  const pdf = loadPdfCapture();
  const body = new Blob([pdfBytes]);
  const json = (status, value) => async () => new Response(JSON.stringify(value), { status });
  const opts = fetchImpl => ({ host: "https://brain.example", key: "k", fetchImpl });

  await assert.rejects(pdf.uploadPdf(body, "a.pdf", opts(json(401, { error: "Unauthorized" }))), /Invalid API key/);
  await assert.rejects(
    pdf.uploadPdf(body, "a.pdf", opts(json(500, { error: "File uploads are not configured: missing BLOB_READ_WRITE_TOKEN." }))),
    /Couldn't start the upload: File uploads are not configured/
  );

  let call = 0;
  const tokenThenReject = async () => (call++ === 0
    ? new Response(JSON.stringify({ clientToken: "t" }))
    : new Response(JSON.stringify({ error: { code: "file_too_large", message: "File is too large" } }), { status: 400 }));
  await assert.rejects(pdf.uploadPdf(body, "a.pdf", opts(tokenThenReject)), /Upload failed: File is too large/);
});

// ── Wiring ───────────────────────────────────────────────────────────────────

test("extension can reach Blob uploads and local files, and loads the PDF helper everywhere", () => {
  assert.ok(manifest.host_permissions.includes("https://vercel.com/api/blob/*"));
  assert.ok(manifest.host_permissions.includes("file:///*"));
  assert.ok(popupHtml.indexOf('src="pdf-capture.js"') < popupHtml.indexOf('src="popup.js"'));
  assert.match(popupHtml, /id="attachPdf"/);
  assert.match(backgroundSource, /importScripts\("pdf-capture\.js"\)/);
  assert.match(backgroundSource, /SecondBrainPdf\.readTabPdf/);
  assert.match(saveRouteSource, /attachments,/);
});
