import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUSINESS_IDEA_TAG,
  ideaCapturePayload,
  isIdeaTag,
  parseIdeaCommand,
  trimUrlPunctuation,
  withIdeaTag,
  withoutIdeaTag,
} from "../lib/business-idea.mjs";
import { quickCapturePayload } from "../lib/quick-capture.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const telegramSource = await read("app/api/telegram/route.ts");
const saveSource = await read("app/api/save/route.ts");
const itemsSource = await read("app/api/items/route.ts");
const ingestSource = await read("lib/ingest.ts");
const aiTaggerSource = await read("lib/ai-tagger.ts");
const brainSource = await read("components/Brain.tsx");
const backgroundSource = await read("extension/background.js");

test("/idea and /bi parse; other commands and plain text pass through", () => {
  assert.equal(parseIdeaCommand("/idea https://youtu.be/abc could I sell this?"), "https://youtu.be/abc could I sell this?");
  assert.equal(parseIdeaCommand("/IDEA AI receptionist for dentists"), "AI receptionist for dentists");
  assert.equal(parseIdeaCommand("/bi\nmulti\nline"), "multi\nline");
  assert.equal(parseIdeaCommand("/idea@philsbrain_bot https://x.com/a"), "https://x.com/a");
  assert.equal(parseIdeaCommand("/idea"), "");
  assert.equal(parseIdeaCommand("/ideas are cheap"), null);
  assert.equal(parseIdeaCommand("/t buy milk"), null);
  assert.equal(parseIdeaCommand("an idea"), null);
});

test("the tag is added once and stripped case-insensitively", () => {
  assert.deepEqual(withIdeaTag(["ai", "Business-Idea"]), ["ai", BUSINESS_IDEA_TAG]);
  assert.deepEqual(withIdeaTag([]), [BUSINESS_IDEA_TAG]);
  assert.deepEqual(withoutIdeaTag(["business-idea", "startup", " BUSINESS-IDEA "]), ["startup"]);
  assert.equal(isIdeaTag("business ideas"), false, "the AI's own 'business ideas' tag is not the marker");
});

test("sentence punctuation after a link is not part of it; balanced brackets are", () => {
  assert.equal(trimUrlPunctuation("https://example.com/video,"), "https://example.com/video");
  assert.equal(trimUrlPunctuation("https://example.com/article."), "https://example.com/article");
  assert.equal(trimUrlPunctuation("https://example.com/a?)."), "https://example.com/a");
  assert.equal(trimUrlPunctuation("https://en.wikipedia.org/wiki/Foo_(bar)"), "https://en.wikipedia.org/wiki/Foo_(bar)");
  assert.equal(trimUrlPunctuation("https://example.com/?q=1"), "https://example.com/?q=1");
  assert.equal(ideaCapturePayload("https://example.com/video, could I sell this?").url, "https://example.com/video");
});

test("quick capture: a link keeps the words as notes; text becomes a thought", () => {
  assert.deepEqual(ideaCapturePayload("https://youtu.be/abc  villa managers?"), {
    type: "link", url: "https://youtu.be/abc", notes: "villa managers?", tags: [BUSINESS_IDEA_TAG],
  });
  assert.deepEqual(ideaCapturePayload("AI receptionist for dentists"), {
    type: "thought", title: "AI receptionist for dentists", content: "AI receptionist for dentists", tags: [BUSINESS_IDEA_TAG],
  });
});

test("the quick-capture grammar keeps its old forms and adds /idea", () => {
  assert.deepEqual(quickCapturePayload("/t buy milk"), { payload: { type: "task", title: "buy milk" }, label: "Task" });
  assert.deepEqual(quickCapturePayload("/m wifi abc"), { payload: { type: "memory", title: "wifi abc" }, label: "Memory" });
  assert.deepEqual(quickCapturePayload("https://example.com/a"), { payload: { type: "link", url: "https://example.com/a" }, label: "Link" });
  assert.deepEqual(quickCapturePayload("just a thought"), { payload: { type: "thought", title: "just a thought" }, label: "Thought" });
  assert.equal(quickCapturePayload("/idea https://youtu.be/abc").payload.tags[0], BUSINESS_IDEA_TAG);
  assert.deepEqual(quickCapturePayload("/idea"), { error: "Add a link or the idea after /idea" });
});

test("only a person sets the tag: both AI tag paths drop it", () => {
  // lib/ingest.ts spells the tag out (tests transpile it alone); keep it equal.
  assert.match(ingestSource, new RegExp(`AI_RESERVED_TAG = "${BUSINESS_IDEA_TAG}"`));
  assert.match(ingestSource, /tag !== AI_RESERVED_TAG/);
  assert.match(aiTaggerSource, /withoutIdeaTag\(parsed\.tags\.map\(String\)\)/);
});

test("every capture surface can send an idea, and the tag alone never switches AI tagging off", () => {
  assert.match(telegramSource, /parseIdeaCommand\(rawText\)/);
  assert.match(telegramSource, /if \(isIdeaCommand\) tags = withIdeaTag\(tags\)/);
  assert.match(telegramSource, /'\/idea <link or idea>'/);
  for (const source of [saveSource, itemsSource]) {
    assert.match(source, /withoutIdeaTag\((tags|itemTags)\)\.length === 0/);
    assert.match(source, /sendsIdea \? withIdeaTag\(ai\.tags\)/);
    // stored lowercase even when AI tagging doesn't run (a category was given): ?tag= is exact
    assert.match(source, /if \(sendsIdea\) (tags|itemTags) = withIdeaTag\((tags|itemTags)\)/);
  }
  assert.match(itemsSource, /content: body\.content \|\| body\.notes \|\| ""/);
  assert.match(telegramSource, /trimUrlPunctuation\(urlMatch\?\.\[0\] \|\| ""\)/);
  // a PDF tab sent as an idea goes through savePage, so the document is uploaded too
  assert.match(backgroundSource, /savePage\(\{ \.\.\.tab, url: pageUrl, title: pageTitle \}, idea\)/);
  assert.match(backgroundSource, /attachments: \[attachment\],\s*\.\.\.extra,/);
  assert.match(brainSource, /quickCapturePayload\(text\)/);
  assert.match(backgroundSource, /save-page-idea/);
  assert.match(backgroundSource, /save-link-idea/);
  assert.match(backgroundSource, new RegExp(`BUSINESS_IDEA_TAG = "${BUSINESS_IDEA_TAG}"`));
});
