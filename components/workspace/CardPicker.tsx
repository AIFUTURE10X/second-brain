'use client';
import { useState } from 'react';
import type { Item } from '@/lib/brain-model';

export function CardPicker({ items, selected, onChange, limit = 8, label = 'Choose source cards' }: {
  items: Item[]; selected: string[]; onChange: (ids: string[]) => void; limit?: number; label?: string;
}) {
  const [query, setQuery] = useState('');
  const matches = items.filter(i => `${i.title} ${i.category} ${i.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <fieldset className="space-y-2 rounded-xl border border-brand-border p-3">
    <legend className="px-1 text-xs text-gray-400">{label} ({selected.length}/{limit})</legend>
    <input aria-label="Find source cards" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a card by title, category or tag" className="w-full rounded border border-brand-border bg-brand-dark p-2 text-sm" />
    {selected.length > 0 && <div className="flex flex-wrap gap-1">{selected.map(id => <button type="button" key={id} onClick={() => onChange(selected.filter(s => s !== id))} className="rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-200" aria-label={`Remove ${items.find(i => i.id === id)?.title || 'unavailable card'}`}>{items.find(i => i.id === id)?.title || 'Unavailable card'} ×</button>)}</div>}
    <div className="max-h-44 space-y-1 overflow-y-auto">{matches.slice(0, 60).map(item => <label key={item.id} className="flex items-start gap-2 rounded p-1 text-sm hover:bg-white/5"><input type="checkbox" className="mt-1" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= limit} onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} /><span className="min-w-0 break-words">{item.title || 'Untitled'}<small className="ml-2 text-gray-500">{item.category}</small></span></label>)}</div>
    <p className="text-xs text-gray-500">{matches.length > 60 ? `Showing 60 of ${matches.length} matches. Narrow your search.` : `${matches.length} cards available.`}</p>
  </fieldset>;
}
