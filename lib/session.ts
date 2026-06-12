/**
 * Stateless session tokens for the single-user login.
 *
 * Token format: `v1.<expiresAtMs>.<base64url(HMAC-SHA256(secret, "sb-session.v1." + expiresAtMs))>`
 *
 * The token carries no data beyond its own expiry — it only asserts "the
 * passphrase holder logged in". Uses Web Crypto only so it works in both the
 * Edge middleware runtime and Node route handlers.
 */

export const SESSION_COOKIE = "sb_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const VERSION = "v1";
const PAYLOAD_PREFIX = "sb-session.v1.";

function base64urlEncode(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function mintSessionToken(secret: string, now: number = Date.now()): Promise<string> {
  if (!secret) throw new Error("mintSessionToken: secret is required");
  const expiresAt = now + SESSION_TTL_MS;
  const key = await hmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(PAYLOAD_PREFIX + expiresAt));
  return `${VERSION}.${expiresAt}.${base64urlEncode(signature)}`;
}

export async function verifySessionToken(
  secret: string | undefined,
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  if (!/^\d+$/.test(parts[1])) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const signature = base64urlDecode(parts[2]);
  if (!signature || signature.length === 0) return false;
  const key = await hmacKey(secret, "verify");
  // crypto.subtle.verify is constant-time by construction.
  return crypto.subtle.verify("HMAC", key, signature.slice().buffer, new TextEncoder().encode(PAYLOAD_PREFIX + expiresAt));
}

/** SHA-256 hex digest — used to compare the login passphrase against AUTH_PASSPHRASE_HASH. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time equality for two strings, via fixed-length SHA-256 digests. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}
