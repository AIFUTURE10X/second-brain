import { workspaceRecordSchema } from './workspace-model.mjs';
import type { WorkspaceRecord } from './workspace-types';

export async function workspaceRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(65000), ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}). Your draft has been kept.`);
  if (body === null) throw new Error('The server returned an unreadable response.');
  return body as T;
}

export async function loadWorkspaceRecords(): Promise<WorkspaceRecord[]> {
  const all: WorkspaceRecord[] = [];
  let cursor: string | null = '';
  const seen = new Set<string>();
  do {
    if (seen.has(cursor) || seen.size >= 100) throw new Error('Could not finish loading workspace records.');
    seen.add(cursor);
    const page: { records: unknown[]; nextCursor: string | null } = await workspaceRequest(`/api/workspace/records?cursor=${encodeURIComponent(cursor)}`);
    all.push(...page.records.map(r => workspaceRecordSchema.parse(r)));
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

export async function saveWorkspaceRecord<T extends WorkspaceRecord>(record: T): Promise<T> {
  return workspaceRequest<T>('/api/workspace/records', { method: 'PUT', body: JSON.stringify(record) });
}
