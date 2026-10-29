import type { Category } from "@/lib/brain-model";
import { categoryFilterNames, toggleCategoryFilter, MAX_CATEGORY_FILTERS, type CategoryFilter } from "@/lib/saved-views";

const ALL_COLOR = "#E8A838";
const chipClass = "inline-flex min-h-[36px] sm:min-h-[30px] max-w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 font-mono text-xs font-medium leading-none transition-all disabled:cursor-not-allowed disabled:opacity-40";

interface CategoryStripProps {
  parentCats: Category[];
  categories: Category[];
  catFilter: CategoryFilter;
  onCatFilterChange: (value: CategoryFilter) => void;
  getCatNamesUnderParent: (name: string) => string[];
  categoryItemCounts: Map<string, number>;
  itemCount: number;
}

// Always-visible category chips above the cards: "All" shows every card,
// each category chip toggles it in or out of the filter (up to four).
export function CategoryStrip({
  parentCats, categories, catFilter, onCatFilterChange, getCatNamesUnderParent, categoryItemCounts, itemCount,
}: CategoryStripProps) {
  const selected = categoryFilterNames(catFilter);
  const limitReached = selected.length >= MAX_CATEGORY_FILTERS;
  // One chip per top-level category (it covers its subcategories). Any selected name not in
  // parentCats (a subcategory, or a category a search emptied) still gets a chip so the
  // filter is never hidden.
  const chips = [
    ...parentCats.map(cat => ({ name: cat.name, color: cat.color })),
    ...selected.filter(name => !parentCats.some(cat => cat.name === name))
      .map(name => ({ name, color: categories.find(cat => cat.name === name)?.color || "#666" })),
  ];
  const countFor = (name: string) =>
    getCatNamesUnderParent(name).reduce((total, catName) => total + (categoryItemCounts.get(catName) ?? 0), 0);
  const allActive = selected.length === 0;

  return (
    <div
      data-category-strip
      role="toolbar"
      aria-label="Filter by category"
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-4 min-[1800px]:px-3 pt-2 pb-2 sm:flex-wrap sm:overflow-visible"
    >
      <button
        type="button"
        onClick={() => onCatFilterChange("all")}
        aria-pressed={allActive}
        className={chipClass}
        style={{
          borderColor: `${ALL_COLOR}${allActive ? "70" : "30"}`,
          background: allActive ? `${ALL_COLOR}18` : "transparent",
          color: allActive ? ALL_COLOR : `${ALL_COLOR}A0`,
        }}
        title="Show cards from every category"
      >
        ◇ All <span className="text-[10px] opacity-60">{itemCount}</span>
      </button>
      {chips.map(chip => {
        const active = selected.includes(chip.name);
        return (
          <button
            key={chip.name}
            type="button"
            onClick={() => onCatFilterChange(toggleCategoryFilter(catFilter, chip.name))}
            aria-pressed={active}
            disabled={limitReached && !active}
            className={chipClass}
            style={{
              borderColor: `${chip.color}${active ? "80" : "35"}`,
              background: active ? `${chip.color}22` : "transparent",
              color: active ? chip.color : `${chip.color}C0`,
            }}
            title={active ? `Remove ${chip.name} from the filter` : limitReached ? `Up to ${MAX_CATEGORY_FILTERS} categories at once` : `Show ${chip.name} cards`}
          >
            <span className="min-w-0 truncate">{active ? "✓ " : ""}{chip.name}</span>
            <span className="shrink-0 text-[10px] opacity-60">{countFor(chip.name)}</span>
          </button>
        );
      })}
    </div>
  );
}
