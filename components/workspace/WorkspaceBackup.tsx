'use client';
import { useState } from 'react';
import type { WorkspaceRecord } from '@/lib/workspace-types';
import { parseWorkspaceBackup } from '@/lib/workspace-model.mjs';
import { workspaceRequest } from '@/lib/workspace-client';

export function WorkspaceBackup({ records, onRestore, disabled = false }: { records: WorkspaceRecord[]; onRestore: () => Promise<void>; disabled?: boolean }) {
  const [pending, setPending] = useState<WorkspaceRecord[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, records }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'second-brain-workspace.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async () => {
    if (!pending) return;
    setBusy(true); setMessage('');
    try { const result = await workspaceRequest<{ imported: number; skipped: number }>('/api/workspace/records', { method: 'POST', body: JSON.stringify({ version: 1, records: pending }) }); setMessage(`Imported ${result.imported}; kept ${result.skipped} existing records unchanged.`); setPending(null); await onRestore(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <details className="mt-10 rounded-xl border border-brand-border p-4 text-sm text-gray-400"><summary className="cursor-pointer">Workspace backup</summary>
    <p className="my-3">Projects, conversations, decisions and discovery choices. Use the library export separately for source cards.</p>
    <div className="flex flex-wrap gap-4"><button onClick={download} disabled={busy || disabled} className="text-amber-200">Export workspace</button><label className="cursor-pointer text-amber-200">Choose backup<input aria-label="Import workspace backup" type="file" accept=".json,application/json" className="ml-2 max-w-full text-xs" disabled={busy || disabled} onChange={async e => {
      const file = e.target.files?.[0]; setPending(null); setMessage(''); if (!file) return;
      try { if (file.size > 10000000) throw new Error('Backup exceeds 10 MB.'); setPending(parseWorkspaceBackup(await file.text())); } catch (err) { setMessage((err as Error).message); }
      e.target.value = '';
    }} /></label></div>
    {pending && <div className="mt-3"><p>{pending.length} records ready. Existing records will be skipped.</p><button className="mt-2 rounded bg-amber-400 px-3 py-2 text-black" disabled={busy || disabled} onClick={restore}>Restore missing records</button><button className="ml-3" disabled={busy || disabled} onClick={() => setPending(null)}>Cancel</button></div>}
    {message && <p role="status" className="mt-3">{message}</p>}
  </details>;
}
