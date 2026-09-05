'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/brain-model';
import type { Decision, Feedback, Project } from '@/lib/workspace-types';
import { buildDiscoveries } from '@/lib/workspace-discovery.mjs';
import { saveWorkspaceRecord } from '@/lib/workspace-client';

export function TodayPanel({ items, projects, decisions, feedback, onSave, onConnect, onDecision }: {
  items: Item[]; projects: Project[]; decisions: Decision[]; feedback: Feedback[]; onSave: (f: Feedback) => void; onConnect: (ids: string[]) => void; onDecision: (id: string) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const discoveries = buildDiscoveries({ items, projects, decisions, feedback });
  const respond = async (s: typeof discoveries[number], status: Feedback['data']['status']) => {
    setError(''); setBusy(s.id);
    const existing = feedback.find(f => f.data.suggestionId === s.id);
    const record: Feedback = { id: existing?.id || crypto.randomUUID(), kind: 'feedback', revision: existing?.revision || 0, data: {
      suggestionId: s.id, status, title: s.title, reason: s.reason, sourceIds: s.sourceIds,
      snoozedUntil: status === 'snoozed' ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
    } };
    try { onSave(await saveWorkspaceRecord(record)); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const restore = async (record: Feedback) => {
    setError(''); setBusy(record.id);
    try { onSave(await saveWorkspaceRecord({ ...record, data: { ...record.data, status: 'reset', snoozedUntil: null } })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">A few things worth revisiting</h2><p className="mt-2 text-sm text-gray-400">Up to three suggestions from your saved cards and decisions. Nothing is sent as a notification.</p></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!discoveries.length && <p className="rounded-xl border border-brand-border p-6 text-gray-400">Nothing useful to surface right now. Add a project goal or return after a snooze expires.</p>}
    <div className="grid gap-4 lg:grid-cols-3">{discoveries.map(s => <article key={s.id} className="flex flex-col rounded-2xl border border-brand-border bg-[#11151a] p-5">
      <p className="text-xs uppercase tracking-widest text-amber-300">{s.kind === 'resurface' ? 'Earlier material' : s.kind}</p>
      <h3 className="mt-3 break-words font-semibold">{s.title}</h3><p className="mt-3 flex-1 text-sm leading-6 text-gray-400">{s.reason}</p>
      <div className="mt-4 space-y-2">{s.sourceIds.map((id: string) => <Link key={id} href={`/card/${id}`} className="block text-sm text-amber-200 underline">{items.find(i => i.id === id)?.title || 'Source card'}</Link>)}</div>
      {s.kind === 'connection' && <button className="mt-3 text-left text-sm text-amber-200" onClick={() => onConnect(s.sourceIds)}>Explore connection →</button>}
      {'decisionId' in s && <button className="mt-3 text-left text-sm text-amber-200" onClick={() => onDecision(s.decisionId)}>Open decision →</button>}
      <div className="mt-5 flex flex-wrap gap-3 text-sm">{(['kept', 'snoozed', 'dismissed'] as const).map(status => <button key={status} disabled={!!busy} className="rounded border border-brand-border px-2 py-2 disabled:opacity-40" onClick={() => respond(s, status)}>{status === 'kept' ? 'Keep' : status === 'snoozed' ? 'Snooze 7 days' : 'Dismiss'}</button>)}</div>
    </article>)}</div>
    <details className="rounded-xl border border-brand-border p-4"><summary className="cursor-pointer text-sm text-gray-400">Kept discoveries ({feedback.filter(f => f.data.status === 'kept').length})</summary><div className="mt-3 space-y-4">{feedback.filter(f => f.data.status === 'kept').map(f => <div key={f.id}><p>{f.data.title || 'Kept discovery'}</p><p className="text-sm text-gray-400">{f.data.reason}</p>{f.data.sourceIds?.map(id => <Link className="mr-3 text-sm text-amber-200 underline" key={id} href={`/card/${id}`}>Open source</Link>)}</div>)}</div></details>
    <details className="rounded-xl border border-brand-border p-4"><summary className="cursor-pointer text-sm text-gray-400">Manage discovery choices</summary><div className="mt-3 space-y-3">{feedback.filter(f => f.data.status !== 'reset').map(f => <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{f.data.title || 'Discovery'} · {f.data.status}{f.data.snoozedUntil ? ` until ${new Date(f.data.snoozedUntil).toLocaleDateString()}` : ''}</span><button disabled={!!busy} className="text-amber-200 underline" onClick={() => restore(f)}>Restore suggestion</button></div>)}</div></details>
  </section>;
}
