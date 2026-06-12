"use client";

interface EmptyStateProps {
  variant: "new" | "no-matches" | "error";
  className?: string;
  onAddFirst?: () => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
}

// The three zero-card states: brand-new brain, filters/search matched nothing,
// and items failed to load.
export function EmptyState({ variant, className = "", onAddFirst, onClearFilters, onRetry }: EmptyStateProps) {
  return (
    <div className={`text-center py-16 text-gray-700 ${className}`}>
      <div className="text-4xl mb-3">{variant === "error" ? "⚠" : "◇"}</div>
      {variant === "new" && (
        <>
          <p className="text-sm font-mono text-gray-500">Your second brain is empty</p>
          <p className="text-xs mt-1.5 text-gray-600">Save notes, links, clips & thoughts</p>
          {onAddFirst && (
            <button
              onClick={onAddFirst}
              className="mt-4 px-5 py-2 rounded-xl text-white text-sm font-medium"
              style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
            >+ Add your first item</button>
          )}
        </>
      )}
      {variant === "no-matches" && (
        <>
          <p className="text-sm font-mono text-gray-500">No matches</p>
          <p className="text-xs mt-1.5 text-gray-600">Try different search terms or fewer filters</p>
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="mt-4 px-4 py-1.5 rounded-lg text-xs font-mono transition"
              style={{ border: "1px solid #ffffff35", background: "#ffffff10", color: "#ddd" }}
            >× Clear all filters</button>
          )}
        </>
      )}
      {variant === "error" && (
        <>
          <p className="text-sm font-mono text-gray-500">Couldn&rsquo;t load your brain</p>
          <p className="text-xs mt-1.5 text-gray-600">Check your connection and try again</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-1.5 rounded-lg text-xs font-mono transition"
              style={{ border: "1px solid #5B8DEF50", background: "#5B8DEF15", color: "#5B8DEF" }}
            >↻ Retry</button>
          )}
        </>
      )}
    </div>
  );
}
