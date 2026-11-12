"use client";

import type { Dispatch, SetStateAction } from "react";
import { showToast } from "../Toast";
import { assetNotice, setAssetTag } from "@/lib/aios-asset.mjs";
import { isOfflineTempId } from "@/lib/offline-replay.mjs";
import type { Item } from "@/lib/brain-model";
import type { SyncPayload } from "@/lib/sync";
import type { QueuedWriteInput } from "@/lib/offline-queue";
import type { AssetChoice } from "./AssetSendButton";

/**
 * Grid cards. POST /api/items/asset changes only the asset tag on the server, so a tag
 * added elsewhere meanwhile survives; the reply's updatedAt is kept so the next edit of
 * this card isn't refused as a conflict. Offline, it queues a PUT like the 💼 toggle.
 */
// Cards with a pick in flight: a second pick waits for the first, so two answers can never
// land out of order and leave the earlier category on the card.
const pending = new Set<string>();

export async function sendCardAsset(item: Item, categories: AssetChoice, deps: {
  setItems: Dispatch<SetStateAction<Item[]>>;
  broadcastSync: (msg: SyncPayload) => void;
  queueWriteOffline: (input: QueuedWriteInput) => Promise<boolean>;
}) {
  if (isOfflineTempId(item.id)) return;
  if (pending.has(item.id)) {
    showToast("Still filing this card — try again in a moment", "error");
    return;
  }
  pending.add(item.id);
  try {
    await fileCard(item, categories, deps);
  } finally {
    pending.delete(item.id);
  }
}

async function fileCard(item: Item, categories: AssetChoice, deps: Parameters<typeof sendCardAsset>[2]) {
  const tags: string[] = setAssetTag(item.tags, categories);
  const applyLocally = (patch: Partial<Item>) => deps.setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
  try {
    const res = await fetch("/api/items/asset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, categories }),
    });
    if (!res.ok) {
      showToast("Failed to update", "error");
      return;
    }
    const saved = await res.json().catch(() => null) as Item | null;
    if (saved?.id) {
      deps.broadcastSync({ type: "item-updated", item: saved });
      applyLocally({ tags: saved.tags, updatedAt: saved.updatedAt });
    } else {
      applyLocally({ tags });
    }
    showToast(assetNotice(categories), "success");
  } catch {
    if (await deps.queueWriteOffline({ kind: "update", payload: { id: item.id, tags } })) {
      applyLocally({ tags });
      showToast("Offline — change queued for sync", "success");
    } else {
      showToast("Failed to update", "error");
    }
  }
}
