import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_MS, mintSessionToken, safeEqual, sha256Hex } from "@/lib/session";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const authSecret = process.env.AUTH_SECRET;
  const passphraseHash = process.env.AUTH_PASSPHRASE_HASH;
  if (!authSecret || !passphraseHash) {
    return NextResponse.json(
      { error: "Login is not configured. Set AUTH_SECRET and AUTH_PASSPHRASE_HASH." },
      { status: 503 },
    );
  }

  const limited = rateLimit(`login:${clientIp(req)}`, { windowMs: 60_000, max: 5 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  let passphrase: unknown;
  try {
    ({ passphrase } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof passphrase !== "string" || !passphrase) {
    return NextResponse.json({ error: "Passphrase is required" }, { status: 400 });
  }

  const submittedHash = await sha256Hex(passphrase);
  if (!(await safeEqual(submittedHash, passphraseHash.toLowerCase()))) {
    return NextResponse.json({ error: "Wrong passphrase" }, { status: 401 });
  }

  const token = await mintSessionToken(authSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
