import { formatCardDate } from "@/lib/brain-format";

// A card's created/updated date as a light chip — plain gray text all but
// disappears on the dark card background. className sets size and spacing.
export function CardDate({ value, className = "" }: { value: string | Date; className?: string }) {
  return (
    <span className={`whitespace-nowrap rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-gray-200 ${className}`}>
      {formatCardDate(value)}
    </span>
  );
}
