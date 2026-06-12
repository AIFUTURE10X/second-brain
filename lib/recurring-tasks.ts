import { db } from "@/db";
import { items } from "@/db/schema";
import { buildNextTaskOccurrence } from "@/lib/recurrence.mjs";
import { initialReadingStatus } from "@/lib/reading-status.mjs";

/**
 * Recurring tasks (roadmap 2.11): completing a recurring task spawns the next
 * open occurrence (fresh card, checklist reset) so it reappears in the task
 * list while the completed one stays as history. Never throws — a failed
 * spawn must not fail the completing write.
 */
export async function spawnNextTaskOccurrence(task: {
  type: string;
  recurrence?: string | null;
  title?: string | null;
  content?: string | null;
  url?: string | null;
  notes?: string | null;
  tags?: unknown;
  category?: string | null;
  checklistItems?: unknown;
}): Promise<void> {
  try {
    const values = buildNextTaskOccurrence(task);
    if (!values) return;
    await db.insert(items).values({
      ...values,
      readingStatus: initialReadingStatus(values.type),
    });
  } catch (error) {
    console.error("Recurring task spawn failed:", error);
  }
}
