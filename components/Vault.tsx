"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "./Toast";
import {
  createVaultConfig,
  decryptVaultSecret,
  encryptVaultSecret,
  makePassword,
  recoverVault,
  unlockVault,
  type EncryptedVaultPayload,
  type VaultConfig,
  type VaultSecret,
} from "@/lib/vault-crypto";

interface VaultConfigRow extends VaultConfig {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultItemRow extends EncryptedVaultPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultEntry {
  id: string;
  secret: VaultSecret;
  createdAt: string;
  updatedAt: string;
}

interface VaultProps {
  onClose: () => void;
}

const EMPTY_SECRET: VaultSecret = {
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  tags: [],
  updatedAt: "",
};

function splitTags(value: string): string[] {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function joinTags(tags: string[]): string {
  return tags.join(", ");
}

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <path d="M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />
      {hidden && <path d="M4 4l16 16" />}
    </svg>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
  className = "",
  autoFocus = false,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        type={visible ? "text" : "password"}
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onEnter?.(); }}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 pr-10 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        <EyeIcon hidden={!visible} />
      </button>
    </div>
  );
}

export default function Vault({ onClose }: VaultProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<VaultConfigRow | null>(null);
  const [encryptedItems, setEncryptedItems] = useState<VaultItemRow[]>([]);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [newMasterConfirm, setNewMasterConfirm] = useState("");
  const [mode, setMode] = useState<"unlock" | "setup" | "recovery">("unlock");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_SECRET, tags: "" });
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewMasterPassword, setShowNewMasterPassword] = useState(false);
  const [showNewMasterConfirm, setShowNewMasterConfirm] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const lockTimer = useRef<number | null>(null);

  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault");
      if (!res.ok) throw new Error("Failed to load vault");
      const data = await res.json() as { config: VaultConfigRow | null; items: VaultItemRow[] };
      const items = data.items || [];
      setConfig(data.config);
      setEncryptedItems(items);
      setMode(data.config ? "unlock" : "setup");
      if (vaultKey) await decryptItems(vaultKey, items);
    } catch {
      showToast("Failed to load vault", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVault(); }, []);

  useEffect(() => {
    if (!vaultKey) return;
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    lockTimer.current = window.setTimeout(() => lock(), 10 * 60 * 1000);
    return () => {
      if (lockTimer.current) window.clearTimeout(lockTimer.current);
    };
  }, [vaultKey, entries.length]);

  const decryptItems = async (key: CryptoKey, rows: VaultItemRow[]) => {
    const decrypted: VaultEntry[] = [];
    for (const row of rows) {
      try {
        decrypted.push({
          id: row.id,
          secret: await decryptVaultSecret(key, row),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      } catch {}
    }
    decrypted.sort((a, b) => a.secret.title.localeCompare(b.secret.title));
    setEntries(decrypted);
  };

  const setupVault = async () => {
    if (masterPassword.length < 12) {
      showToast("Use at least 12 characters for the master password", "error");
      return;
    }
    if (masterPassword !== confirmPassword) {
      showToast("Master passwords do not match", "error");
      return;
    }

    setBusy(true);
    try {
      const created = await createVaultConfig(masterPassword);
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "config", config: created.config }),
      });
      if (!res.ok) throw new Error("Failed to create vault");
      const saved = await res.json() as VaultConfigRow;
      setConfig(saved);
      setVaultKey(created.vaultKey);
      setRecoveryKey(created.recoveryKey);
      setEntries([]);
      setMasterPassword("");
      setConfirmPassword("");
      setShowMasterPassword(false);
      setShowConfirmPassword(false);
      showToast("Vault created", "success");
    } catch {
      showToast("Failed to create vault", "error");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!config || !masterPassword) return;
    setBusy(true);
    try {
      const key = await unlockVault(config, masterPassword);
      setVaultKey(key);
      setMasterPassword("");
      setShowMasterPassword(false);
      await decryptItems(key, encryptedItems);
      showToast("Vault unlocked", "success");
    } catch {
      showToast("Invalid master password", "error");
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!config) return;
    if (newMasterPassword.length < 12) {
      showToast("Use at least 12 characters for the new master password", "error");
      return;
    }
    if (newMasterPassword !== newMasterConfirm) {
      showToast("New master passwords do not match", "error");
      return;
    }

    setBusy(true);
    try {
      const recovered = await recoverVault(config, recoveryInput, newMasterPassword);
      const res = await fetch("/api/vault", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "config", config: recovered.config }),
      });
      if (!res.ok) throw new Error("Failed to update vault config");
      const saved = await res.json() as VaultConfigRow;
      setConfig(saved);
      setVaultKey(recovered.vaultKey);
      setRecoveryInput("");
      setNewMasterPassword("");
      setNewMasterConfirm("");
      setShowNewMasterPassword(false);
      setShowNewMasterConfirm(false);
      await decryptItems(recovered.vaultKey, encryptedItems);
      showToast("Master password reset", "success");
    } catch {
      showToast("Recovery key did not unlock the vault", "error");
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    setVaultKey(null);
    setEntries([]);
    setEditingId(null);
    setForm({ ...EMPTY_SECRET, tags: "" });
    setShowFormPassword(false);
    setShowMasterPassword(false);
    setShowConfirmPassword(false);
    setShowNewMasterPassword(false);
    setShowNewMasterConfirm(false);
    setVisiblePasswords(new Set());
    setRecoveryKey("");
  };

  const saveEntry = async () => {
    if (!vaultKey) return;
    if (!form.title.trim()) {
      showToast("Add a title", "error");
      return;
    }

    const secret: VaultSecret = {
      title: form.title.trim(),
      username: form.username.trim(),
      password: form.password,
      url: form.url.trim(),
      notes: form.notes,
      tags: splitTags(form.tags),
      updatedAt: new Date().toISOString(),
    };

    setBusy(true);
    try {
      const encrypted = await encryptVaultSecret(vaultKey, secret);
      const res = await fetch("/api/vault", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId
          ? { kind: "item", id: editingId, item: encrypted }
          : { kind: "item", item: encrypted }),
      });
      if (!res.ok) throw new Error("Failed to save vault item");
      const saved = await res.json() as VaultItemRow;
      const nextEncrypted = editingId
        ? encryptedItems.map(item => item.id === editingId ? saved : item)
        : [...encryptedItems, saved];
      setEncryptedItems(nextEncrypted);
      await decryptItems(vaultKey, nextEncrypted);
      setEditingId(null);
      setForm({ ...EMPTY_SECRET, tags: "" });
      setShowFormPassword(false);
      setVisiblePasswords(prev => {
        const next = new Set(prev);
        if (editingId) next.delete(editingId);
        return next;
      });
      showToast("Secret saved", "success");
    } catch {
      showToast("Failed to save secret", "error");
    } finally {
      setBusy(false);
    }
  };

  const editEntry = (entry: VaultEntry) => {
    setEditingId(entry.id);
    setForm({ ...entry.secret, tags: joinTags(entry.secret.tags || []) });
    setShowFormPassword(false);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this vault item?")) return;
    try {
      const res = await fetch(`/api/vault?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      const next = encryptedItems.filter(item => item.id !== id);
      setEncryptedItems(next);
      setEntries(prev => prev.filter(entry => entry.id !== id));
      setVisiblePasswords(prev => {
        const nextVisible = new Set(prev);
        nextVisible.delete(id);
        return nextVisible;
      });
      showToast("Secret deleted", "success");
    } catch {
      showToast("Failed to delete secret", "error");
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`, "success");
    } catch {
      showToast(`Could not copy ${label.toLowerCase()}`, "error");
    }
  };

  const toggleVisiblePassword = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => {
      const s = entry.secret;
      return [s.title, s.username, s.url, s.notes, ...(s.tags || [])].some(value => value.toLowerCase().includes(q));
    });
  }, [entries, query]);

  return (
    <div className="fixed inset-0 z-[220] bg-[#0D0F12] text-gray-200 overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-brand-border bg-[#0D0F12] px-4 py-3 flex items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#E8A838]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Vault</h2>
          <p className="text-[11px] font-mono text-gray-600">Client-side encrypted secrets</p>
        </div>
        <div className="flex-1" />
        {vaultKey && (
          <button onClick={lock} className="px-3 py-2 rounded-lg border border-brand-border text-xs font-mono text-gray-400 hover:text-white transition">Lock</button>
        )}
        <button onClick={onClose} className="px-3 py-2 rounded-lg border border-brand-border text-xs font-mono text-gray-400 hover:text-white transition">Close</button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {loading ? (
          <div className="text-sm text-gray-500 font-mono">Loading vault...</div>
        ) : !config && mode === "setup" ? (
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold mb-2">Create encrypted vault</h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Your master password never leaves this browser. If you lose the master password and recovery key, the vault cannot be recovered.
            </p>
            <PasswordField
              value={masterPassword}
              onChange={setMasterPassword}
              placeholder="Master password"
              visible={showMasterPassword}
              onToggle={() => setShowMasterPassword(show => !show)}
              className="mb-2"
            />
            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm master password"
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword(show => !show)}
              className="mb-3"
            />
            <button disabled={busy} onClick={setupVault} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#0D0F12] disabled:opacity-50" style={{ background: "#E8A838" }}>
              {busy ? "Creating..." : "Create vault"}
            </button>
          </div>
        ) : !vaultKey ? (
          <div className="max-w-lg">
            {mode === "unlock" ? (
              <>
                <h3 className="text-sm font-semibold mb-2">Unlock vault</h3>
                <PasswordField
                  autoFocus
                  value={masterPassword}
                  onChange={setMasterPassword}
                  placeholder="Master password"
                  visible={showMasterPassword}
                  onToggle={() => setShowMasterPassword(show => !show)}
                  onEnter={unlock}
                  className="mb-3"
                />
                <div className="flex gap-2">
                  <button disabled={busy || !masterPassword} onClick={unlock} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#0D0F12] disabled:opacity-50" style={{ background: "#E8A838" }}>
                    {busy ? "Unlocking..." : "Unlock"}
                  </button>
                  <button onClick={() => setMode("recovery")} className="px-4 py-2.5 rounded-lg border border-brand-border text-sm text-gray-400 hover:text-white transition">Use recovery key</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold mb-2">Recover vault access</h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">Enter the recovery key shown when the vault was created, then set a new master password.</p>
                <input
                  value={recoveryInput}
                  onChange={e => setRecoveryInput(e.target.value)}
                  placeholder="Recovery key"
                  className="w-full mb-2 px-3 py-2.5 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none font-mono"
                />
                <PasswordField
                  value={newMasterPassword}
                  onChange={setNewMasterPassword}
                  placeholder="New master password"
                  visible={showNewMasterPassword}
                  onToggle={() => setShowNewMasterPassword(show => !show)}
                  className="mb-2"
                />
                <PasswordField
                  value={newMasterConfirm}
                  onChange={setNewMasterConfirm}
                  placeholder="Confirm new master password"
                  visible={showNewMasterConfirm}
                  onToggle={() => setShowNewMasterConfirm(show => !show)}
                  className="mb-3"
                />
                <div className="flex gap-2">
                  <button disabled={busy} onClick={recover} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#0D0F12] disabled:opacity-50" style={{ background: "#E8A838" }}>
                    {busy ? "Recovering..." : "Recover"}
                  </button>
                  <button onClick={() => setMode("unlock")} className="px-4 py-2.5 rounded-lg border border-brand-border text-sm text-gray-400 hover:text-white transition">Back</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
            <div className="rounded-xl border border-brand-border bg-brand-card p-4 h-fit">
              <h3 className="text-sm font-semibold mb-3">{editingId ? "Edit secret" : "Add secret"}</h3>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="w-full mb-2 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none" />
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Username / email" className="w-full mb-2 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none" />
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <input
                    type={showFormPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Password / secret"
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(show => !show)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md text-xs text-gray-500 hover:text-white hover:bg-white/5 transition"
                    aria-label={showFormPassword ? "Hide password" : "Show password"}
                    title={showFormPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon hidden={!showFormPassword} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm(f => ({ ...f, password: makePassword() }));
                    setShowFormPassword(true);
                  }}
                  className="px-3 rounded-lg border border-brand-border text-xs text-gray-400 hover:text-white transition"
                >
                  Generate
                </button>
              </div>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="URL" className="w-full mb-2 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none" />
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Tags, comma separated" className="w-full mb-2 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none" />
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={4} className="w-full mb-3 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none resize-y" />
              <div className="flex gap-2">
                <button disabled={busy} onClick={saveEntry} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[#0D0F12] disabled:opacity-50" style={{ background: "#E8A838" }}>
                  {busy ? "Saving..." : editingId ? "Save changes" : "Add secret"}
                </button>
                {editingId && (
                  <button onClick={() => { setEditingId(null); setForm({ ...EMPTY_SECRET, tags: "" }); setShowFormPassword(false); }} className="px-3 py-2.5 rounded-lg border border-brand-border text-sm text-gray-400">Cancel</button>
                )}
              </div>
            </div>

            <div>
              {recoveryKey && (
                <div className="mb-4 rounded-xl border border-[#E8A83870] bg-[#E8A83812] p-4">
                  <p className="text-sm font-semibold text-[#E8A838] mb-2">Save this recovery key now</p>
                  <p className="text-xs text-gray-400 mb-3">It is shown once. It can reset your master password, but it cannot be recovered later.</p>
                  <div className="flex gap-2">
                    <code className="flex-1 rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-gray-100 break-all">{recoveryKey}</code>
                    <button onClick={() => copyText(recoveryKey, "Recovery key")} className="px-3 rounded-lg border border-[#E8A83870] text-xs text-[#E8A838]">Copy</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search unlocked vault..." className="flex-1 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm outline-none" />
                <button onClick={loadVault} className="px-3 rounded-lg border border-brand-border text-xs text-gray-400 hover:text-white transition">Refresh</button>
              </div>

              <div className="space-y-2">
                {visibleEntries.length === 0 ? (
                  <div className="rounded-xl border border-brand-border bg-brand-card p-6 text-center text-sm text-gray-500">
                    {entries.length === 0 ? "No secrets saved yet" : "No matching secrets"}
                  </div>
                ) : visibleEntries.map(entry => (
                  <div key={entry.id} className="rounded-xl border border-brand-border bg-brand-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold truncate">{entry.secret.title}</h3>
                          <span className="text-[10px] font-mono text-gray-600">{displayDate(entry.updatedAt || entry.createdAt)}</span>
                        </div>
                        {entry.secret.url && <a href={entry.secret.url} target="_blank" rel="noreferrer" className="block text-xs text-[#5B8DEF] truncate mb-1">{entry.secret.url}</a>}
                        {entry.secret.username && <p className="text-xs text-gray-400 truncate">{entry.secret.username}</p>}
                        {entry.secret.password && (
                          <p className="mt-2 text-xs font-mono text-gray-400 break-all">
                            {visiblePasswords.has(entry.id) ? entry.secret.password : "************"}
                          </p>
                        )}
                        {entry.secret.notes && <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{entry.secret.notes}</p>}
                        {(entry.secret.tags || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(entry.secret.tags || []).map(tag => <span key={tag} className="px-2 py-0.5 rounded-full border border-brand-border text-[10px] text-gray-500">#{tag}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {entry.secret.username && <button onClick={() => copyText(entry.secret.username, "Username")} className="px-2 py-1 rounded-md border border-brand-border text-[11px] text-gray-400 hover:text-white">Copy user</button>}
                        {entry.secret.password && <button onClick={() => copyText(entry.secret.password, "Password")} className="px-2 py-1 rounded-md border border-brand-border text-[11px] text-gray-400 hover:text-white">Copy pass</button>}
                        {entry.secret.password && (
                          <button
                            onClick={() => toggleVisiblePassword(entry.id)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-brand-border text-gray-400 hover:text-white"
                            aria-label={visiblePasswords.has(entry.id) ? "Hide password" : "Show password"}
                            title={visiblePasswords.has(entry.id) ? "Hide password" : "Show password"}
                          >
                            <EyeIcon hidden={!visiblePasswords.has(entry.id)} />
                          </button>
                        )}
                        <button onClick={() => editEntry(entry)} className="px-2 py-1 rounded-md border border-brand-border text-[11px] text-gray-400 hover:text-white">Edit</button>
                        <button onClick={() => deleteEntry(entry.id)} className="px-2 py-1 rounded-md border border-red-500/30 text-[11px] text-red-300 hover:text-red-200">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
