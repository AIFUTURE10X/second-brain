const STOP = new Set('a an the and or of to in is are was were my me what which how about on for with this that it'.split(' '));

export function knowledgeTokens(text) {
  return [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])].filter(t => !STOP.has(t));
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function timestampLink(text, url) {
  const stamp = text.match(/(?:^|\n)\s*\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]?/);
  if (!stamp) return '';
  try {
    const link = new URL(url);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(link.hostname)) return '';
    link.searchParams.set('t', String(Number(stamp[1] || 0) * 3600 + Number(stamp[2]) * 60 + Number(stamp[3])));
    return link.href;
  } catch { return ''; }
}

/** Excerpts remain literal substrings, including any real source timestamps. */
export function selectPassages(row, question = '', budget = 2200) {
  const fields = [
    { label: 'Card', text: row.content }, { label: 'Notes', text: row.notes },
    ...(Array.isArray(row.noteEntries) ? row.noteEntries.map(e => ({ label: 'Annotation', text: e?.body })) : []),
    { label: 'Description', text: row.ogDescription }, { label: 'Transcript', text: row.transcript },
  ];
  const tokens = knowledgeTokens(question);
  const candidates = [];
  for (const field of fields) {
    const text = String(field.text || '').slice(0, 400000);
    for (let start = 0; start < text.length; start += 600) {
      const part = text.slice(start, start + 800).trim();
      if (!part) continue;
      const words = new Set(knowledgeTokens(part));
      const score = tokens.reduce((n, token) => n + (words.has(token) ? 1 : 0), 0);
      candidates.push({ label: field.label, text: part, score, start, field: fields.indexOf(field) });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.field - b.field || a.start - b.start);
  const selected = [];
  let remaining = budget;
  for (const p of candidates) {
    if (selected.length >= 3 || remaining < 80) break;
    if (selected.some(s => s.field === p.field && Math.abs(s.start - p.start) < 800)) continue;
    const text = p.text.slice(0, remaining);
    selected.push({ ...p, text, url: p.label === 'Transcript' ? timestampLink(text, row.url) : '' });
    remaining -= text.length + p.label.length + 8;
  }
  return selected.map(({ label, text, url }) => ({ label, text, url }));
}
