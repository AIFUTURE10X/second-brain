// RFC 6238 TOTP (SHA-1, 6 digits, 30s period) via WebCrypto — used by the
// vault (roadmap 3.4) to render live 2FA codes entirely client-side.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Strip spaces/dashes and validate base32; returns "" when invalid. */
export function normalizeTotpSecret(input: string): string {
  const cleaned = String(input || "").toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (cleaned.length === 0) return "";
  return [...cleaned].every(ch => BASE32_ALPHABET.includes(ch)) ? cleaned : "";
}

export function base32Decode(secret: string): Uint8Array | null {
  const normalized = normalizeTotpSecret(secret);
  if (!normalized) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

export type TotpResult = { code: string; secondsRemaining: number };

/** Current TOTP code + seconds until it rotates; null for invalid secrets. */
export async function generateTotp(
  secret: string,
  { now = Date.now(), digits = 6, periodSeconds = 30 }: { now?: number; digits?: number; periodSeconds?: number } = {},
): Promise<TotpResult | null> {
  const keyBytes = base32Decode(secret);
  if (!keyBytes) return null;

  const counter = Math.floor(now / 1000 / periodSeconds);
  const counterBytes = new Uint8Array(8);
  // 64-bit big-endian counter (no BigInt needed for realistic timestamps).
  let remaining = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes.buffer as ArrayBuffer));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  const code = String(binary % 10 ** digits).padStart(digits, "0");
  const secondsRemaining = periodSeconds - (Math.floor(now / 1000) % periodSeconds);
  return { code, secondsRemaining };
}
