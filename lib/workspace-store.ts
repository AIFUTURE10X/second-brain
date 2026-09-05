import { sql } from '@/db';
import { WORKSPACE_PREFIX, workspaceKey, workspaceRecordSchema } from './workspace-model.mjs';
import type { WorkspaceRecord } from './workspace-types';

export async function listWorkspaceRecords(cursor = '') {
  const rows = await sql.query('SELECT key, value FROM settings WHERE starts_with(key, $1) AND key > $2 ORDER BY key LIMIT 101', [WORKSPACE_PREFIX, cursor]);
  return { records: rows.slice(0, 100).map(r => workspaceRecordSchema.parse(r.value)), nextCursor: rows.length > 100 ? rows[99].key as string : null };
}

export async function readWorkspaceRecord(kind: string, id: string): Promise<WorkspaceRecord | null> {
  const rows = await sql.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [`${WORKSPACE_PREFIX}${kind}:${id}`]);
  return rows[0] ? workspaceRecordSchema.parse(rows[0].value) : null;
}

export async function readProjectDecisions(projectId: string) {
  const rows = await sql.query("SELECT value FROM settings WHERE starts_with(key, $1) AND value->'data'->>'projectId' = $2 ORDER BY updated_at DESC LIMIT 20", [`${WORKSPACE_PREFIX}decision:`, projectId]);
  return rows.map(r => workspaceRecordSchema.parse(r.value)).filter(r => r.kind === 'decision');
}

/** Revision comparison occurs in the UPDATE, not just in a preceding read. */
export async function writeWorkspaceRecord(record: WorkspaceRecord) {
  const next = { ...record, revision: record.revision + 1 };
  const key = workspaceKey(record);
  const rows = record.revision === 0
    ? await sql.query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING RETURNING value', [key, JSON.stringify(next)])
    : await sql.query("UPDATE settings SET value = $2::jsonb, updated_at = NOW() WHERE key = $1 AND (value->>'revision')::int = $3 RETURNING value", [key, JSON.stringify(next), record.revision]);
  if (rows[0]) return { record: workspaceRecordSchema.parse(rows[0].value), conflict: false as const };
  return { record: await readWorkspaceRecord(record.kind, record.id), conflict: true as const };
}

export async function restoreWorkspaceRecords(records: WorkspaceRecord[]) {
  let imported = 0;
  // Additive restore: existing records are never replaced.
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50).map(r => ({ key: workspaceKey(r), value: { ...r, revision: Math.max(1, r.revision) } }));
    const rows = await sql.query("INSERT INTO settings (key, value) SELECT entry->>'key', entry->'value' FROM jsonb_array_elements($1::jsonb) entry ON CONFLICT (key) DO NOTHING RETURNING key", [JSON.stringify(batch)]);
    imported += rows.length;
  }
  return { imported, skipped: records.length - imported };
}
