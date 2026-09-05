import { NextRequest, NextResponse, after } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { items } from '@/db/schema';
import { checkApiKey } from '@/lib/api-key';
import { jsonError, serverError } from '@/lib/api-errors';
import { saveKnowledgeSchema } from '@/lib/workspace-model.mjs';
import { embeddingsEnabled } from '@/lib/embeddings.mjs';
import { updateItemEmbedding } from '@/lib/embedding-store';
import { readWorkspaceRecord } from '@/lib/workspace-store';

/** Idempotent create: the client keeps the same output id when retrying. */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  const parsed = saveKnowledgeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'A title and content are required.');
  const { id, title, content, type, category, sourceIds } = parsed.data;
  try {
    const sources = sourceIds.length ? await db.select({ id: items.id, title: items.title }).from(items).where(inArray(items.id, sourceIds)).limit(100) : [];
    const missingIds = sourceIds.filter(id => !sources.some(s => s.id === id));
    const decisions = await Promise.all(missingIds.map(id => readWorkspaceRecord('decision', id)));
    const [created] = await db.insert(items).values({
      id, title, content, type, category, tags: ['brain-output'], reviewedAt: new Date(), workflowStatus: 'active',
      websiteLinks: [...sources.map(s => ({ label: s.title || 'Source card', url: new URL(`/card/${s.id}`, req.url).href })), ...decisions.filter(d => d?.kind === 'decision').map(d => ({ label: d!.data.title, url: new URL('/workspace?tab=Decisions', req.url).href }))],
    }).onConflictDoNothing({ target: items.id }).returning();
    const row = created || (await db.select().from(items).where(eq(items.id, id)).limit(1))[0];
    if (!row || row.title !== title || row.content !== content || row.type !== type) return jsonError(409, 'This saved output already exists with different content. Open its card to edit it.');
    if (created && embeddingsEnabled()) after(() => updateItemEmbedding(id));
    return NextResponse.json(row, { status: created ? 201 : 200 });
  } catch (error) { return serverError(error); }
}
