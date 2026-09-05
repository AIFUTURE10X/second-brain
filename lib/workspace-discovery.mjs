import { knowledgeTokens } from './knowledge-passages.mjs';

/** Grounded, deterministic candidates; no provider calls or notifications. */
export function buildDiscoveries({ items, projects, decisions, feedback, now = new Date() }) {
  const day = 86400000;
  const active = items.filter(i => !i.archivedAt && !i.completed && !['done', 'archived'].includes(i.workflowStatus));
  const valid = new Set(active.map(i => i.id));
  const candidates = [];
  const age = value => (now.getTime() - new Date(value).getTime()) / day;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const decision of decisions) {
    if (decision.data.reviewOn && decision.data.reviewOn <= today) candidates.push({
      id: `decision:${decision.id}:${decision.data.reviewOn}`, kind: 'decision', title: `Revisit: ${decision.data.title}`,
      reason: `You scheduled this decision for review on ${decision.data.reviewOn}.`, sourceIds: decision.data.sourceIds.filter(id => valid.has(id)), decisionId: decision.id, score: 100,
    });
  }
  for (const item of active) {
    if ((item.actionRequired || item.type === 'task') && age(item.updatedAt || item.createdAt) >= 7) candidates.push({
      id: `action:${item.id}`, kind: 'action', title: item.title || 'An open action', sourceIds: [item.id],
      reason: 'This is still marked for action and has not been updated for at least seven days.', score: 80,
    });
    if (age(item.createdAt) < 14 || !Number.isFinite(age(item.createdAt))) continue;
    for (const project of projects) {
      const words = new Set(knowledgeTokens(`${item.title} ${item.content || ''} ${(item.tags || []).join(' ')}`));
      const shared = knowledgeTokens(project.data.goal).filter(t => words.has(t));
      const linked = project.data.itemIds.includes(item.id) || (project.data.category && item.category === project.data.category);
      if (!linked && shared.length < 2) continue;
      candidates.push({ id: `resurface:${project.id}:${item.id}`, kind: 'resurface', title: item.title || 'Earlier project material', sourceIds: [item.id], projectId: project.id,
        reason: linked ? `Saved at least two weeks ago and included in ${project.data.name}.` : `Shares “${shared.slice(0, 3).join('”, “')}” with the goal of ${project.data.name}.`, score: 60 + Math.min(shared.length, 5) });
      break;
    }
  }
  // Bound pair comparisons and prefer a recent card connected to older material.
  const recent = active.filter(i => age(i.createdAt) <= 7).slice(0, 25);
  const old = active.filter(i => age(i.createdAt) >= 14).slice(0, 200);
  for (const a of recent) for (const b of old) {
    const shared = (a.tags || []).filter(t => (b.tags || []).includes(t));
    if (!shared.length) continue;
    candidates.push({ id: `connection:${[a.id, b.id].sort().join(':')}`, kind: 'connection', title: `${a.title} + ${b.title}`, sourceIds: [a.id, b.id],
      reason: `A recent and an older card share ${shared.slice(0, 3).map(t => `#${t}`).join(', ')}. Explore whether the connection is useful.`, score: 50 + Math.min(shared.length, 5) });
  }
  const effective = feedback.filter(f => f.data.status !== 'reset' && (f.data.status !== 'snoozed' || (f.data.snoozedUntil && new Date(f.data.snoozedUntil) > now)));
  const blocked = new Set(effective.map(f => f.data.suggestionId));
  const blockedCards = new Set(effective.flatMap(f => f.data.sourceIds || []));
  const result = [];
  const usedCards = new Set();
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    if (blocked.has(candidate.id) || (candidate.kind !== 'decision' && candidate.sourceIds.some(id => blockedCards.has(id))) || candidate.sourceIds.some(id => usedCards.has(id))) continue;
    result.push(candidate);
    // Connections may reuse one earlier card only if no other suggestion used it.
    candidate.sourceIds.forEach(id => usedCards.add(id));
    if (result.length === 3) break;
  }
  return result;
}
