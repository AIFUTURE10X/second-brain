"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ShareHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");

  useEffect(() => {
    const title = params.get("title") || "";
    const text = params.get("text") || "";
    const sharedUrl = params.get("url") || "";

    const urlMatch = (sharedUrl || text).match(/https?:\/\/[^\s]+/);
    const finalUrl = sharedUrl || (urlMatch ? urlMatch[0] : "");
    const finalText = sharedUrl ? text : (urlMatch ? text.replace(urlMatch[0], "").trim() : text);

    if (!title && !finalUrl && !finalText) {
      setStatus("error");
      setTimeout(() => router.replace("/"), 1200);
      return;
    }

    fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: finalUrl ? "link" : "note",
        title,
        url: finalUrl,
        content: finalText,
      }),
    })
      .then(res => {
        if (!res.ok) throw new Error();
        setStatus("saved");
        setTimeout(() => router.replace("/"), 800);
      })
      .catch(() => {
        setStatus("error");
        setTimeout(() => router.replace("/"), 1500);
      });
  }, [params, router]);

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
