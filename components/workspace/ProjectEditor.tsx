'use client';
import { useState } from 'react';
import type { Item } from '@/lib/brain-model';
import type { Project } from '@/lib/workspace-types';
import { saveWorkspaceRecord } from '@/lib/workspace-client';
import { CardPicker } from './CardPicker';

export function ProjectEditor({ initial, items, onSave, onCancel }: { initial?: Project; items: Item[]; onSave: (p: Project) => void; onCancel: () => void }) {
  const [record, setRecord] = useState<Project>(() => initial || { id: crypto.randomUUID(), kind: 'project', revision: 0, data: { name: '', goal: '', category: '', itemIds: [], questions: '' } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (data: Partial<Project['data']>) => setRecord(r => ({ ...r, data: { ...r.data, ...data } }));
  const save = async () => { setBusy(true); setError(''); try { onSave(await saveWorkspaceRecord(record)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4 rounded-2xl border border-brand-border bg-[#11151a] p-5">
    <h2 className="font-semibold">{initial ? 'Edit project' : 'New project'}</h2>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm">Project name<input aria-label="Project name" required maxLength={160} className="mt-1 w-full rounded border border-brand-border bg-brand-dark p-2" value={record.data.name} onChange={e => patch({ name: e.target.value })} /></label>
      <label className="block text-sm">What are you trying to achieve?<textarea aria-label="Project goal" required maxLength={8000} className="mt-1 min-h-24 w-full rounded border border-brand-border bg-brand-dark p-2" value={record.data.goal} onChange={e => patch({ goal: e.target.value })} /></label>
      <label className="block text-sm">Include a category<select aria-label="Project category" className="ml-2 max-w-full rounded bg-brand-dark p-2" value={record.data.category} onChange={e => patch({ category: e.target.value })}><option value="">Only chosen cards</option>{[...new Set([...items.map(i => i.category), record.data.category])].filter(Boolean).sort().map(c => <option key={c}>{c}</option>)}</select></label>
      <CardPicker items={items} selected={record.data.itemIds} onChange={itemIds => patch({ itemIds })} limit={100} label="Include additional cards" />
      <label className="block text-sm">Open questions<textarea aria-label="Project open questions" maxLength={8000} className="mt-1 min-h-24 w-full rounded border border-brand-border bg-brand-dark p-2" value={record.data.questions} onChange={e => patch({ questions: e.target.value })} /></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-300">{error} Copy your draft before reloading if another tab changed this project.</p>}
    <div className="flex gap-3"><button disabled={busy || !record.data.name.trim() || !record.data.goal.trim()} className="rounded bg-amber-400 px-4 py-2 text-sm text-black disabled:opacity-40">{busy ? 'Saving…' : 'Save project'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
