import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// lib/html-text.ts has no imports, so a straight transpile is enough — same
// approach as tests/ingest.test.mjs, minus the specifier rewriting.
const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(here, ".tmp");
await mkdir(tempDir, { recursive: true });

const source = await readFile(path.join(here, "..", "lib", "html-text.ts"), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleFile = path.join(tempDir, `html-text-test-${process.pid}.mjs`);
await writeFile(moduleFile, transpiled);
const htmlText = await import(pathToFileURL(moduleFile).href);

after(async () => {
  await rm(moduleFile, { force: true });
});

const enrichSource = await readFile(path.join(here, "..", "lib", "enrich.ts"), "utf8");

const REPLACEMENT = "�";

function latin1Bytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

test("decodeHtmlEntities handles the named basics", () => {
  assert.equal(
    htmlText.decodeHtmlEntities("Tom &amp; Jerry &lt;b&gt; &quot;quoted&quot; &apos;s"),
    "Tom & Jerry <b> \"quoted\" 's"
  );
  assert.equal(htmlText.decodeHtmlEntities("AI Mode &mdash; Google"), "AI Mode — Google");
  assert.equal(htmlText.decodeHtmlEntities("a&nbsp;b"), "a b");
  assert.equal(htmlText.decodeHtmlEntities("caf&eacute;"), "café");
});

test("decodeHtmlEntities handles decimal and hex numeric references", () => {
  assert.equal(htmlText.decodeHtmlEntities("AI Mode &#8212; Google"), "AI Mode — Google");
  assert.equal(htmlText.decodeHtmlEntities("AI Mode &#x2014; Google"), "AI Mode — Google");
  assert.equal(htmlText.decodeHtmlEntities("&#128512;"), "\u{1F600}");
  // C1 numeric references mean windows-1252 punctuation in real-world HTML.
  assert.equal(htmlText.decodeHtmlEntities("it&#146;s"), "it’s");
});

test("decodeHtmlEntities leaves unknown and malformed references alone", () => {
  assert.equal(htmlText.decodeHtmlEntities("R&D dept"), "R&D dept");
  assert.equal(htmlText.decodeHtmlEntities("&notarealentity;"), "&notarealentity;");
  assert.equal(htmlText.decodeHtmlEntities("&#xD800;"), "&#xD800;");
  assert.equal(htmlText.decodeHtmlEntities("&#0;"), "&#0;");
  assert.equal(htmlText.decodeHtmlEntities("plain"), "plain");
});

test("stripReplacementChars removes leftover mojibake markers", () => {
  assert.equal(htmlText.stripReplacementChars(`AI Mode ${REPLACEMENT}`), "AI Mode");
  assert.equal(
    htmlText.stripReplacementChars(`AI Mode ${REPLACEMENT} Google`),
    "AI Mode Google"
  );
  assert.equal(htmlText.stripReplacementChars("AI Mode"), "AI Mode");
  assert.equal(htmlText.stripReplacementChars(""), "");
});

test("remapC1Controls turns latin1 C1 bytes into windows-1252 punctuation", () => {
  assert.equal(htmlText.remapC1Controls("AI Mode \u0096 Google"), "AI Mode – Google");
  assert.equal(htmlText.remapC1Controls("it\u0092s “fine”"), "it’s “fine”");
  assert.equal(htmlText.remapC1Controls("nothing to remap"), "nothing to remap");
});

test("charsetFromContentType reads the charset parameter", () => {
  assert.equal(htmlText.charsetFromContentType("text/html; charset=windows-1252"), "windows-1252");
  assert.equal(htmlText.charsetFromContentType('text/html;charset="ISO-8859-1"'), "iso-8859-1");
  assert.equal(htmlText.charsetFromContentType("text/html; charset=UTF8"), "utf-8");
  assert.equal(htmlText.charsetFromContentType("text/html"), "");
  assert.equal(htmlText.charsetFromContentType(null), "");
});

test("charsetFromHtml sniffs both meta spellings", () => {
  assert.equal(htmlText.charsetFromHtml('<meta charset="windows-1252">'), "windows-1252");
  assert.equal(
    htmlText.charsetFromHtml(
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">'
    ),
    "iso-8859-1"
  );
  assert.equal(htmlText.charsetFromHtml("<html><head><title>x</title>"), "");
});

test("decodeHtmlBytes honours the Content-Type charset", () => {
  const bytes = latin1Bytes("<title>AI Mode \x96 Google</title>");
  const decoded = htmlText.decodeHtmlBytes(bytes, "text/html; charset=windows-1252");
  assert.equal(decoded, "<title>AI Mode – Google</title>");
  assert.ok(!decoded.includes(REPLACEMENT));
});

test("decodeHtmlBytes falls back to the meta charset when the header omits one", () => {
  const bytes = latin1Bytes('<meta charset="windows-1252"><title>AI Mode \x96 Google</title>');
  const decoded = htmlText.decodeHtmlBytes(bytes, "text/html");
  assert.ok(decoded.endsWith("<title>AI Mode – Google</title>"));
  assert.ok(!decoded.includes(REPLACEMENT));
});

test("decodeHtmlBytes defaults to utf-8 and survives a bogus charset label", () => {
  const utf8 = new TextEncoder().encode("<title>AI Mode — Google</title>");
  assert.equal(htmlText.decodeHtmlBytes(utf8, "text/html"), "<title>AI Mode — Google</title>");
  assert.equal(
    htmlText.decodeHtmlBytes(utf8, "text/html; charset=totally-not-a-charset"),
    "<title>AI Mode — Google</title>"
  );
  assert.equal(htmlText.decodeHtmlBytes(new Uint8Array(0), null), "");
});

test("enrichUrl buffers bytes and decodes with the response charset", () => {
  assert.ok(
    enrichSource.includes('decodeHtmlBytes(bytes, res.headers.get("content-type"))'),
    "enrichUrl should decode the buffered bytes with the response Content-Type"
  );
  assert.ok(
    !enrichSource.includes("new TextDecoder()"),
    "enrichUrl should no longer hard-code a UTF-8 decoder"
  );
  assert.ok(
    enrichSource.includes("decodeHtmlEntities") && enrichSource.includes("stripReplacementChars"),
    "enrichUrl should decode entities and strip replacement characters"
  );
});
