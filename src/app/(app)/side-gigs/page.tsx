"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addUserBusiness, fetchGigCategories } from "@/lib/business/queries";
import type { GigCategory } from "@/lib/business/types";

// Port of the live Webflow "Side Gigs" page (slug side-gigs, href
// /side-gigs, nav label "Search"). SEO-customized as "Side Gig & Small
// Business Directory": a search input + results grid over gig_categories
// (50 real rows across 10 groups), matching the live page's heading
// ("Find your side gig or small business type") and subtext. This is the
// entry point that creates a user_businesses row -- confirmed against
// live data, e.g. "SM Motor" was created from the "Foil Board Rental"
// category. Selecting a category prompts for a business name, creates
// the row, then routes into My Business.
//
// None of the 5 tables this feature touches (gig_categories,
// user_businesses, business_clients, business_jobs,
// business_appointments) carry a paid/app_director RLS restriction --
// every policy is a plain per-user "owner_all" with no role check -- so
// this page and My Business are both free-tier, unlike most of this app.
export default function SideGigsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<GigCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<GigCategory | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The "name your business" panel renders above the results list, so on a
  // long list a click far down the page looked like it did nothing -- the
  // panel opened off-screen. Scroll it into view and focus the name field.
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selected) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameRef.current?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setUserId(user?.id ?? null);
      const rows = await fetchGigCategories(supabase);
      if (cancelled) return;
      setCategories(rows);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.group_label.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [categories, query]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, GigCategory[]>();
    for (const c of filtered) {
      const list = byGroup.get(c.group_label) ?? [];
      list.push(c);
      byGroup.set(c.group_label, list);
    }
    return Array.from(byGroup.entries());
  }, [filtered]);

  function selectCategory(c: GigCategory) {
    setSelected(c);
    setBusinessName(c.name);
    setMessage(null);
  }

  async function handleAdd() {
    if (!userId || !selected || adding) return;
    const name = businessName.trim();
    if (!name) return;
    setAdding(true);
    setMessage(null);
    const supabase = createClient();
    const { business, error } = await addUserBusiness(supabase, userId, {
      gig_category_id: selected.id,
      category_name: selected.name,
      group_label: selected.group_label,
      business_name: name,
    });
    setAdding(false);
    if (error || !business) {
      setMessage("Could not add that business. Please try again.");
      return;
    }
    router.push("/my-business");
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Find Your Side Gig or Small Business Type</h1>
      </div>

      <div className="flex flex-col gap-6">
        <p className="text-sm text-text-muted">
          Search rideshare, delivery, freelance, e-commerce, trades, and more — pick what matches so the app can
          tailor itself to you.
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search side gigs and business types…"
          className="w-full rounded-md border border-card-border bg-[#0f131c] px-4 py-2.5 text-sm text-text-primary outline-none"
        />

        {selected && (
          <div ref={panelRef} className="rounded-2xl border border-[#4f8cff] bg-card-bg p-5">
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              {selected.icon} {selected.name}
            </h3>
            {selected.description && <p className="mb-3 text-xs text-text-muted">{selected.description}</p>}
            {message && <div className="mb-3 text-sm text-[#ff5c7a]">{message}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={nameRef}
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Name your business"
                className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
              />
              <button
                type="button"
                disabled={adding || !businessName.trim()}
                onClick={handleAdd}
                className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add Business"}
              </button>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-text-muted hover:underline">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            No matches. Try a different search.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(([group, items]) => (
              <div key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCategory(c)}
                      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-left hover:bg-white/10 ${
                        selected?.id === c.id ? "bg-[#4f8cff]/20 ring-1 ring-[#4f8cff]" : "bg-white/5"
                      }`}
                    >
                      <span className="text-lg leading-none">{c.icon}</span>
                      <span>
                        <span className="block text-sm font-medium text-text-primary">{c.name}</span>
                        {c.description && <span className="mt-0.5 block text-xs text-text-muted">{c.description}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
