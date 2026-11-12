// Suggests where a card belongs in the AI OS Asset Library, so the 🗂 picker can put one
// or two likely categories at the top. Instant and offline: it scores keywords in the
// card's own text, no AI call. Phil still makes the pick; a suggestion never files anything.
// Pure module — node:test loads it directly.

import { isAssetCategory, isAssetTag } from "./aios-asset.mjs";

/** Words that point at each category. Whole words or phrases, matched case-insensitively. */
const SIGNALS = {
  website: ["website", "web site", "landing page", "homepage", "home page", "site design", "web design", "hero section", "layout", "wireframe", "webflow", "framer", "wordpress", "shopify theme", "portfolio site", "one-pager"],
  animation: ["animation", "animations", "animate", "animated", "gsap", "scrolltrigger", "scroll effect", "scroll animation", "parallax", "hover effect", "micro-interaction", "microinteraction", "transition", "motion", "lottie", "keyframes", "custom cursor", "cursor effect", "text effect", "loader", "framer motion"],
  "3d": ["3d", "three.js", "threejs", "webgl", "webgpu", "react three fiber", "r3f", "spline", "blender", "shader", "shaders", "glsl", "configurator", "particles", "point cloud", "gaussian splat", "model viewer"],
  ui: ["ui component", "component", "components", "widget", "dashboard", "card design", "button", "navbar", "modal", "chart", "table", "design system", "tailwind", "shadcn", "figma", "ui kit", "ux"],
  demo: ["demo", "sales demo", "prototype", "mockup", "prospect", "pitch", "walkthrough", "proof of concept", "poc", "showcase"],
  automation: ["automation", "automate", "automated", "workflow", "n8n", "zapier", "make.com", "bot", "telegram bot", "cron", "scheduled", "scraper", "webhook", "pipeline", "integration", "agentic workflow"],
  skill: ["skill", "skills", "claude skill", "agent skill", "claude code", "mcp", "mcp server", "subagent", "sub-agent", "agent instructions", "claude.md", "agents.md", "system prompt", "custom gpt", "plugin"],
  prompt: ["prompt", "prompts", "prompting", "template", "templates", "brief", "copywriting", "midjourney", "image prompt", "swipe file", "script"],
  playbook: ["playbook", "pricing", "price", "offer", "proposal", "outreach", "cold email", "sales script", "sop", "process", "strategy", "framework", "agency", "client", "retainer", "funnel", "lead gen", "case study"],
};

/** Field → weight: the title says the most, then tags, then everything else. */
const FIELDS = [["title", 3], ["ogTitle", 2], ["tags", 2], ["category", 2], ["content", 1], ["notes", 1], ["noteEntries", 1], ["ogDescription", 1], ["siteName", 1], ["url", 1]];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = Object.fromEntries(Object.entries(SIGNALS).map(([key, words]) => [
  key,
  words.map(word => new RegExp(`(^|[^a-z0-9])${escape(word)}($|[^a-z0-9])`, "i")),
]));

function fieldText(card, field) {
  const value = card?.[field];
  // Note entries: their bodies, capped together like one long field.
  if (field === "noteEntries") return Array.isArray(value) ? value.map(entry => String(entry?.body ?? "")).join("\n").slice(0, 4000) : "";
  // The card's own 🗂 tag is a filing, not a description of the card.
  if (Array.isArray(value)) return value.filter(tag => !isAssetTag(tag)).join(" , ");
  // Long bodies are capped so a pasted transcript can't outvote the title.
  return typeof value === "string" ? value.slice(0, 4000) : "";
}

function scoreFields(card, fields) {
  const scores = Object.fromEntries(Object.keys(SIGNALS).map(key => [key, 0]));
  for (const [field, weight] of fields) {
    const text = fieldText(card, field).replace(/[_/]+/g, " ");
    if (!text) continue;
    for (const [key, patterns] of Object.entries(PATTERNS)) {
      for (const pattern of patterns) if (pattern.test(text)) scores[key] += weight;
    }
  }
  return scores;
}

/** Scores per category key for a card ({ title, content, url, tags, noteEntries, … }). */
export function scoreAssetCategories(card) {
  return scoreFields(card, FIELDS);
}

/**
 * One or two category keys for the card, best first, or [] when nothing points anywhere.
 * The second is offered when it is close to the first (a third of its score) or the title
 * itself names it.
 */
export function suggestAssetCategories(card, max = 2) {
  const titled = scoreFields(card, [["title", 1]]);
  const ranked = Object.entries(scoreAssetCategories(card))
    .filter(([key, score]) => score > 0 && isAssetCategory(key))
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return [];
  const top = ranked[0][1];
  return ranked.slice(0, Math.max(1, max)).filter(([key, score]) => score * 3 >= top || titled[key] > 0).map(([key]) => key);
}
