import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { rateLimit } from "@/lib/rate-limit";
import { hybridSearchItems } from "@/lib/search-items";
import { buildAskContext, trimAskHistory } from "@/lib/ask-brain.mjs";

const DEFAULT_ASK_MODEL = "gpt-5.4-mini";

export const maxDuration = 60;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

/**
 * POST /api/ask  (roadmap 2.13 — "Ask my brain")
 * Body: { question: string, history?: [{ role: "user"|"assistant", content }] }
 *
 * RAG over the item corpus: retrieves the most relevant cards with the same
 * hybrid search that powers ?q= (semantic ranking when embeddings exist),
 * then answers strictly from those cards with [n] citations.
 * Response: { answer, sources: [{ id, title, url, type }] }.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = rateLimit(`ask:${ip}`);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null) as { question?: unknown; history?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 1_000) : "";
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });
  const history = trimAskHistory(body?.history);

  try {
    const result = await hybridSearchItems(question, { semanticMode: "auto" });
    const { contextText, sources } = buildAskContext(result.rows);

    if (sources.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find anything in your brain related to that. Try rephrasing, or capture some cards about it first.",
        sources: [],
      });
    }

    const historyText = history.length > 0
      ? `\n\nConversation so far:\n${history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}`
      : "";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASK_MODEL || process.env.OPENAI_SUMMARY_MODEL || DEFAULT_ASK_MODEL,
        instructions:
          "You answer questions about the user's personal knowledge base (their 'second brain'). " +
          "Use ONLY the numbered source cards provided. Cite cards inline as [1], [2] etc. wherever they support a claim. " +
          "If the sources don't contain the answer, say so plainly. Be concise; plain text only.",
        input: `Source cards:\n\n${contextText}${historyText}\n\nQuestion: ${question}`,
        max_output_tokens: 700,
      }),
    });

    const data = await response.json().catch(() => ({})) as OpenAIResponse;
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Ask failed" },
        { status: 502 }
      );
    }

    const answer = extractOpenAIText(data).trim();
    if (!answer) return NextResponse.json({ error: "Empty answer from model" }, { status: 502 });

    return NextResponse.json({ answer, sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractOpenAIText(data: OpenAIResponse): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output || [])
    .flatMap(item => item.content || [])
    .map(content => content.text || "")
    .join("\n")
    .trim();
}
