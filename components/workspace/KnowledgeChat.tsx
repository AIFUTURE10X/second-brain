'use client';
import { useEffect, useRef, useState } from 'react';
import type { Item } from '@/lib/brain-model';
import type { AskMessage, AskSource, Conversation, KnowledgeMode, Project } from '@/lib/workspace-types';
import { saveWorkspaceRecord, workspaceRequest } from '@/lib/workspace-client';
import { SourceEvidence } from './SourceEvidence';
import { SaveOutput } from './SaveOutput';

export function KnowledgeChat({ project, itemIds = [], items = [], initial, mode = 'ask', initialQuestion = '', onSaved, onLock }: {
  project?: Project; itemIds?: string[]; items?: Item[]; initial?: Conversation; mode?: KnowledgeMode; initialQuestion?: string; onSaved?: (record: Conversation) => void; onLock?: (locked: boolean) => void;
}) {
  const [record, setRecord] = useState<Conversation>(() => initial || { id: crypto.randomUUID(), kind: 'conversation', revision: 0, data: { title: 'New conversation', projectId: project?.id || null, itemIds, messages: [] } });
  const [input, setInput] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [coverage, setCoverage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const scroll = useRef<HTMLDivElement>(null);
  const lastSaved = useRef(record);
  useEffect(() => { onLock?.(busy || unsaved || editing !== null); }, [busy, unsaved, editing, onLock]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [record.data.messages.length, busy]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (unsaved || busy) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved, busy]);

  const persist = async (next: Conversation) => {
    try { const saved = await saveWorkspaceRecord(next); lastSaved.current = saved; setRecord(saved); setUnsaved(false); onSaved?.(saved); return true; }
    catch (err) { setError((err as Error).message); setUnsaved(true); return false; }
  };
  const retrySave = async (copy = false) => {
    setBusy(true); setError('');
    await persist(copy ? { ...record, id: crypto.randomUUID(), revision: 0 } : record);
    setBusy(false);
  };
  const ask = async () => {
    if (!input.trim() || busy || unsaved || record.data.messages.length >= 40) return;
    const question = input.trim();
    const next: Conversation = { ...record, data: { ...record.data, title: record.data.messages.length ? record.data.title : question.slice(0, 160), messages: [...record.data.messages, { id: crypto.randomUUID(), role: 'user', content: question, sources: [] }] } };
    setRecord(next); setInput(''); setBusy(true); setError(''); setUnsaved(true);
    try {
      const answer = await workspaceRequest<{ answer: string; sources: AskSource[]; attachments?: AskSource[]; coverage?: string }>('/api/ask', {
        method: 'POST', body: JSON.stringify({ question, history: record.data.messages.slice(-6).map(m => ({ role: m.role, content: m.content })), mode, itemIds: record.data.itemIds, projectId: record.data.projectId || undefined,
          attachments: attachments.map(key => { const [itemId, index] = key.split(':'); return { itemId, index: Number(index) }; }),
        }),
      });
      next.data.messages.push({ id: crypto.randomUUID(), role: 'assistant', content: answer.answer, sources: [...answer.sources, ...(answer.attachments || [])] });
      setRecord({ ...next }); setCoverage(answer.coverage || '');
      await persist(next);
    } catch (err) {
      // Keep the user's question available to retry; failed provider text is not evidence.
      setRecord(record); setInput(question); setUnsaved(false); setError((err as Error).message);
    } finally { setBusy(false); }
  };
  const savedOutput = async (message: AskMessage, id: string) => {
    setEditing(null);
    const next = { ...record, data: { ...record.data, messages: record.data.messages.map(m => m.id === message.id ? { ...m, savedCardId: id } : m) } };
    setRecord(next); setUnsaved(true); setBusy(true); await persist(next); setBusy(false);
  };
  const files = items.filter(i => record.data.itemIds.includes(i.id)).flatMap(i => (i.attachments || []).map((a, index) => ({ ...a, key: `${i.id}:${index}` }))).filter(a => a.contentType === 'application/pdf' || a.contentType.startsWith('image/'));
  return <section className="flex min-h-[28rem] flex-col rounded-2xl border border-brand-border bg-[#11151a]" aria-label="Knowledge conversation">
    <div className="border-b border-brand-border p-4"><h2 className="font-semibold text-amber-200">{project ? project.data.name : 'Ask my brain'}</h2>
      <p className="mt-1 text-xs text-gray-400">{record.data.itemIds.length ? `${record.data.itemIds.length} selected cards` : project ? 'Project sources' : 'Search across your library'} · {unsaved ? 'Unsaved changes' : record.revision ? 'Conversation saved' : 'Saves after an answer'}</p></div>
    <div ref={scroll} className="max-h-[55vh] flex-1 space-y-4 overflow-y-auto p-4">
      {!record.data.messages.length && <p className="py-8 text-sm text-gray-400">Ask a question or use the prepared prompt. Answers include the source excerpts used.</p>}
      {record.data.messages.map(message => <article key={message.id} className={`rounded-xl p-3 ${message.role === 'user' ? 'ml-6 bg-amber-500/10' : 'bg-black/20'}`}>
        <p className="mb-2 text-xs text-gray-500">{message.role === 'user' ? 'You' : 'Second Brain'}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">{message.content}</p>
        {message.role === 'assistant' && <>
          <SourceEvidence sources={message.sources} />
          {message.savedCardId ? <a className="mt-3 inline-block text-sm text-amber-200 underline" href={`/card/${message.savedCardId}`} target="_blank" rel="noreferrer">Open saved card</a> : <button className="mt-3 rounded border border-brand-border px-3 py-2 text-sm text-amber-200 disabled:opacity-40" onClick={() => setEditing(message.id)} disabled={busy || unsaved || editing !== null}>Save answer / create task</button>}
          {editing === message.id && <SaveOutput message={message} category={project?.data.category || ''} onCancel={() => setEditing(null)} onSaved={id => void savedOutput(message, id)} />}
        </>}
      </article>)}
      {busy && <p role="status" className="text-sm text-amber-200">Working…</p>}
    </div>
    <div className="space-y-3 border-t border-brand-border p-4">
      {coverage && <p className="text-xs text-gray-500">{coverage}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {unsaved && !busy && <div className="flex flex-wrap gap-3 text-sm"><button onClick={() => retrySave()}>Retry save</button><button onClick={() => retrySave(true)}>Save as new conversation</button><button onClick={() => { setRecord(lastSaved.current); setUnsaved(false); setError(''); }}>Discard unsaved changes</button></div>}
      {files.length > 0 && <details><summary className="cursor-pointer text-xs text-gray-400">Read uploaded PDFs / images with this question</summary><p className="my-2 text-xs text-gray-500">Choose up to 3 files, totaling 10 MB. Sends these files to your configured AI provider when you ask.</p>{files.map(f => <label key={f.key} className="my-1 flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy || (!attachments.includes(f.key) && attachments.length >= 3)} checked={attachments.includes(f.key)} onChange={e => setAttachments(old => e.target.checked ? [...old, f.key] : old.filter(k => k !== f.key))} />{f.name}</label>)}</details>}
      {record.data.messages.length >= 40 ? <p className="text-sm text-gray-400">This conversation has reached 20 exchanges. Start a new conversation to continue.</p> : <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void ask(); }}><textarea aria-label="Question" rows={2} maxLength={4000} className="min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-dark p-3 text-sm" placeholder="Ask your second brain…" value={input} onChange={e => setInput(e.target.value)} disabled={busy || unsaved} /><button type="submit" className="rounded-lg bg-amber-400 px-4 text-sm font-medium text-black disabled:opacity-40" disabled={busy || unsaved || !input.trim()}>Ask</button></form>}
    </div>
  </section>;
}
