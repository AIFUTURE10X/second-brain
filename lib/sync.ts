export const SYNC_CHANNEL = "second-brain-sync";

export type SyncPayload =
  | { type: "item-updated"; item: unknown }
  | { type: "item-created"; item: unknown }
  | { type: "item-deleted"; id: string };

export type SyncMessage = SyncPayload & { source: string };

export function getSyncClientId(): string {
  if (typeof window === "undefined") return "";
  const key = "second-brain-client-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}
