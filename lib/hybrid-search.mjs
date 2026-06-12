// Reciprocal rank fusion of full-text and semantic search results
// (roadmap 1.1). Pure module so node:test can load it directly.

const RRF_K = 60;

/**
 * Merge two ranked result lists with reciprocal rank fusion:
 * score(item) = Σ 1 / (k + rank). Items appearing in both lists outrank
 * single-list items at comparable ranks. Pinned items always sort first,
 * matching the app-wide ordering convention. Rows are deduplicated by id
 * (first occurrence wins, so FTS column aliasing is preserved).
 */
export function mergeHybridResults(ftsRows = [], semanticRows = [], { k = RRF_K } = {}) {
  if (semanticRows.length === 0) return [...ftsRows];
  if (ftsRows.length === 0) return [...semanticRows];

  const entries = new Map();
  const collect = (rows) => {
    rows.forEach((row, rank) => {
      const existing = entries.get(row.id);
      if (existing) {
        existing.score += 1 / (k + rank + 1);
        existing.bestRank = Math.min(existing.bestRank, rank);
      } else {
        entries.set(row.id, {
          row,
          score: 1 / (k + rank + 1),
          bestRank: rank,
          order: entries.size,
        });
      }
    });
  };
  collect(ftsRows);
  collect(semanticRows);

  return [...entries.values()]
    .sort((a, b) =>
      Number(Boolean(b.row.pinned)) - Number(Boolean(a.row.pinned)) ||
      b.score - a.score ||
      a.bestRank - b.bestRank ||
      a.order - b.order
    )
    .map(entry => entry.row);
}
