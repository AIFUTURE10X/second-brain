import Anthropic from "@anthropic-ai/sdk";

interface TagResult {
  tags: string[];
  category: string;
}

/**
 * Uses Claude to suggest tags and a category for an item.
 * Returns empty arrays/strings if ANTHROPIC_API_KEY is not set or AI fails.
 * Uses Haiku for speed + low cost.
 */
export async function aiTagAndCategorize(input: {
  title: string;
  content: string;
  url: string;
  ogTitle: string;
  ogDescription: string;
  siteName: string;
  existingCategories: string[];
}): Promise<TagResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { tags: [], category: "" };

  const context = [
    input.title && `Title: ${input.title}`,
    input.ogTitle && input.ogTitle !== input.title && `Page title: ${input.ogTitle}`,
    input.ogDescription && `Description: ${input.ogDescription}`,
    input.content && `Content: ${input.content.slice(0, 500)}`,
    input.url && `URL: ${input.url}`,
    input.siteName && `Site: ${input.siteName}`,
  ].filter(Boolean).join("\n");

  const catList = input.existingCategories.length > 0
    ? `Existing categories: ${input.existingCategories.join(", ")}. Pick one if it fits, or suggest a new one.`
    : "No categories exist yet. Suggest one if appropriate.";

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `You are a personal knowledge base tagger. Given this saved item, suggest 3-5 short lowercase tags and one category.

${context}

${catList}

Reply ONLY with JSON, no explanation:
{"tags": ["tag1", "tag2", "tag3"], "category": "Category Name"}`,
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { tags: [], category: "" };

    const parsed = JSON.parse(match[0]);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 5) : [],
      category: typeof parsed.category === "string" ? parsed.category : "",
    };
  } catch {
    return { tags: [], category: "" };
  }
}
