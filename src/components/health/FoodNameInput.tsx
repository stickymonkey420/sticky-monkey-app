"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LibraryFood } from "@/lib/health/calc";
import { searchUsdaFoods, type UsdaHit } from "@/lib/health/queries";

const CELL = "w-full rounded-md border border-[rgba(148,158,189,0.35)] bg-[#0d0f17] py-1.5 pl-7 pr-2 text-[13px] text-text-primary";

export type FoodPick = { name: string; fdc_id: number | null };
type Option = { kind: "mine" | "usda"; name: string; fdc_id: number | null; kcal: number; sub: string };

function libraryMatches(library: LibraryFood[], q: string): LibraryFood[] {
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  const joined = words.join("");
  return library
    .filter((f) => {
      const hay = `${f.name.toLowerCase()} ${f.aliases.join(" ")}`;
      const flat = hay.replace(/[^a-z0-9]/g, "");
      return words.every((w) => hay.includes(w)) || (words.length > 1 && flat.includes(joined));
    })
    .slice(0, 5);
}

// Food name box with a type-ahead list: your food library first (instant),
// then USDA FoodData Central matches (free). Picking one locks in that exact
// food; typing a name and moving on still works (best match is used).
export default function FoodNameInput({
  value,
  library,
  placeholder,
  onChange,
  onPick,
  onCommit,
}: {
  value: string;
  library: LibraryFood[];
  placeholder?: string;
  onChange: (text: string) => void;
  onPick: (pick: FoodPick) => void;
  onCommit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<UsdaHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [hitsQ, setHitsQ] = useState("");

  const q = value.trim();
  useEffect(() => {
    if (!open || q.length < 3 || hitsQ === q) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchUsdaFoods(createClient(), q);
      if (cancelled) return;
      setHitsQ(q);
      setHits(r.hits);
      setSearchErr(r.error === "rate_limited" ? "USDA search is busy. Try again in a minute." : r.error ? "USDA search unavailable right now." : null);
      setSearching(false);
      setActive(0);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, hitsQ]);

  const mine = libraryMatches(library, q);
  const mineNames = new Set(mine.map((f) => f.name.toLowerCase()));
  const options: Option[] = [
    ...mine.map((f) => ({
      kind: "mine" as const,
      name: f.name,
      fdc_id: f.fdc_id,
      kcal: f.kcal_100g,
      sub: f.units.each ? `1 each ≈ ${Math.round(f.units.each)} g` : "Saved food",
    })),
    ...(q.length >= 3 && hitsQ === q ? hits : [])
      .filter((h) => !mineNames.has(h.name.toLowerCase()))
      .map((h) => ({
        kind: "usda" as const,
        name: h.name,
        fdc_id: h.fdc_id,
        kcal: h.kcal_100g,
        sub: `P ${h.protein_100g}g · C ${h.carbs_100g}g · F ${h.fat_100g}g`,
      })),
  ];
  const show = open && q.length >= 2 && (options.length > 0 || searching || !!searchErr);

  function choose(o: Option) {
    setOpen(false);
    onPick({ name: o.name, fdc_id: o.kind === "usda" ? o.fdc_id : null });
  }

  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        className={CELL}
        value={value}
        placeholder={placeholder ?? "Search food"}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          onCommit();
        }}
        onKeyDown={(e) => {
          if (!show) {
            if (e.key === "Enter") onCommit();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (options[active]) choose(options[active]);
            else {
              setOpen(false);
              onCommit();
            }
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {show && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-white/15 bg-[#121620] py-1 shadow-2xl">
          {options.map((o, i) => (
            <button
              key={`${o.kind}-${o.fdc_id ?? o.name}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === active ? "bg-white/10" : ""}`}
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${o.kind === "mine" ? "bg-[#f5d020]/20 text-[#f5d020]" : "bg-[#4f8cff]/20 text-[#7fa9ff]"}`}
              >
                {o.kind === "mine" ? "Mine" : "USDA"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-text-primary">{o.name}</span>
                <span className="block truncate text-[10px] text-text-muted">{o.sub}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-text-muted">
                <span className="font-semibold text-text-primary">{Math.round(o.kcal)}</span> cal/100g
              </span>
            </button>
          ))}
          {searching && <div className="px-3 py-2 text-xs text-text-muted">Searching USDA…</div>}
          {searchErr && !searching && <div className="px-3 py-2 text-xs text-[#ff5c7a]">{searchErr}</div>}
          {!searching && !searchErr && options.length === 0 && q.length >= 3 && (
            <div className="px-3 py-2 text-xs text-text-muted">No matches. Try a simpler name (e.g. &quot;eggplant&quot;).</div>
          )}
        </div>
      )}
    </div>
  );
}
