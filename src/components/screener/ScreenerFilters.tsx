import { CAP_OPTIONS, PE_OPTIONS, PRICE_OPTIONS, SORT_OPTIONS } from "@/lib/screener/calc";
import type { ScreenerFilters as Filters } from "@/lib/screener/types";

const SELECT_CLASS =
  "rounded-md border border-card-border bg-white/5 px-2.5 py-1.5 text-xs text-text-primary outline-none";

export default function ScreenerFilters({
  filters,
  onChange,
  sectors,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  sectors: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <select
        value={filters.sector}
        onChange={(e) => onChange({ ...filters, sector: e.target.value })}
        className={SELECT_CLASS}
      >
        <option value="">All sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={filters.cap}
        onChange={(e) => onChange({ ...filters, cap: e.target.value as Filters["cap"] })}
        className={SELECT_CLASS}
      >
        {CAP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.pe}
        onChange={(e) => onChange({ ...filters, pe: e.target.value as Filters["pe"] })}
        className={SELECT_CLASS}
      >
        {PE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            P/E: {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.price}
        onChange={(e) => onChange({ ...filters, price: e.target.value as Filters["price"] })}
        className={SELECT_CLASS}
      >
        {PRICE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.sort}
        onChange={(e) => onChange({ ...filters, sort: e.target.value as Filters["sort"] })}
        className={SELECT_CLASS}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
