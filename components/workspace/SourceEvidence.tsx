'use client';
import type { AskSource } from '@/lib/workspace-types';
import { safeSourceUrl } from '@/lib/knowledge-passages.mjs';

export function SourceEvidence({ sources }: { sources: AskSource[] }) {
  return <div className="mt-3 space-y-2 border-t border-brand-border pt-3">
    <p className="text-xs text-gray-400">Evidence used</p>
    {sources.map((source, index) => <details key={`${source.id}:${index}`} className="rounded-lg bg-black/20 p-2 text-xs">
      <summary className="cursor-pointer text-amber-200">{['pdf', 'image'].includes(source.type) ? 'Attachment' : `[${index + 1}]`} {source.title}</summary>
      <div className="mt-2 space-y-2">
        <a className="underline" href={source.type === 'decision' ? '/workspace?tab=Decisions' : `/card/${source.id}`} target="_blank" rel="noreferrer">{source.type === 'decision' ? 'Open decisions' : 'Open source card'}</a>
        {safeSourceUrl(source.url) && <a className="ml-3 underline" href={safeSourceUrl(source.url)} target="_blank" rel="noreferrer">Open original</a>}
        {source.passages.map((p, i) => <blockquote key={i} className="border-l-2 border-amber-600 pl-3 text-gray-300">
          <p className="mb-1 text-gray-500">{p.label}</p><p className="whitespace-pre-wrap">{p.text}</p>
          {safeSourceUrl(p.url) && <a href={safeSourceUrl(p.url)} target="_blank" rel="noreferrer" className="text-amber-200 underline">Play at timestamp</a>}
        </blockquote>)}
      </div>
    </details>)}
  </div>;
}
