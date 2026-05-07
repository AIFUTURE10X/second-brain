export function canonicalRelationPair(firstId, secondId) {
  const a = String(firstId || "").trim();
  const b = String(secondId || "").trim();

  if (!a || !b) {
    throw new Error("Both item ids are required");
  }
  if (a === b) {
    throw new Error("Cannot relate an item to itself");
  }

  return a < b
    ? { itemAId: a, itemBId: b }
    : { itemAId: b, itemBId: a };
}

export function relationKey(firstId, secondId) {
  const pair = canonicalRelationPair(firstId, secondId);
  return `${pair.itemAId}:${pair.itemBId}`;
}
