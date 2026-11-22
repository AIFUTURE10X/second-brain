import type { Category, Item } from "./brain-model";

const ITEMS_CACHE_KEY = "sb_cached_items_v1";
const CATEGORIES_CACHE_KEY = "sb_cached_categories_v1";
const JUST_SAVED_ITEM_KEY = "sb_just_saved_item_v1";
const MAX_CACHED_ITEMS = 200;

export function readCachedItems(): Item[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ITEMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Item[]) : null;
  } catch {
    return null;
  }
}

export function writeCachedItems(items: Item[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(items.slice(0, MAX_CACHED_ITEMS)));
  } catch {
    // Quota exceeded or storage disabled — skip quietly.
  }
}

export function readCachedCategories(): Category[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATEGORIES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Category[]) : null;
  } catch {
    return null;
  }
}

export function writeCachedCategories(categories: Category[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(categories));
  } catch {
    // Quota exceeded or storage disabled — skip quietly.
  }
}

export function stashJustSavedItem(item: Item): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JUST_SAVED_ITEM_KEY, JSON.stringify(item));
  } catch {}
}

export function consumeJustSavedItem(): Item | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(JUST_SAVED_ITEM_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(JUST_SAVED_ITEM_KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.id === "string"
      ? (parsed as Item)
      : null;
  } catch {
    return null;
  }
}

export function mergeJustSavedItem(items: Item[], justSaved: Item | null): Item[] {
  if (!justSaved) return items;
  if (items.some(item => item.id === justSaved.id)) return items;
  return [justSaved, ...items];
}

export function upsertCachedItem(items: Item[], row: Item, replace: boolean, shouldCache: boolean): Item[] {
  const next = replace
    ? items.map(i => (i.id === row.id ? row : i))
    : [row, ...items.filter(i => i.id !== row.id)];
  if (shouldCache) writeCachedItems(next);
  return next;
}

export async function clearAppRuntimeCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("sb-")).map(key => caches.delete(key)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.update().catch(() => undefined)));
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_RUNTIME_CACHES" });
  }
}
