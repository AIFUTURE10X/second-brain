import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { items, itemTranscripts } from '@/db/schema';
import { checkApiKey } from '@/lib/api-key';
import { jsonError, serverError } from '@/lib/api-errors';
import { rateLimit } from '@/lib/rate-limit';
import { hybridSearchItems, type SearchRow } from '@/lib/search-items';
import { buildAskContext, trimAskHistory, ASK_MAX_SOURCES } from '@/lib/ask-brain.mjs';
import { askRequestSchema } from '@/lib/workspace-model.mjs';
import { readWorkspaceRecord, readProjectDecisions } from '@/lib/workspace-store';
import { generateKnowledgeAnswer, prepareAttachmentInputs } from '@/lib/knowledge-provider.mjs';
import { knowledgeTokens } from '@/lib/knowledge-passages.mjs';

export const maxDuration = 60;

// Cite cards inline using the numbered evidence assembled by buildAskContext.
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`ask:${ip}`).allowed) return jsonError(429, 'Too many requests');
  const raw = await req.text();
  if (raw.length > 100000) return jsonError(413, 'Request is too large. Start a new conversation.');
  let body;
  try { body = JSON.parse(raw); } catch { return jsonError(400, 'Invalid JSON'); }
  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'Choose valid sources and enter a question.');
  const { question, itemIds, projectId, mode, attachments } = parsed.data;
  if (itemIds.length > ASK_MAX_SOURCES) return jsonError(400, 'Choose up to eight cards for one answer.');
  if (mode === 'connections' && itemIds.length !== 2) return jsonError(400, 'Choose exactly two cards to connect.');
  if (attachments.some(a => !itemIds.includes(a.itemId))) return jsonError(400, 'Select the card containing each attachment.');
  if (!process.env.OPENAI_API_KEY) return jsonError(503, 'AI is not configured.');
  try {
    const project = projectId ? await readWorkspaceRecord('project', projectId) : null;
    if (projectId && project?.kind !== 'project') return jsonError(404, 'Project not found.');
    const scope = project?.kind === 'project' ? project.data : null;
    const projectFilter = scope ? or(eq(items.category, scope.category || '__no_category__'), inArray(items.id, scope.itemIds.length ? scope.itemIds : ['00000000-0000-0000-0000-000000000000'])) : undefined;
    let rows: SearchRow[];
    if (itemIds.length) {
      rows = await db.select().from(items).where(and(inArray(items.id, itemIds), isNull(items.archivedAt), projectFilter)).limit(ASK_MAX_SOURCES);
      if (rows.length !== new Set(itemIds).size) return jsonError(400, 'Some selected cards are unavailable or outside this project. Refresh your selection.');
    } else if (scope) {
      rows = await db.select().from(items).where(and(projectFilter, isNull(items.archivedAt))).orderBy(desc(items.updatedAt)).limit(100);
    } else {
      const previous = parsed.data.history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
      rows = (await hybridSearchItems(`${question} ${previous.slice(0, 300)}`, { semanticMode: "auto" })).rows.slice(0, 100);
    }
    const ids = rows.map(r => String(r.id));
    const transcripts = ids.length ? await db.select({ itemId: itemTranscripts.itemId, text: itemTranscripts.text }).from(itemTranscripts).where(inArray(itemTranscripts.itemId, ids)).limit(100) : [];
    const byId = new Map(transcripts.map(t => [t.itemId, t.text]));
    const tokens = knowledgeTokens(question);
    const enriched: (SearchRow & { transcript: string })[] = rows.map(row => ({ ...row, transcript: byId.get(String(row.id)) || '' }));
    if (!itemIds.length) enriched.sort((a, b) => {
      const score = (r: typeof a) => { const haystack = `${r.title} ${r.content} ${r.transcript}`.toLowerCase(); return tokens.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0); };
      return score(b) - score(a);
    });
    const decisions = projectId && !itemIds.length ? (await readProjectDecisions(projectId)).slice(0, 2) : [];
    const decisionRows = decisions.map(d => ({ id: d.id, title: d.data.title, type: 'decision', url: new URL('/workspace?tab=Decisions', req.url).href, content: `Recorded choice: ${d.data.choice}\nReason: ${d.data.rationale}\nAlternatives: ${d.data.alternatives}\nReconsider: ${d.data.reviewOn}` }));
    const { contextText, sources } = buildAskContext([...decisionRows, ...enriched.slice(0, ASK_MAX_SOURCES - decisionRows.length)], { question });
    let files;
    try { files = prepareAttachmentInputs(enriched, attachments); } catch (error) { return jsonError(400, (error as Error).message); }
    if (!sources.length) return NextResponse.json({ answer: 'I could not find relevant saved material in this scope. Add cards or choose a different scope.', sources: [] });
    const projectContext = scope ? `Project goal (user supplied): ${scope.goal}\nOpen questions: ${scope.questions}\n` : '';
    const answer = await generateKnowledgeAnswer({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_ASK_MODEL || process.env.OPENAI_SUMMARY_MODEL || 'gpt-5.4-mini',
      context: projectContext + contextText, question, mode,
      history: trimAskHistory(parsed.data.history), attachments: files.inputs,
    }).catch(error => { throw new KnowledgeProviderError((error as Error).message); });
    return NextResponse.json({ answer, sources, attachments: files.sources, coverage: `Used ${sources.length} of ${rows.length} retrieved cards${rows.length === 100 ? ' (retrieval limited to 100)' : ''}.` });
  } catch (error) {
    if (error instanceof KnowledgeProviderError) return jsonError(502, error.message);
    return serverError(error);
  }
}

class KnowledgeProviderError extends Error {}
