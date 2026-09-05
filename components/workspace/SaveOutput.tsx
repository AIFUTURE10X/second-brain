'use client';
import { useState } from 'react';
import type { AskMessage } from '@/lib/workspace-types';
import type { Item } from '@/lib/brain-model';
import { workspaceRequest } from '@/lib/workspace-client';

export function SaveOutput({ message, category, onSaved, onCancel }: {
  message: AskMessage; category: string; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(message.content.split('\n').find(Boolean)?.slice(0, 120) || 'Saved answer');
  const [content, setContent] = useState(message.content);
  const [type, setType] = useState<'note' | 'task'>('note');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await workspaceRequest<Item>('/api/workspace/save', { method: 'POST', body: JSON.stringify({ id, title, content, type, category, sourceIds: [...new Set(message.sources.map(s => s.id))] }) });
      onSaved(result.id);
      if (typeof BroadcastChannel !== 'undefined') { const ch = new BroadcastChannel('second-brain-sync'); ch.postMessage({ type: 'item-created', item: result, source: 'knowledge-workspace' }); ch.close(); }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 space-y-3 rounded-xl border border-amber-700 p-3" aria-label="Save answer editor">
    <p className="text-sm font-medium">Review before saving</p>
    <label className="block text-xs">Title<input aria-label="Output title" className="mt-1 w-full rounded border border-brand-border bg-brand-dark p-2 text-sm" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
    <label className="block text-xs">Save as<select aria-label="Output type" className="ml-2 rounded bg-brand-dark p-2" value={type} onChange={e => setType(e.target.value as 'note' | 'task')} disabled={busy}><option value="note">Note</option><option value="task">Task</option></select></label>
    <textarea aria-label="Output content" className="min-h-40 w-full rounded border border-brand-border bg-brand-dark p-2 text-sm" value={content} maxLength={24000} onChange={e => setContent(e.target.value)} disabled={busy} />
    <p className="text-xs text-gray-400">Source cards stay linked. You can edit this card later.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="flex gap-3"><button className="rounded bg-amber-400 px-3 py-2 text-sm text-black disabled:opacity-40" disabled={busy || !title.trim() || !content.trim()} onClick={save}>{busy ? 'Saving…' : 'Save to library'}</button><button disabled={busy} onClick={onCancel}>Cancel</button></div>
  </div>;
}
