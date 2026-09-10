import type { Category } from "@/lib/transactions/types";

type CategoryBadgeProps = { category: Category | null; fallbackLabel: string };

export default function CategoryBadge({ category, fallbackLabel }: CategoryBadgeProps) {
  const color = category?.color ?? "#8a94a6";
  const label = category?.label ?? fallbackLabel;
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}
