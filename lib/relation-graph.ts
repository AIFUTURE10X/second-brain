export function getRelationCountsByItemId(
  relations: Array<{ itemAId?: string | null; itemBId?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const relation of relations) {
    const itemAId = relation.itemAId || "";
    const itemBId = relation.itemBId || "";
    if (!itemAId || !itemBId || itemAId === itemBId) continue;
    counts.set(itemAId, (counts.get(itemAId) || 0) + 1);
    counts.set(itemBId, (counts.get(itemBId) || 0) + 1);
  }
  return counts;
}
