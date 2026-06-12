import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { vaultConfigs, vaultItems } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const DEFAULT_CONFIG_ID = "default";
const MAX_ENCRYPTED_FIELD_LENGTH = 200_000;

interface VaultConfigBody {
  version?: number;
  kdf?: string;
  kdfSalt?: string;
  kdfIterations?: number;
  masterKeyNonce?: string;
  masterKeyCiphertext?: string;
  recoveryKeySalt?: string;
  recoveryKeyNonce?: string;
  recoveryKeyCiphertext?: string;
}

interface VaultItemBody {
  id?: string;
  version?: number;
  nonce?: string;
  ciphertext?: string;
}

function isSafeText(value: unknown, max = MAX_ENCRYPTED_FIELD_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseConfig(body: VaultConfigBody) {
  if (!isSafeText(body.kdfSalt, 4096)) throw new Error("Missing kdfSalt");
  const kdfIterations = body.kdfIterations;
  if (typeof kdfIterations !== "number" || !Number.isInteger(kdfIterations) || kdfIterations < 100_000) {
    throw new Error("Invalid kdfIterations");
  }
  if (!isSafeText(body.masterKeyNonce, 4096)) throw new Error("Missing masterKeyNonce");
  if (!isSafeText(body.masterKeyCiphertext)) throw new Error("Missing masterKeyCiphertext");
  if (!isSafeText(body.recoveryKeySalt, 4096)) throw new Error("Missing recoveryKeySalt");
  if (!isSafeText(body.recoveryKeyNonce, 4096)) throw new Error("Missing recoveryKeyNonce");
  if (!isSafeText(body.recoveryKeyCiphertext)) throw new Error("Missing recoveryKeyCiphertext");

  return {
    id: DEFAULT_CONFIG_ID,
    version: body.version || 1,
    kdf: body.kdf || "PBKDF2-SHA256",
    kdfSalt: body.kdfSalt,
    kdfIterations,
    masterKeyNonce: body.masterKeyNonce,
    masterKeyCiphertext: body.masterKeyCiphertext,
    recoveryKeySalt: body.recoveryKeySalt,
    recoveryKeyNonce: body.recoveryKeyNonce,
    recoveryKeyCiphertext: body.recoveryKeyCiphertext,
    updatedAt: new Date(),
  };
}

function configUpdateValues(config: ReturnType<typeof parseConfig>) {
  return {
    version: config.version,
    kdf: config.kdf,
    kdfSalt: config.kdfSalt,
    kdfIterations: config.kdfIterations,
    masterKeyNonce: config.masterKeyNonce,
    masterKeyCiphertext: config.masterKeyCiphertext,
    recoveryKeySalt: config.recoveryKeySalt,
    recoveryKeyNonce: config.recoveryKeyNonce,
    recoveryKeyCiphertext: config.recoveryKeyCiphertext,
    updatedAt: config.updatedAt,
  };
}

function parseItem(body: VaultItemBody) {
  if (!isSafeText(body.nonce, 4096)) throw new Error("Missing nonce");
  if (!isSafeText(body.ciphertext)) throw new Error("Missing ciphertext");

  return {
    version: body.version || 1,
    nonce: body.nonce,
    ciphertext: body.ciphertext,
    updatedAt: new Date(),
  };
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const [config] = await db.select().from(vaultConfigs).where(eq(vaultConfigs.id, DEFAULT_CONFIG_ID));
  const rows = await db.select().from(vaultItems).orderBy(asc(vaultItems.createdAt));

  return NextResponse.json({ config: config || null, items: rows });
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.kind === "config") {
      const config = parseConfig(body.config || {});
      const [saved] = await db
        .insert(vaultConfigs)
        .values(config)
        .onConflictDoUpdate({
          target: vaultConfigs.id,
          set: configUpdateValues(config),
        })
        .returning();

      return NextResponse.json(saved);
    }

    if (body.kind === "item") {
      const item = parseItem(body.item || {});
      const [saved] = await db.insert(vaultItems).values(item).returning();
      return NextResponse.json(saved, { status: 201 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid vault payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown vault action" }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.kind === "config") {
      const config = parseConfig(body.config || {});
      const [saved] = await db
        .update(vaultConfigs)
        .set(configUpdateValues(config))
        .where(eq(vaultConfigs.id, DEFAULT_CONFIG_ID))
        .returning();

      if (!saved) return NextResponse.json({ error: "Vault config not found" }, { status: 404 });
      return NextResponse.json(saved);
    }

    if (body.kind === "item") {
      if (!isSafeText(body.id, 128)) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const item = parseItem(body.item || {});
      const [saved] = await db
        .update(vaultItems)
        .set(item)
        .where(eq(vaultItems.id, body.id))
        .returning();

      if (!saved) return NextResponse.json({ error: "Vault item not found" }, { status: 404 });
      return NextResponse.json(saved);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid vault payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown vault action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(vaultItems).where(eq(vaultItems.id, id));
  return NextResponse.json({ ok: true });
}
