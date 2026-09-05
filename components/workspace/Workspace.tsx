'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/brain-model';
import type { Conversation, Decision, KnowledgeMode, Project, WorkspaceRecord } from '@/lib/workspace-types';
import { loadWorkspaceRecords, workspaceRequest } from '@/lib/workspace-client';
import { CardPicker } from './CardPicker';
import { KnowledgeChat } from './KnowledgeChat';
import { ProjectEditor } from './ProjectEditor';
import { DecisionEditor } from './DecisionEditor';
import { TodayPanel } from './TodayPanel';
import { WorkspaceBackup } from './WorkspaceBackup';

const tabs = ['Projects', 'Use this', 'Today', 'Decisions', 'Connections', 'Conversations'] as const;
type Tab = typeof tabs[number];
type Session = { key: string; mode: KnowledgeMode; itemIds: string[]; projectId?: string; question: string; initial?: Conversation };
const actions: { mode: KnowledgeMode; label: string; question: string }[] = [
  { mode: 'apply', label: 'Apply to project', question: 'How could I apply this material to my project goal? Separate evidence from proposed changes.' },
  { mode: 'experiment', label: 'Try an experiment', question: 'Propose one small experiment using these sources, with steps, a success measure and a stop condition.' },
  { mode: 'checklist', label: 'Make a checklist', question: 'Turn these sources into an actionable checklist. Mark any steps you are proposing.' },
  { mode: 'handoff', label: 'Prepare a handoff', question: 'Prepare a handoff using this evidence: objective, proposed scope, acceptance checks and unanswered questions.' },
  { mode: 'compare', label: 'Compare sources', question: 'Compare these sources. Where do they agree, differ, and leave questions unanswered?' },
];

export default function Workspace({ initialCards = [], initialTab = 'Projects' }: { initialCards?: string[]; initialTab?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(initialCards.length ? 'Use this' : tabs.find(t => t.toLowerCase() === initialTab.toLowerCase()) || 'Projects');
  const [projectId, setProjectId] = useState('');
  const [chosen, setChosen] = useState(initialCards.slice(0, 8));
  const [projectEditor, setProjectEditor] = useState<Project | 'new' | null>(null);
  const [decisionEditor, setDecisionEditor] = useState<Decision | 'new' | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [locked, setLocked] = useState(false);
  const [decisionQuery, setDecisionQuery] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cards, saved] = await Promise.all([workspaceRequest<Item[]>('/api/items'), loadWorkspaceRecords()]);
      setItems(cards); setRecords(saved);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const upsert = useCallback((record: WorkspaceRecord) => setRecords(old => [...old.filter(r => !(r.id === record.id && r.kind === record.kind)), record]), []);
  const projects = records.filter((r): r is Project => r.kind === 'project');
  const decisions = records.filter((r): r is Decision => r.kind === 'decision');
  const conversations = records.filter((r): r is Conversation => r.kind === 'conversation');
  const project = projects.find(p => p.id === projectId);
  const projectItems = project ? items.filter(i => project.data.itemIds.includes(i.id) || (!!project.data.category && i.category === project.data.category)) : items;
  const start = (mode: KnowledgeMode, question: string, ids = chosen, scope = projectId) => {
    if (locked) return;
    setSession({ key: crypto.randomUUID(), mode, question, itemIds: ids, projectId: scope || undefined });
  };
  const projectSelect = <label className="block text-sm text-gray-400">Project scope<select aria-label="Workspace project" value={projectId} onChange={e => { setProjectId(e.target.value); setChosen([]); }} className="ml-3 max-w-full rounded-lg border border-brand-border bg-brand-dark p-2"><option value="">No project / whole library</option>{projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}</select></label>;
  return <main className="mx-auto max-w-6xl px-4 py-6 text-gray-200 sm:px-8">
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><Link href="/" onClick={e => { if (locked || projectEditor || decisionEditor) e.preventDefault(); }} aria-disabled={locked || !!projectEditor || !!decisionEditor} className="text-sm text-amber-300">← Library</Link><h1 className="mt-2 text-2xl font-semibold">Your working brain</h1><p className="mt-2 text-sm text-gray-400">Turn saved knowledge into useful next steps.</p></div><button className="rounded-lg border border-brand-border px-3 py-2 text-sm disabled:opacity-40" disabled={loading || locked || !!projectEditor || !!decisionEditor} onClick={refresh}>Refresh workspace</button></header>
    <nav aria-label="Workspace sections" className="mb-6 flex flex-wrap gap-2">{tabs.map(t => <button key={t} disabled={!!projectEditor || !!decisionEditor} onClick={() => setTab(t)} aria-pressed={tab === t} className={`rounded-lg border px-3 py-2 text-sm ${tab === t ? 'border-amber-600 bg-amber-400/10 text-amber-200' : 'border-brand-border text-gray-400'}`}>{t}</button>)}</nav>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-900 p-4 text-red-300">{error} <button className="underline" onClick={refresh}>Retry loading</button></div>}
    {loading ? <p role="status">Loading your workspace…</p> : !error && <>
      {tab === 'Projects' && <section className="space-y-5">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Pick up where you left off</h2><button className="rounded bg-amber-400 px-3 py-2 text-sm text-black" disabled={!!projectEditor} onClick={() => setProjectEditor('new')}>New project</button></div>
        {!projects.length && !projectEditor && <p className="rounded-xl border border-brand-border p-6 text-gray-400">Create a project with a goal and a category or a few source cards. Its briefing brings the relevant material together.</p>}
        {projectEditor && <ProjectEditor key={projectEditor === 'new' ? 'new' : projectEditor.id} initial={projectEditor === 'new' ? undefined : projectEditor} items={items} onCancel={() => setProjectEditor(null)} onSave={p => { upsert(p); setProjectId(p.id); setProjectEditor(null); }} />}
        <div className="grid gap-4 md:grid-cols-2">{projects.map(p => <article key={p.id} className="rounded-2xl border border-brand-border bg-[#11151a] p-5"><h3 className="text-lg font-semibold text-amber-200">{p.data.name}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{p.data.goal}</p><p className="mt-3 text-xs text-gray-500">{items.filter(i => p.data.itemIds.includes(i.id) || (!!p.data.category && i.category === p.data.category)).length} source cards · {decisions.filter(d => d.data.projectId === p.id).length} decisions</p>{p.data.questions && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-400">Open questions: {p.data.questions}</p>}<div className="mt-4 flex flex-wrap gap-3 text-sm"><button disabled={locked} onClick={() => start('brief', 'Where was I? Summarize the project goal, recorded decisions, relevant material, open questions and the next three proposed actions.', [], p.id)} className="rounded bg-amber-400 px-3 py-2 text-black disabled:opacity-40">Where was I?</button><button onClick={() => { setProjectId(p.id); setChosen([]); setTab('Use this'); }}>Use this project</button><button disabled={!!projectEditor} onClick={() => setProjectEditor(p)}>Edit project</button></div></article>)}</div>
      </section>}
      {tab === 'Use this' && <section className="space-y-5"><h2 className="text-xl font-semibold">Put your sources to work</h2>{projectSelect}<CardPicker items={projectItems} selected={chosen} onChange={setChosen} /><p className="text-sm text-gray-400">Choose an action, review the prepared question, then ask. Generated plans remain proposals until you save them.</p><div className="flex flex-wrap gap-2">{actions.map(a => <button key={a.mode} disabled={locked || !chosen.length || (a.mode === 'apply' && !projectId) || (a.mode === 'compare' && chosen.length < 2)} onClick={() => start(a.mode, a.question)} className="rounded-lg border border-brand-border px-3 py-2 text-sm text-amber-200 disabled:opacity-40">{a.label}</button>)}<button disabled={locked} className="rounded-lg border border-brand-border px-3 py-2 text-sm" onClick={() => start('ask', '')}>Ask a question</button></div></section>}
      {tab === 'Today' && <TodayPanel items={items} projects={projects} decisions={decisions} feedback={records.filter(r => r.kind === 'feedback')} onSave={upsert} onConnect={ids => { setTab('Connections'); setChosen(ids); }} onDecision={id => { setTab('Decisions'); setDecisionEditor(decisions.find(d => d.id === id) || null); }} />}
      {tab === 'Decisions' && <section className="space-y-5"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Remember why you chose</h2><button className="rounded bg-amber-400 px-3 py-2 text-sm text-black" disabled={!!decisionEditor} onClick={() => setDecisionEditor('new')}>Record decision</button></div>
        {decisionEditor && <DecisionEditor key={decisionEditor === 'new' ? 'new' : decisionEditor.id} initial={decisionEditor === 'new' ? undefined : decisionEditor} items={items} projects={projects} onCancel={() => setDecisionEditor(null)} onSave={d => { upsert(d); setDecisionEditor(null); }} />}
        <input aria-label="Find decisions" placeholder="Find a past choice or reason…" value={decisionQuery} onChange={e => setDecisionQuery(e.target.value)} className="w-full rounded-lg border border-brand-border bg-brand-dark p-3 text-sm" />
        {!decisions.length && <p className="text-gray-400">Record the choice, reasoning, alternatives and a date to reconsider it.</p>}
        {decisions.filter(d => `${d.data.title} ${d.data.choice} ${d.data.rationale}`.toLowerCase().includes(decisionQuery.toLowerCase())).map(d => <article key={d.id} className="rounded-xl border border-brand-border p-5"><h3 className="font-semibold text-amber-200">{d.data.title}</h3><p className="mt-2 whitespace-pre-wrap">{d.data.choice}</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-400">Why: {d.data.rationale}</p>{d.data.alternatives && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-400">Alternatives: {d.data.alternatives}</p>}<p className="mt-3 text-xs text-gray-500">{projects.find(p => p.id === d.data.projectId)?.data.name || 'General'}{d.data.reviewOn ? ` · Reconsider ${d.data.reviewOn}` : ''}</p><div className="my-3 flex flex-wrap gap-3">{d.data.sourceIds.map(id => <Link key={id} className="text-sm text-amber-200 underline" href={`/card/${id}`}>{items.find(i => i.id === id)?.title || 'Source card'}</Link>)}</div><button disabled={!!decisionEditor} onClick={() => setDecisionEditor(d)} className="text-sm underline">Edit decision</button></article>)}
      </section>}
      {tab === 'Connections' && <section className="space-y-5"><h2 className="text-xl font-semibold">Find an unexpected connection</h2><p className="text-sm text-gray-400">Choose two cards from anywhere in your library. Explore an evidence-backed hypothesis and a small experiment.</p><CardPicker items={items} selected={chosen} onChange={setChosen} limit={2} /><button disabled={locked || chosen.length !== 2} onClick={() => start('connections', 'Find a useful unexpected connection between these two sources. Cite both, distinguish facts from your hypothesis, and propose a small experiment.', chosen, '')} className="rounded bg-amber-400 px-4 py-2 text-sm text-black disabled:opacity-40">Prepare connection question</button></section>}
      {tab === 'Conversations' && <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Saved conversations</h2><button disabled={locked} onClick={() => start('ask', '', [], '')} className="rounded bg-amber-400 px-3 py-2 text-sm text-black disabled:opacity-40">New conversation</button></div>{!conversations.length && <p className="text-gray-400">Conversations appear here after an answer is saved.</p>}{conversations.map(c => <button disabled={locked} className="block w-full rounded-xl border border-brand-border p-4 text-left disabled:opacity-40" key={c.id} onClick={() => setSession({ key: crypto.randomUUID(), mode: 'ask', question: '', itemIds: c.data.itemIds, projectId: c.data.projectId || undefined, initial: c })}><span className="text-amber-200">{c.data.title}</span><span className="ml-3 text-xs text-gray-500">{c.data.messages.length} messages</span></button>)}</section>}
    </>}
      {session && <div className="mt-7" id="conversation"><KnowledgeChat key={session.key} initial={session.initial} items={items} itemIds={session.itemIds} project={projects.find(p => p.id === session.projectId)} initialQuestion={session.question} mode={session.mode} onSaved={upsert} onLock={setLocked} /></div>}
    <WorkspaceBackup records={records} onRestore={refresh} disabled={loading || !!error || locked || !!projectEditor || !!decisionEditor} />
  </main>;
}
