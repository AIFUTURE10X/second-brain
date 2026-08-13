// Charset-aware HTML decoding helpers for link enrichment.
//
// Pages we enrich are not all UTF-8 — Google share pages and a long tail of
// older sites still serve windows-1252 / ISO-8859-1. Decoding those bytes as
// UTF-8 turns typographic punctuation into U+FFFD, which is where the
// "AI Mode <?>" card titles came from. These helpers pick the right decoder
// and then undo HTML entities, with no runtime dependencies.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "­",
  ndash: "–",
  mdash: "—",
  horbar: "―",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  bull: "•",
  prime: "′",
  Prime: "″",
  lsaquo: "‹",
  rsaquo: "›",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  middot: "·",
  sect: "§",
  para: "¶",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  curren: "¤",
  iexcl: "¡",
  iquest: "¿",
  permil: "‰",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  infin: "∞",
  ne: "≠",
  le: "≤",
  ge: "≥",
  minus: "−",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  yuml: "ÿ",
};

// HTML parsers map numeric references in the C1 range to windows-1252, because
// authors who write &#146; mean a right single quote, not a control character.
const C1_TO_WINDOWS_1252: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

const ENTITY_RE = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

function codePointToString(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null; // lone surrogate
  const remapped = C1_TO_WINDOWS_1252[code];
  if (remapped) return remapped;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/** Decode the HTML entities that show up in <title> and <meta content="…">. */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(ENTITY_RE, (match, body: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return codePointToString(code) ?? match;
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

/** Drop U+FFFD replacement characters left over from an earlier bad decode. */
export function stripReplacementChars(input: string): string {
  if (!input || input.indexOf("\uFFFD") === -1) return input;
  return input.replace(/\uFFFD/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

function normalizeCharsetLabel(label: string): string {
  const cleaned = label.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (cleaned === "utf8") return "utf-8";
  return cleaned;
}

/** Pull the charset out of a Content-Type header value. */
export function charsetFromContentType(contentType: string | null | undefined): string {
  if (!contentType) return "";
  const m = /;\s*charset\s*=\s*("[^"]*"|'[^']*'|[^;,\s]+)/i.exec(contentType);
  return m ? normalizeCharsetLabel(m[1]) : "";
}

/** Sniff <meta charset="…"> / <meta http-equiv="content-type" content="…"> markup. */
export function charsetFromHtml(head: string): string {
  if (!head) return "";
  // The http-equiv spelling also matches here through its
  // content="text/html; charset=…" value, so one pattern covers both forms.
  const m = /<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9_\-:.]+)/i.exec(head);
  return m ? normalizeCharsetLabel(m[1]) : "";
}

// Node's TextDecoder resolves the whole windows-1252 / ISO-8859-1 family to a
// plain latin1 decode, so byte 0x96 arrives as the C1 control U+0096 instead of
// an en dash. The HTML spec says to treat ISO-8859-1 as windows-1252 anyway, so
// remapping the C1 block is both a fix for that and spec-correct.
const SINGLE_BYTE_LATIN_LABELS =
  /^(windows-1252|cp1252|x-cp1252|iso-8859-1|iso8859-1|iso_8859-1|latin1|l1|ascii|us-ascii|ansi_x3\.4-1968)$/;
const C1_RANGE = /[\u0080-\u009F]/;

/** Reinterpret C1 control characters as their windows-1252 punctuation. */
export function remapC1Controls(text: string): string {
  if (!text || !C1_RANGE.test(text)) return text;
  return text.replace(/[\u0080-\u009F]/g, ch => C1_TO_WINDOWS_1252[ch.charCodeAt(0)] ?? ch);
}

function decodeWith(label: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode fetched HTML bytes using the response charset when we can determine
 * one, falling back to a meta-tag sniff of the first bytes and finally UTF-8.
 */
export function decodeHtmlBytes(bytes: Uint8Array, contentType?: string | null): string {
  const headLength = Math.min(bytes.length, 2048);
  const head =
    decodeWith("latin1", bytes.subarray(0, headLength)) ??
    decodeWith("utf-8", bytes.subarray(0, headLength)) ??
    "";
  const charset = charsetFromContentType(contentType) || charsetFromHtml(head);
  if (charset && charset !== "utf-8") {
    const decoded = decodeWith(charset, bytes);
    if (decoded !== null) {
      return SINGLE_BYTE_LATIN_LABELS.test(charset) ? remapC1Controls(decoded) : decoded;
    }
  }
  return decodeWith("utf-8", bytes) ?? head;
}
