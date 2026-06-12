"use client";

import { formatStamp } from "@/lib/brain-format";
import type { Item } from "@/lib/brain-model";

interface ConflictDialogProps {
  serverItem: Item;
  onUseServer: () => void;
  onOverwrite: () => void;
}

// Shown when a guarded item save returns 409: the card was modified on
// another device after this edit session started.
export function ConflictDialog({ serverItem, onUseServer, onOverwrite }: ConflictDialogProps) {
  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center px-4" style={{ background: "#0D0F12EE" }}>
      <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-brand-card p-5">
        <h2 className="text-base font-semibold mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Changed on another device
        </h2>
        <p className="text-xs text-gray-500 leading-relaxed mb-1.5">
          &ldquo;{serverItem.title || serverItem.ogTitle || "This item"}&rdquo; was updated
          {serverItem.updatedAt ? ` at ${formatStamp(serverItem.updatedAt)}` : ""} while you were editing.
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-4">
          Use the server version (discards the edits in this window) or overwrite it with your version.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onUseServer}
            className="w-full py-2.5 rounded-xl bg-brand-muted border border-brand-border text-gray-300 text-sm font-medium active:scale-[0.99] transition"
          >
            Use server version
          </button>
          <button
            onClick={onOverwrite}
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold active:scale-[0.99] transition"
            style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}
