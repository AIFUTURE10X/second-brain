"use client";

import { FormEvent, useState } from "react";

function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) return next;
  return "/";
}

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (res.ok) {
        window.location.assign(safeNextPath());
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error || "Login failed. Try again.");
    } catch {
      setError("Network error. Try again.");
    }
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-brand-card border border-brand-border rounded-2xl p-8 flex flex-col gap-5"
      >
        <div className="text-center">
          <div className="text-3xl mb-1">◆</div>
          <h1 className="text-xl font-semibold text-gray-100">Second Brain</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your passphrase to unlock</p>
        </div>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Passphrase"
          autoFocus
          autoComplete="current-password"
          className="w-full px-4 py-3 rounded-lg bg-brand-muted border border-brand-border text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand text-base"
        />
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <button
          type="submit"
          disabled={!passphrase || submitting}
          className="w-full py-3 rounded-lg bg-brand text-brand-dark font-semibold disabled:opacity-50 active:scale-[0.99] transition"
        >
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
