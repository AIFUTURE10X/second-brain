// The quick-capture bar's grammar, mirroring the Telegram bot: URL → link, "/t text" → task,
// "/m text" → memory, "/idea link or idea" → a business idea for the AI OS, anything else →
// thought. Pure module, so node:test loads it directly.
import { ideaCapturePayload, parseIdeaCommand } from "./business-idea.mjs";

/** Captured text → { payload, label } for POST /api/items, or { error } to show instead. */
export function quickCapturePayload(text) {
  const ideaText = parseIdeaCommand(text);
  if (ideaText === "") return { error: "Add a link or the idea after /idea" };
  if (ideaText) return { payload: ideaCapturePayload(ideaText), label: "Business idea (the AI OS analyses it shortly)" };
  const taskMatch = text.match(/^\/t\s+(.+)$/i);
  if (taskMatch) return { payload: { type: "task", title: taskMatch[1] }, label: "Task" };
  const memoryMatch = text.match(/^\/m\s+(.+)$/i);
  if (memoryMatch) return { payload: { type: "memory", title: memoryMatch[1] }, label: "Memory" };
  if (/^https?:\/\/\S+$/i.test(text)) return { payload: { type: "link", url: text }, label: "Link" };
  return { payload: { type: "thought", title: text }, label: "Thought" };
}
