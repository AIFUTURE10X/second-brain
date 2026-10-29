import { Fragment, type ReactNode } from "react";
import { itemCountsByCategory, type Category, type Item } from "@/lib/brain-model";
import { groupItemsByCategory } from "@/lib/category-sections.mjs";

const UNCATEGORIZED_COLOR = "#6B7280";

interface CategorySectionsProps {
  items: Item[];
  /** Every card that matches the filters, so a section can say "12 of 30" while paging. */
  allItems: Item[];
  order: string[];
  categories: Category[];
  renderItemCard: (item: Item, idx: number) => ReactNode;
}

// Grid views (list / compact): one heading per category, its cards below.
export function CategorySections({ items, allItems, order, categories, renderItemCard }: CategorySectionsProps) {
  const totals = itemCountsByCategory(allItems);
  const uncategorizedTotal = allItems.filter(item => !item.category?.trim()).length;

  return groupItemsByCategory(items, order).map((section, sectionIdx) => {
    const category = categories.find(cat => cat.name === section.key);
    const parent = category?.parentId ? categories.find(cat => cat.id === category.parentId) : undefined;
    const color = section.key ? category?.color || "#666" : UNCATEGORIZED_COLOR;
    const total = section.key ? totals.get(section.key) ?? section.items.length : uncategorizedTotal;
    return (
      <Fragment key={section.key || "uncategorized"}>
        <h2
          data-category-section={section.key || "uncategorized"}
          className={`col-span-full flex min-w-0 items-center gap-2 pb-0.5 font-mono text-[11px] uppercase tracking-[0.15em] ${sectionIdx > 0 ? "mt-4" : ""}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="min-w-0 truncate" style={{ color }}>
            {parent && <span className="text-gray-500">{parent.name} › </span>}
            {section.key || "Uncategorized"}
          </span>
          <span className="shrink-0 text-gray-500">
            · {section.items.length}{total > section.items.length ? ` of ${total}` : ""}
          </span>
          <span className="h-px flex-1" style={{ background: `${color}30` }} />
        </h2>
        {section.items.map(renderItemCard)}
      </Fragment>
    );
  });
}
