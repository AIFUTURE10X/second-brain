// PDF capture — shared by the popup and the save-page shortcut.
//
// Reads the PDF the active tab is showing and uploads it straight to Vercel
// Blob using a client token minted by /api/upload: the same two requests
// @vercel/blob's client upload() makes for the web app. Going direct keeps
// big PDFs clear of Vercel's 4.5 MB function body limit; the card itself is
// then created through /api/save with the blob as an attachment.
//
// Classic script (the extension has no bundler) — exposes
// globalThis.SecondBrainPdf for popup.js and background.js.

(function (root) {
  const MAX_PDF_BYTES = 50 * 1024 * 1024; // /api/upload MAX_SIZE
  const BLOB_API_URL = "https://vercel.com/api/blob";
  // Must match BLOB_API_VERSION in the installed @vercel/blob —
  // tests/extension-pdf.test.mjs diffs our requests against the SDK's.
  const BLOB_API_VERSION = "12";

  function isLocalFileUrl(url) {
    return /^file:/i.test(url || "");
  }

  // contentType is the tab's document.contentType — Chrome's PDF viewer
  // reports application/pdf even when the URL has no .pdf. The URL check is
  // the fallback for tabs we can't inject into (file:// without file access).
  function isPdfTab(url, contentType) {
    if (contentType) return contentType === "application/pdf";
    try {
      return /\.pdf$/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  // Prefer the file's own name from the URL; otherwise name it after the tab
  // title (Chrome shows the PDF's metadata title there).
  function pdfFileName(url, title) {
    let base = "";
    try {
      base = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    } catch {}
    if (!/\.pdf$/i.test(base)) base = (title || "").trim() || base;
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
    base = base.replace(/\.pdf$/i, "").slice(0, 120).trim() || "document";
    return `${base}.pdf`;
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function tooLarge(bytes) {
    return new Error(`This PDF is ${formatSize(bytes)} — the limit is ${formatSize(MAX_PDF_BYTES)}.`);
  }

  // Injected into the tab by chrome.scripting.executeScript, so it must be
  // self-contained. A same-origin fetch reuses the page's cookies (PDFs
  // behind a login work); bytes return as a data: URL because injection
  // results must be JSON-serialisable.
  async function readPdfInPage(maxBytes) {
    try {
      const res = await fetch(location.href, { credentials: "include" });
      if (!res.ok) return { error: `the site returned ${res.status}` };
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared > maxBytes) return { tooLarge: declared };
      const blob = await res.blob();
      if (blob.size > maxBytes) return { tooLarge: blob.size };
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { dataUrl };
    } catch (e) {
      return { error: (e && e.message) || String(e) };
    }
  }

  async function tabIsPdf(tab) {
    let contentType = "";
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.contentType,
      });
      contentType = injection?.result || "";
    } catch {}
    return isPdfTab(tab.url, contentType);
  }

  // Returns the tab's PDF as a Blob. Local files are read from the extension
  // itself (needs "Allow access to file URLs"); web PDFs from inside the tab.
  async function readTabPdf(tab) {
    let blob;
    if (isLocalFileUrl(tab.url)) {
      try {
        blob = await (await fetch(tab.url)).blob();
      } catch {
        const err = new Error("Chrome blocked reading this local file. Turn on \"Allow access to file URLs\" for Second Brain.");
        err.code = "file-access";
        throw err;
      }
    } else {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readPdfInPage,
        args: [MAX_PDF_BYTES],
      });
      const result = injection?.result || {};
      if (result.tooLarge) throw tooLarge(result.tooLarge);
      if (!result.dataUrl) throw new Error(`Couldn't read the PDF${result.error ? `: ${result.error}` : ""}.`);
      blob = await (await fetch(result.dataUrl)).blob();
    }
    if (blob.size > MAX_PDF_BYTES) throw tooLarge(blob.size);
    // A login wall or error page can sit at a .pdf URL. The spec allows the
    // %PDF- header anywhere in the first 1 KB.
    const head = await blob.slice(0, 1024).text();
    if (!head.includes("%PDF-")) throw new Error("This tab isn't serving a PDF file.");
    return new Blob([blob], { type: "application/pdf" });
  }

  async function responseError(res) {
    try {
      const body = await res.json();
      const message = typeof body.error === "string" ? body.error : body.error?.message;
      if (message) return message;
    } catch {}
    return `server returned ${res.status}`;
  }

  // Resolves to the attachment record /api/save stores on the card.
  async function uploadPdf(blob, fileName, { host, key, fetchImpl = fetch, blobApiUrl = BLOB_API_URL }) {
    const tokenRes = await fetchImpl(`${host}/api/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname: fileName, clientPayload: null, multipart: false },
      }),
    });
    if (tokenRes.status === 401) throw new Error("Invalid API key. Open Settings and reconnect.");
    if (!tokenRes.ok) throw new Error(`Couldn't start the upload: ${await responseError(tokenRes)}`);
    const { clientToken } = await tokenRes.json();
    if (!clientToken) throw new Error("Couldn't start the upload: no upload token returned.");

    const putRes = await fetchImpl(`${blobApiUrl}/?${new URLSearchParams({ pathname: fileName })}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${clientToken}`,
        "x-api-version": BLOB_API_VERSION,
        "x-vercel-blob-access": "public",
        "x-content-type": "application/pdf",
      },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`Upload failed: ${await responseError(putRes)}`);
    const stored = await putRes.json();
    return { url: stored.url, name: fileName, contentType: "application/pdf", size: blob.size };
  }

  root.SecondBrainPdf = {
    MAX_PDF_BYTES,
    isLocalFileUrl,
    isPdfTab,
    pdfFileName,
    formatSize,
    tabIsPdf,
    readTabPdf,
    uploadPdf,
  };
})(globalThis);
