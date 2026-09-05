import { z } from 'zod';

export const WORKSPACE_PREFIX = 'knowledge_workspace:';
const ids = z.array(z.string().uuid()).max(100);
const short = z.string().trim().min(1).max(160);
const text = z.string().max(8000);
const date = z.string().date().or(z.literal(''));
const passage = z.object({ label: z.string().max(100), text: z.string().max(2400), url: z.string().max(2000) });
export const askSourceSchema = z.object({ id: z.string().uuid(), title: z.string().max(1000), type: z.string(), url: z.string().max(4000), passages: z.array(passage).max(3).default([]) });
export const messageSchema = z.object({
  id: z.string().uuid(), role: z.enum(['user', 'assistant']), content: z.string().max(16000),
  sources: z.array(askSourceSchema).max(12).default([]), savedCardId: z.string().uuid().optional(),
});
const base = { id: z.string().uuid(), revision: z.number().int().min(0) };
export const workspaceRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('project'), data: z.object({ name: short, goal: text.min(1), category: z.string().max(160), itemIds: ids, questions: text }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('conversation'), data: z.object({ title: short, projectId: z.string().uuid().nullable(), itemIds: ids, messages: z.array(messageSchema).max(40) }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('decision'), data: z.object({ title: short, choice: text.min(1), rationale: text.min(1), alternatives: text, sourceIds: ids, projectId: z.string().uuid().nullable(), reviewOn: date }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('feedback'), data: z.object({ suggestionId: z.string().min(1).max(300), status: z.enum(['kept', 'dismissed', 'snoozed', 'reset']), snoozedUntil: z.string().datetime().nullable(), title: z.string().max(1000).optional(), reason: z.string().max(2000).optional(), sourceIds: ids.optional() }).strict() }).strict(),
]);
export const workspaceBackupSchema = z.object({ version: z.literal(1), records: z.array(workspaceRecordSchema).max(2000) });
export function parseWorkspaceBackup(value) { return workspaceBackupSchema.parse(JSON.parse(value)).records; }
export function workspaceKey(record) { return `${WORKSPACE_PREFIX}${record.kind}:${record.id}`; }

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(16000) })).max(40).default([]),
  itemIds: ids.default([]), projectId: z.string().uuid().optional(),
  mode: z.enum(['ask', 'brief', 'apply', 'experiment', 'checklist', 'handoff', 'compare', 'connections']).default('ask'),
  attachments: z.array(z.object({ itemId: z.string().uuid(), index: z.number().int().min(0).max(99) })).max(3).default([]),
}).strict();
export const saveKnowledgeSchema = z.object({
  id: z.string().uuid(), title: short, content: z.string().trim().min(1).max(24000),
  type: z.enum(['note', 'task']), category: z.string().max(160).default(''), sourceIds: ids.default([]),
}).strict();
