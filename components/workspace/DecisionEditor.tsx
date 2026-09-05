'use client';
import { useState } from 'react';
import type { Item } from '@/lib/brain-model';
import type { Decision, Project } from '@/lib/workspace-types';
import { saveWorkspaceRecord } from '@/lib/workspace-client';
import { CardPicker } from './CardPicker';

export function DecisionEditor({ initial, items, projects, onSave, onCancel }: { initial?: Decision; items: Item[]; projects: Project[]; onSave: (d: Decision) => void; onCancel: () => void }) {
  const [record, setRecord] = useState<Decision>(() => initial || { id: crypto.randomUUID(), kind: 'decision', revision: 0, data: { title: '', choice: '', rationale: '', alternatives: '', sourceIds: [], projectId: null, reviewOn: '' } });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const patch = (data: Partial<Decision['data']>) => setRecord(r => ({ ...r, data: { ...r.data, ...data } }));
  const save = async () => { setBusy(true); setError(''); try { onSave(await saveWorkspaceRecord(record)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <form className="space-y-4 rounded-2xl border border-brand-border bg-[#11151a] p-5" onSubmit={e => { e.preventDefault(); void save(); }}>
    <h2 className="font-semibold">{initial ? 'Edit decision' : 'Record a decision'}</h2>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Decision title<input aria-label="Decision title" required maxLength={160} className="mt-1 w-full rounded border border-brand-border bg-brand-dark p-2" value={record.data.title} onChange={e => patch({ title: e.target.value })} /></label>
      {([['choice', 'What did you choose?'], ['rationale', 'Why did you choose it?'], ['alternatives', 'Alternatives considered']] as const).map(([key, label]) => <label key={key} className="block text-sm">{label}<textarea aria-label={label} required={key !== 'alternatives'} maxLength={8000} className="mt-1 min-h-20 w-full rounded border border-brand-border bg-brand-dark p-2" value={record.data[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}
      <label className="block text-sm">Project<select aria-label="Decision project" className="ml-2 max-w-full rounded bg-brand-dark p-2" value={record.data.projectId || ''} onChange={e => patch({ projectId: e.target.value || null })}><option value="">General</option>{projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}</select></label>
      <label className="block text-sm">Reconsider on<input aria-label="Reconsider on" type="date" className="ml-2 rounded bg-brand-dark p-2" value={record.data.reviewOn} onChange={e => patch({ reviewOn: e.target.value })} /></label>
      <CardPicker items={items} selected={record.data.sourceIds} onChange={sourceIds => patch({ sourceIds })} label="Evidence for this decision" limit={100} />
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-300">{error} Your draft remains in this form.</p>}
    <div className="flex gap-3"><button disabled={busy} className="rounded bg-amber-400 px-4 py-2 text-sm text-black disabled:opacity-40">{busy ? 'Saving…' : 'Save decision'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
