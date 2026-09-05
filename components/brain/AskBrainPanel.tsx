'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/brain-model';
import type { Conversation, Project, WorkspaceRecord } from '@/lib/workspace-types';
import { loadWorkspaceRecords, workspaceRequest } from '@/lib/workspace-client';
import { KnowledgeChat } from '../workspace/KnowledgeChat';

interface AskBrainPanelProps {
  onClose: () => void;
  onOpenCard: (id: string) => void;
  selectedIds?: string[];
}

export function AskBrainPanel({ onClose, selectedIds = [] }: AskBrainPanelProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([workspaceRequest<Item[]>('/api/items'), loadWorkspaceRecords()])
      .then(([cards, saved]) => { if (active) { setItems(cards); setRecords(saved); setError(''); } })
      .catch(e => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [locked, onClose]);
  const conversations = records.filter((r): r is Conversation => r.kind === 'conversation');
  const selected = conversations.find(c => c.id === conversationId);
  const project = records.find((r): r is Project => r.kind === 'project' && r.id === selected?.data.projectId);
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm sm:items-center" onClick={() => { if (!locked) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Ask my brain" className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-brand-border bg-[#0D0F12] p-3" onClick={e => e.stopPropagation()}>
      <header className="mb-3 flex flex-wrap items-center gap-3"><h2 className="mr-auto font-semibold text-amber-200">Ask my brain</h2><Link className="text-sm text-amber-200 underline" href="/workspace">Workspace</Link><button aria-label="Close" className="rounded px-3 py-2 disabled:opacity-40" disabled={locked} onClick={onClose}>Close</button></header>
      {loading ? <p role="status">Loading conversations…</p> : error ? <p role="alert" className="text-red-300">{error} <button onClick={() => setAttempt(a => a + 1)} className="underline">Retry</button></p> : <>
        <label className="mb-3 block text-xs text-gray-400">Conversation<select aria-label="Saved conversation" className="ml-2 max-w-full rounded bg-brand-dark p-2 text-sm" disabled={locked} value={conversationId} onChange={e => setConversationId(e.target.value)}><option value="">New conversation{selectedIds.length ? ` (${Math.min(8, selectedIds.length)} selected cards)` : ''}</option>{conversations.map(c => <option key={c.id} value={c.id}>{c.data.title}</option>)}</select></label>
        <KnowledgeChat key={conversationId || 'new'} initial={selected} itemIds={selectedIds.slice(0, 8)} items={items} project={project} onLock={setLocked} onSaved={record => setRecords(old => [...old.filter(r => r.id !== record.id), record])} />
      </>}
      {locked && <p className="mt-2 text-xs text-gray-400">Finish saving your draft before closing.</p>}
    </div>
  </div>;
}
