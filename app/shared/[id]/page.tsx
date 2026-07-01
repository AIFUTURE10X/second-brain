import { notFound } from "next/navigation";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyShareToken } from "@/lib/share-links";
import { LinkifiedText } from "@/components/LinkifiedText";
import type { Metadata } from "next";

// Read-only share view (roadmap 3.3): /shared/<id>?share=<HMAC> renders one
// card for anyone holding the signed link — no auth, no edit affordances.
// Server component: the token is verified before the card ever leaves the DB.

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { id } = await params;
  const { share } = await searchParams;
  if (!verifyShareToken(id, share)) notFound();

  let row;
  try {
    [row] = await db.select().from(items).where(eq(items.id, id));
  } catch {
    notFound();
  }
  if (!row) notFound();

  const noteEntries = (row.noteEntries || []).filter(entry => entry.body?.trim());
  const websiteLinks = (row.websiteLinks || []).filter(link => link.url);
  const checklist = row.checklistItems || [];
  const created = new Date(row.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#0D0F12" }}>
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-gray-600">
          ◆ Second Brain — shared card
        </p>
        <div className="rounded-2xl border border-brand-border bg-brand-card p-6">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-mono text-gray-500">
            <span className="rounded-full border border-brand-border px-2 py-0.5">{row.type}</span>
            {row.category && <span className="rounded-full border border-brand-border px-2 py-0.5">{row.category}</span>}
            <span>{created}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {row.title || row.ogTitle || "Untitled"}
          </h1>

          {row.url && (
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="mt-2 block truncate text-sm text-[#56CCF2] hover:underline">
              {row.url}
            </a>
          )}

          {row.ogImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.ogImage} alt="" className="mt-4 w-full rounded-xl border border-brand-border object-cover" />
          )}

          {row.content && (
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              <LinkifiedText text={row.content} />
            </div>
          )}

          {websiteLinks.length > 0 && (
            <div className="mt-5 border-t border-brand-border pt-4">
              <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">Website links</p>
              <div className="flex flex-col gap-1.5">
                {websiteLinks.map((link, i) => (
                  <a
                    key={`${link.url}-${i}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-sm text-gray-300 hover:text-white hover:border-[#5B8DEF60] transition"
                    title={link.url}
                  >
                    <span className="shrink-0 text-[#56CCF2]">↗</span>
                    <span className="truncate">{link.label || link.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {checklist.length > 0 && (
            <ul className="mt-4 space-y-1">
              {checklist.map(item => (
                <li key={item.id || item.text} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="font-mono text-[12px]">{item.completed ? "☑" : "☐"}</span>
                  <span className={item.completed ? "line-through text-gray-500" : ""}>{item.text}</span>
                </li>
              ))}
            </ul>
          )}

          {(noteEntries.length > 0 || row.notes?.trim()) && (
            <div className="mt-5 border-t border-brand-border pt-4">
              <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">Notes</p>
              {row.notes?.trim() && noteEntries.length === 0 && (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  <LinkifiedText text={row.notes} />
                </div>
              )}
              {noteEntries.map(entry => (
                <div key={entry.id} className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  <LinkifiedText text={entry.body} />
                </div>
              ))}
            </div>
          )}

          {(row.tags || []).length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {(row.tags || []).map(tag => (
                <span key={tag} className="rounded-full border border-brand-border px-2.5 py-0.5 text-[11px] font-mono text-gray-400">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] font-mono text-gray-700">read-only share link</p>
      </div>
    </div>
  );
}
