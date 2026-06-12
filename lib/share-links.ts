import { createHmac, timingSafeEqual } from "node:crypto";

// Signed share links (roadmap 3.3): /shared/<id>?share=<HMAC(id)> gives
// read-only access to one card without any auth. Tokens are deterministic
// per card — revoke them all by rotating SHARE_SECRET.

export function shareSecret(): string {
  return process.env.SHARE_SECRET || process.env.API_SECRET || "";
}

export function sharingEnabled(): boolean {
  return shareSecret().length > 0;
}

export function shareTokenForCard(cardId: string): string {
  const secret = shareSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(`card:${cardId}`).digest("hex");
}

export function verifyShareToken(cardId: string, token: string | null | undefined): boolean {
  if (!sharingEnabled() || !token) return false;
  const expected = shareTokenForCard(cardId);
  const provided = String(token);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}

export function shareUrlForCard(baseUrl: string, cardId: string): string {
  const token = shareTokenForCard(cardId);
  return `${baseUrl.replace(/\/+$/, "")}/shared/${cardId}?share=${token}`;
}
