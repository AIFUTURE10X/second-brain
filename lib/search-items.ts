// Server-side item search shared by GET /api/items?q= and the Telegram /find
// command. Defaults to exact lexical search + trigram typo fallback; callers
// can opt into pgvector semantic ranking when that broader behavior is useful.
import { sql } from "@/db";
import { buildItemSearchTsQuery } from "@/lib/item-search";
import {
  embeddingsEnabled,
  generateEmbedding,
  vectorLiteral,
  SEMANTIC_DISTANCE_CUTOFF,
  SEMANTIC_SEARCH_LIMIT,
} from "@/lib/embeddings.mjs";
import { mergeHybridResults } from "@/lib/hybrid-search.mjs";

// Loose row shape for the raw-SQL search paths — all optional so the neon
// driver's Record<string, any> rows assign without casts.
export type SearchRow = {
  id?: string;
  pinned?: boolean | null;
  tags?: unknown;
  category?: string | null;
  type?: string | null;
} & Record<string, unknown>;

export type HybridSearchResult = {
  rows: SearchRow[];
  semanticUsed: boolean;
  fuzzy: boolean;
};

// snake_case → camelCase column list shared by the raw-SQL search paths so
// their rows match the Drizzle-select shape the frontend expects.
const ITEM_COLUMNS_SQL = `
  id, type, title, content, url, notes, tags, category, pinned, attachments,
  favourite,
  completed,
  action_required AS "actionRequired",
  checklist_items AS "checklistItems",
  note_entries AS "noteEntries",
  favicon,
  og_title AS "ogTitle",
  og_description AS "ogDescription",
  og_image AS "ogImage",
  site_name AS "siteName",
  archived_at AS "archivedAt",
  reading_status AS "readingStatus",
  completed_at AS "completedAt",
  reviewed_at AS "reviewedAt",
  workflow_status AS "workflowStatus",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// Nearest-neighbour lookup over item embeddings (cosine distance, HNSW
// index). Rows past the distance cutoff are noise and excluded entirely.
async function semanticSearchRows(queryVector: number[], archivedFilterSql: string): Promise<SearchRow[]> {
  return await sql.query(
    `SELECT ${ITEM_COLUMNS_SQL}
     FROM items
     WHERE embedding IS NOT NULL
       AND (embedding <=> $1::vector) < $2
       ${archivedFilterSql}
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral(queryVector), SEMANTIC_DISTANCE_CUTOFF, SEMANTIC_SEARCH_LIMIT]
  );
}

/**
 * Hybrid search: weighted FTS over search_tsv merged with pgvector semantic
 * ranking via reciprocal rank fusion (lib/hybrid-search.mjs).
 * semanticMode defaults to "off" for precise keyword search. "only" returns
 * pure semantic ranking; "auto" merges whenever OPENAI_API_KEY is configured.
 * Every semantic
 * failure mode (no key, column/extension not migrated yet, OpenAI error)
 * degrades silently to the FTS-only behaviour. Zero hits fall back to a
 * trigram scan over titles so typos still surface cards.
 */
export async function hybridSearchItems(
  q: string,
  opts: {
    archivedOnly?: boolean;
    semanticMode?: "auto" | "off" | "only";
    // Structured-filter predicate (?tag= / ?category= / ?type=). Applied
    // before deciding on the fuzzy fallback so a fully filtered-out FTS
    // result still tries the trigram path — matches the original route
    // behaviour.
    filter?: (row: SearchRow) => boolean;
  } = {},
): Promise<HybridSearchResult> {
  const semanticMode = opts.semanticMode ?? "off";
  const archivedFilterSql = opts.archivedOnly ? "AND archived_at IS NOT NULL" : "AND archived_at IS NULL";

  const tsquery = buildItemSearchTsQuery(q);
  let ftsRows: SearchRow[] = [];
  if (tsquery) {
    ftsRows = await sql.query(
      `SELECT ${ITEM_COLUMNS_SQL}
       FROM items, to_tsquery('english', $1) AS query
       WHERE search_tsv @@ query
         ${archivedFilterSql}
       ORDER BY pinned DESC,
                ts_rank_cd(search_tsv, query) DESC,
                created_at DESC`,
      [tsquery]
    );
  }

  let semanticRows: SearchRow[] = [];
  let semanticUsed = false;
  if (semanticMode !== "off" && embeddingsEnabled()) {
    try {
      const queryVector = await generateEmbedding(q);
      if (queryVector) {
        semanticRows = await semanticSearchRows(queryVector, archivedFilterSql);
        semanticUsed = true;
      }
    } catch (error) {
      console.error("Semantic search failed:", error);
    }
  }

  const ranked = semanticMode === "only" && semanticUsed
    ? semanticRows
    : mergeHybridResults(ftsRows, semanticRows);
  const matched = opts.filter ? ranked.filter(opts.filter) : ranked;
  if (matched.length > 0) {
    return { rows: matched, semanticUsed, fuzzy: false };
  }

  try {
    const fuzzy: SearchRow[] = await sql.query(
      `SELECT ${ITEM_COLUMNS_SQL}
       FROM items
       WHERE word_similarity($1, title) > 0.3
         ${archivedFilterSql}
       ORDER BY pinned DESC,
                word_similarity($1, title) DESC,
                created_at DESC
       LIMIT 25`,
      [q]
    );
    return { rows: opts.filter ? fuzzy.filter(opts.filter) : fuzzy, semanticUsed, fuzzy: true };
  } catch (error) {
    // pg_trgm not installed yet (scripts/db-setup.sql) — degrade to no results.
    console.error("Fuzzy search fallback failed:", error);
    return { rows: [], semanticUsed, fuzzy: false };
  }
}
