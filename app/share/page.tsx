"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SHARE_TARGET_CACHE = "sb-share-target";
const SHARE_TARGET_METADATA_URL = "/__share-target/metadata.json";
const MAX_SHARE_FILE_SIZE = 50 * 1024 * 1024;

type ShareStatus = "saving" | "saved" | "error";

interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

interface CachedShareFile {
  cacheUrl: string;
  name?: string;
  contentType?: string;
  size?: number;
}

interface CachedSharePayload {
  title?: string;
  text?: string;
  url?: string;
  files?: CachedShareFile[];
}

interface SharePayload {
  title: string;
  text: string;
  url: string;
  files: File[];
}

function resolveContentType(file: File): string {
  return file.type || "application/octet-stream";
}

function imageExtension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
}

function fallbackFileName(index: number, contentType: string): string {
  return `shared-photo-${index + 1}.${imageExtension(contentType)}`;
}

async function clearCachedShareTarget(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  await Promise.all(keys.map(key => cache.delete(key)));
}

async function readCachedShareTarget(): Promise<SharePayload | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  const cache = await caches.open(SHARE_TARGET_CACHE);
  const metadataUrl = new URL(SHARE_TARGET_METADATA_URL, window.location.origin).toString();
  const metadataResponse = await cache.match(metadataUrl);
  if (!metadataResponse) return null;

  let payload: CachedSharePayload;
  try {
    payload = (await metadataResponse.json()) as CachedSharePayload;
  } catch {
    await clearCachedShareTarget(cache);
    return null;
  }

  const files: File[] = [];
  for (const [index, fileMeta] of (payload.files || []).entries()) {
    if (!fileMeta.cacheUrl) continue;
    const fileResponse = await cache.match(fileMeta.cacheUrl);
    if (!fileResponse) continue;

    const blob = await fileResponse.blob();
    const contentType = fileMeta.contentType || blob.type || "application/octet-stream";
    const name = fileMeta.name || fallbackFileName(index, contentType);
    files.push(new File([blob], name, { type: contentType }));
  }

  await clearCachedShareTarget(cache);

  return {
    title: payload.title || "",
    text: payload.text || "",
    url: payload.url || "",
    files,
  };
}

function payloadFromSearch(search: string): SharePayload {
  const params = new URLSearchParams(search);
  return {
    title: params.get("title") || "",
    text: params.get("text") || "",
    url: params.get("url") || "",
    files: [],
  };
}

function normalizeSharedText(payload: SharePayload): { finalUrl: string; finalText: string } {
  const urlMatch = (payload.url || payload.text).match(/https?:\/\/[^\s]+/);
  const finalUrl = payload.url || (urlMatch ? urlMatch[0] : "");
  const finalText = payload.url
    ? payload.text
    : (urlMatch ? payload.text.replace(urlMatch[0], "").trim() : payload.text);

  return { finalUrl, finalText };
}

async function uploadSharedFiles(files: File[]): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  for (const [index, file] of files.entries()) {
    if (file.size > MAX_SHARE_FILE_SIZE) {
      throw new Error(`${file.name || "Shared photo"} exceeds 50 MB`);
    }

    const contentType = resolveContentType(file);
    const name = file.name || fallbackFileName(index, contentType);
    const body = file.type === contentType && file.name
      ? file
      : new File([file], name, { type: contentType });
    const blob = await upload(name, body, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });

    attachments.push({
      url: blob.url,
      name,
      contentType,
      size: file.size,
    });
  }

  return attachments;
}

function titleForSharedItem(title: string, attachments: Attachment[]): string {
  if (title) return title;
  if (attachments.length === 1) return "Shared photo";
  if (attachments.length > 1) return "Shared photos";
  return "";
}

function ShareHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.toString();
  const [status, setStatus] = useState<ShareStatus>("saving");

  useEffect(() => {
    let cancelled = false;

    async function saveShare() {
      try {
        const cachedPayload = await readCachedShareTarget();
        const payload = cachedPayload || payloadFromSearch(search);
        const { finalUrl, finalText } = normalizeSharedText(payload);

        if (!payload.title && !finalUrl && !finalText && payload.files.length === 0) {
          throw new Error("No shared content");
        }

        const attachments = await uploadSharedFiles(payload.files);
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: finalUrl ? "link" : "note",
            title: titleForSharedItem(payload.title, attachments),
            url: finalUrl,
            content: finalText,
            attachments,
          }),
        });
        if (!res.ok) throw new Error();
        if (cancelled) return;
        setStatus("saved");
        setTimeout(() => router.replace("/"), 800);
      } catch {
        if (cancelled) return;
        setStatus("error");
        setTimeout(() => router.replace("/"), 1500);
      }
    }

    saveShare();

    return () => {
      cancelled = true;
    };
  }, [router, search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark text-white p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">
          {status === "saving" && "…"}
          {status === "saved" && "✓"}
          {status === "error" && "✕"}
        </div>
        <div className="text-lg">
          {status === "saving" && "Saving to Second Brain…"}
          {status === "saved" && "Saved!"}
          {status === "error" && "Couldn't save — check your connection"}
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-dark" />}>
      <ShareHandler />
    </Suspense>
  );
}
