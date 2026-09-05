import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/api-key';
import { jsonError, serverError } from '@/lib/api-errors';
import { workspaceRecordSchema, workspaceBackupSchema, WORKSPACE_PREFIX } from '@/lib/workspace-model.mjs';
import { listWorkspaceRecords, writeWorkspaceRecord, restoreWorkspaceRecords } from '@/lib/workspace-store';

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  const cursor = req.nextUrl.searchParams.get('cursor') || '';
  if (cursor && (!cursor.startsWith(WORKSPACE_PREFIX) || cursor.length > 150)) return jsonError(400, 'Invalid cursor');
  try { return NextResponse.json(await listWorkspaceRecords(cursor)); }
  catch (error) { return serverError(error); }
}

export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  const raw = await req.text();
  if (raw.length > 500000) return jsonError(413, 'Conversation is too large. Start a new conversation.');
  let body;
  try { body = JSON.parse(raw); } catch { return jsonError(400, 'Invalid JSON'); }
  const parsed = workspaceRecordSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'Invalid workspace record', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
  try {
    const result = await writeWorkspaceRecord(parsed.data);
    if (result.conflict) return NextResponse.json({ error: 'This record changed in another tab. Your draft is still here; reload the saved version before replacing it.', current: result.record }, { status: 409 });
    return NextResponse.json(result.record);
  } catch (error) { return serverError(error); }
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  const raw = await req.text();
  if (raw.length > 10000000) return jsonError(413, 'Backup exceeds 10 MB.');
  let body;
  try { body = JSON.parse(raw); } catch { return jsonError(400, 'Invalid JSON'); }
  const parsed = workspaceBackupSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'Invalid workspace backup. No records were imported.');
  try { return NextResponse.json(await restoreWorkspaceRecords(parsed.data.records)); }
  catch (error) { return serverError(error); }
}
