import { WORKFLOW_STATUS_META, type WorkflowStatus } from "@/lib/brain-model";

interface BulkTriageBarProps {
  selectedCount: number;
  unreviewedCount: number;
  allFavourite: boolean;
  allActionRequired: boolean;
  categoryOptions: string[];
  selectedCategory: string;
  selectedStatus: WorkflowStatus | "";
  tagDraft: string;
  busy: boolean;
  onMarkReviewed: () => void;
  onToggleFavourite: () => void;
  onToggleActionRequired: () => void;
  onCategoryChange: (value: string) => void;
  onApplyCategory: (value?: string) => void;
  onStatusChange: (value: WorkflowStatus | "") => void;
  onApplyStatus: (value?: WorkflowStatus) => void;
  onTagDraftChange: (value: string) => void;
  onApplyTags: () => void;
  onClear: () => void;
}

export function BulkTriageBar({
  selectedCount,
  unreviewedCount,
  allFavourite,
  allActionRequired,
  categoryOptions,
  selectedCategory,
  selectedStatus,
  tagDraft,
  busy,
  onMarkReviewed,
  onToggleFavourite,
  onToggleActionRequired,
  onCategoryChange,
  onApplyCategory,
  onStatusChange,
  onApplyStatus,
  onTagDraftChange,
  onApplyTags,
  onClear,
}: BulkTriageBarProps) {
  if (selectedCount === 0) return null;

  const buttonClass = "min-h-[44px] rounded-lg border px-3 py-1.5 text-[11px] font-mono transition disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0";
  const chipClass = "min-h-[32px] rounded-lg border px-2 py-1 text-left text-[10px] font-mono transition disabled:cursor-not-allowed disabled:opacity-45";
  const applyCategoryChip = (category: string) => {
    onCategoryChange(category);
    onApplyCategory(category);
  };
  const applyStatusChip = (status: WorkflowStatus) => {
    onStatusChange(status);
    onApplyStatus(status);
  };

  return (
    <div className="sticky top-[7.25rem] z-40 mx-4 mb-3 rounded-lg border border-[#5B8DEF40] bg-[#111722]/95 p-3 shadow-lg shadow-black/20 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] font-mono text-[#5B8DEF]">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onMarkReviewed}
          disabled={busy || unreviewedCount === 0}
          className={buttonClass}
          style={{ borderColor: "#5B8DEF50", color: "#5B8DEF", background: "#5B8DEF12" }}
          title={unreviewedCount === 0 ? "No selected Inbox cards" : "Mark selected Inbox cards reviewed"}
        >
          Reviewed {unreviewedCount > 0 ? unreviewedCount : ""}
        </button>
        <button
          type="button"
          onClick={onToggleFavourite}
          disabled={busy}
          className={buttonClass}
          style={{ borderColor: "#F2C94C50", color: "#F2C94C", background: allFavourite ? "#F2C94C22" : "#F2C94C10" }}
          title={allFavourite ? "Remove selected from favourites" : "Add selected to favourites"}
        >
          {allFavourite ? "Unfavourite" : "Favourite"}
        </button>
        <button
          type="button"
          onClick={onToggleActionRequired}
          disabled={busy}
          className={buttonClass}
          style={{ borderColor: "#EB575750", color: "#EB5757", background: allActionRequired ? "#EB575722" : "#EB575710" }}
          title={allActionRequired ? "Clear action flag from selected" : "Flag selected as action required"}
        >
          {allActionRequired ? "Clear action" : "Action"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className={buttonClass}
          style={{ borderColor: "#3A3D44", color: "#9CA3AF", background: "transparent" }}
          title="Clear selection"
        >
          Clear
        </button>
      </div>

      {categoryOptions.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">Category</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 max-h-28 gap-1.5 overflow-y-auto pr-1">
            {categoryOptions.map(category => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => applyCategoryChip(category)}
                  disabled={busy}
                  className={chipClass}
                  style={{
                    borderColor: active ? "#56CCF270" : "#56CCF230",
                    background: active ? "#56CCF220" : "#56CCF210",
                    color: active ? "#BFEFFF" : "#56CCF2",
                  }}
                  title={`Apply category: ${category}`}
                >
                  <span className="block truncate">{category}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-2">
        <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">Status</p>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(WORKFLOW_STATUS_META).map(([key, status]) => {
            const statusKey = key as WorkflowStatus;
            const active = selectedStatus === statusKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyStatusChip(statusKey)}
                disabled={busy}
                className={chipClass}
                style={{
                  borderColor: `${status.color}${active ? "80" : "35"}`,
                  background: active ? `${status.color}24` : `${status.color}10`,
                  color: active ? status.color : `${status.color}CC`,
                }}
                title={`Move selected cards to ${status.label}`}
              >
                <span className="block truncate">{status.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-[13rem] items-center gap-1.5">
        <input
          value={tagDraft}
          onChange={e => onTagDraftChange(e.target.value)}
          disabled={busy}
          placeholder="Add tags"
          className="h-8 min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-muted px-2 text-[11px] font-mono text-gray-300 outline-none placeholder:text-gray-600 disabled:opacity-45"
          aria-label="Bulk tags"
        />
        <button
          type="button"
          onClick={onApplyTags}
          disabled={busy || !tagDraft.trim()}
          className={buttonClass}
          style={{ borderColor: "#9B51E050", color: "#BB6BD9", background: "#9B51E010" }}
          title="Append tags to selected cards"
        >
          Tag
        </button>
      </div>
    </div>
  );
}
