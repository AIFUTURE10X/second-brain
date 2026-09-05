import type { z } from 'zod';
import type { workspaceRecordSchema, messageSchema, askSourceSchema } from './workspace-model.mjs';

export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
export type Project = Extract<WorkspaceRecord, { kind: 'project' }>;
export type Decision = Extract<WorkspaceRecord, { kind: 'decision' }>;
export type Conversation = Extract<WorkspaceRecord, { kind: 'conversation' }>;
export type Feedback = Extract<WorkspaceRecord, { kind: 'feedback' }>;
export type AskMessage = z.infer<typeof messageSchema>;
export type AskSource = z.infer<typeof askSourceSchema>;
export type KnowledgeMode = 'ask' | 'brief' | 'apply' | 'experiment' | 'checklist' | 'handoff' | 'compare' | 'connections';
