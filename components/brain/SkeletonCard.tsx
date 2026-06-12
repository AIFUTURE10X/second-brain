"use client";

export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="skeleton rounded-xl p-4" style={{ animationDelay: `${delay}s` }}>
      <div className="flex gap-3">
        <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}
