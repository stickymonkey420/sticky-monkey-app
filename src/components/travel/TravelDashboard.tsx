"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileBadge, Pencil, Plane, Plus, Scale, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { daysBetween, fmtDate, fmtMoney, isoToday } from "@/lib/medical/model";
import {
  COST_CATEGORIES,
  DOC_KINDS,
  PURPOSES,
  compareCare,
  convert,
  docStatus,
  fetchTravel,
  nights,
  tripStatus,
  tripTotals,
  type TravelData,
  type TravelDoc,
  type Trip,
  type TripCost,
} from "@/lib/travel/model";
import { useLiveRefresh } from "@/lib/supabase/useLiveRefresh";
import { CostModal, DocModal, TripModal } from "./TravelModals";

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const STATUS = {
  upcoming: { label: "Upcoming", color: "#7fa9ff", bg: "rgba(79,140,255,0.12)" },
  now: { label: "On the trip", color: "#3ddc97", bg: "rgba(61,220,151,0.12)" },
  past: { label: "Past", color: "#8a93a6", bg: "rgba(138,147,166,0.12)" },
  undated: { label: "No dates", color: "#8a93a6", bg: "rgba(138,147,166,0.12)" },
  expired: { label: "Expired", color: "#ff5c7a", bg: "rgba(255,92,122,0.12)" },
  renew: { label: "Renew soon", color: "#f5d020", bg: "rgba(245,208,32,0.12)" },
  ok: { label: "Valid", color: "#3ddc97", bg: "rgba(61,220,151,0.12)" },
  none: { label: "No date", color: "#8a93a6", bg: "rgba(138,147,166,0.12)" },
} as const;

function Pill({ s, text }: { s: keyof typeof STATUS; text?: string }) {
  const st = STATUS[s];
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: st.color, backgroundColor: st.bg }}>
      {text ?? st.label}
    </span>
  );
}

const purposeLabel = (p: string) => PURPOSES.find((x) => x.value === p)?.label ?? p;
const categoryLabel = (c: string) => COST_CATEGORIES.find((x) => x.value === c)?.label ?? c;

// Travel (App Director only for now): trips with budgets in any currency, the
// care-abroad comparison (U.S. price vs. clinic quote + travel), and travel
// documents with expiry reminders. Phase 2: days-in-country, IRS 330-day
// counter, vaccines by destination, trip spending vs. budget.
export default function TravelDashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<TravelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editTrip, setEditTrip] = useState<{ t: Trip | null } | null>(null);
  const [editCost, setEditCost] = useState<{ trip: Trip; c: TripCost | null } | null>(null);
  const [editDoc, setEditDoc] = useState<{ d: TravelDoc | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await fetchTravel(createClient());
        if (cancelled) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load travel data.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refresh = () => setReload((n) => n + 1);
  useLiveRefresh(["travel_trips", "travel_costs", "travel_documents"], userId, refresh);

  if (error) return <div className="rounded-xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 px-4 py-3 text-sm text-[#ff5c7a]">{error}</div>;
  if (!data) return <div className="text-sm text-text-muted">Loading…</div>;

  const today = isoToday();
  const { trips, costs, docs, rates } = data;
  const order = { now: 0, upcoming: 1, undated: 2, past: 3 } as const;
  const sorted = [...trips].sort(
    (a, b) => order[tripStatus(a, today)] - order[tripStatus(b, today)] || (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"),
  );
  const active = trips.find((t) => t.id === selected) ?? sorted[0] ?? null;

  const upcoming = trips.filter((t) => ["upcoming", "now"].includes(tripStatus(t, today)));
  const next = upcoming.filter((t) => t.start_date && t.start_date >= today).sort((a, b) => a.start_date!.localeCompare(b.start_date!))[0];
  const docsDue = docs.filter((d) => ["expired", "renew"].includes(docStatus(d, today).status)).length;
  const plannedUsd = upcoming.reduce((s, t) => s + tripTotals(t, costs, rates, "USD").total, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Counters */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Upcoming trips", value: String(upcoming.length), color: undefined },
          {
            label: "Next trip",
            value: next ? (daysBetween(today, next.start_date!) === 0 ? "Today" : `${daysBetween(today, next.start_date!)} days`) : "—",
            color: next ? "#7fa9ff" : undefined,
          },
          { label: "Planned spend", value: plannedUsd ? fmtMoney(plannedUsd, "USD") : "—", color: undefined },
          { label: "Documents to renew", value: String(docsDue), color: docsDue ? "#f5d020" : "#3ddc97" },
        ].map((c) => (
          <div key={c.label} className={CARD}>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className={`mt-1.5 text-3xl font-bold ${c.color ? "" : "text-text-primary"}`} style={c.color ? { color: c.color } : undefined}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Trips list */}
        <div className={`${CARD} xl:col-span-1`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Plane size={16} className="text-[#7fa9ff]" /> Trips
            </div>
            <button type="button" onClick={() => setEditTrip({ t: null })} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
              <Plus size={14} /> Add trip
            </button>
          </div>
          {sorted.length === 0 ? (
            <p className="text-sm text-text-muted">Add your first trip: where, when and why. Costs and the care-abroad comparison come next.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sorted.map((t) => {
                const tot = tripTotals(t, costs, rates);
                const cmp = compareCare(t, costs, rates);
                const on = active?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={`rounded-xl border p-3 text-left ${on ? "border-[#f5d020]/60 bg-[#f5d020]/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{t.name}</span>
                      <Pill s={tripStatus(t, today)} />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-text-muted">
                      {[[t.city, t.country].filter(Boolean).join(", "), t.start_date ? `${fmtDate(t.start_date)}${t.end_date ? ` – ${fmtDate(t.end_date)}` : ""}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <span className="text-text-muted">{tot.total ? fmtMoney(tot.total, t.currency) : "No costs yet"}</span>
                      {cmp && (
                        <span className="font-semibold" style={{ color: cmp.savings >= 0 ? "#3ddc97" : "#ff5c7a" }}>
                          {cmp.savings >= 0 ? `Saves ${Math.round(cmp.pct)}%` : `Costs ${Math.round(-cmp.pct)}% more`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Trip detail */}
        <div className={`${CARD} xl:col-span-2`}>
          {!active ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Plane size={34} className="text-[#4f8cff]" />
              <p className="mt-2 text-sm text-text-muted">Pick or add a trip to plan its budget.</p>
            </div>
          ) : (
            <TripDetail
              trip={active}
              data={data}
              onEdit={() => setEditTrip({ t: active })}
              onAddCost={() => setEditCost({ trip: active, c: null })}
              onEditCost={(c) => setEditCost({ trip: active, c })}
            />
          )}
        </div>
      </div>

      {/* Documents */}
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <FileBadge size={16} className="text-[#f5d020]" /> Travel documents
          </div>
          <button type="button" onClick={() => setEditDoc({ d: null })} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
            <Plus size={14} /> Add document
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-text-muted">Add your passport, visas and travel insurance to get a reminder before they expire. Dates only, never document numbers.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {docs.map((d) => {
              const st = docStatus(d, today);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setEditDoc({ d })}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.05]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{d.label}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {DOC_KINDS.find((k) => k.value === d.kind)?.label}
                      {d.expires_on ? ` · expires ${fmtDate(d.expires_on)}` : ""}
                      {st.days != null && st.days >= 0 ? ` (${st.days} days)` : ""}
                    </div>
                  </div>
                  <Pill s={st.status} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-snug text-text-muted/80">
        Currency conversions use daily rates (
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">
          Rates by Exchange Rate API
        </a>
        {rates.updatedAt ? `, updated ${fmtDate(rates.updatedAt.slice(0, 10))}` : ""}) and are estimates. Savings figures are for planning, not medical or financial advice.
      </p>

      {editTrip && <TripModal userId={userId} trip={editTrip.t} onClose={() => setEditTrip(null)} onSaved={refresh} />}
      {editCost && <CostModal userId={userId} trip={editCost.trip} cost={editCost.c} onClose={() => setEditCost(null)} onSaved={refresh} />}
      {editDoc && <DocModal userId={userId} doc={editDoc.d} onClose={() => setEditDoc(null)} onSaved={refresh} />}
    </div>
  );
}

function TripDetail({
  trip,
  data,
  onEdit,
  onAddCost,
  onEditCost,
}: {
  trip: Trip;
  data: TravelData;
  onEdit: () => void;
  onAddCost: () => void;
  onEditCost: (c: TripCost) => void;
}) {
  const { costs, rates } = data;
  const mine = costs.filter((c) => c.trip_id === trip.id);
  const tot = tripTotals(trip, costs, rates);
  const usd = trip.currency === "USD" ? null : tripTotals(trip, costs, rates, "USD").total;
  const cmp = compareCare(trip, costs, rates);
  const n = nights(trip.start_date, trip.end_date);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-text-primary">{trip.name}</h2>
            <button type="button" onClick={onEdit} aria-label="Edit trip" className="text-text-muted hover:text-text-primary">
              <Pencil size={14} />
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            {(trip.city || trip.country) && <span>{[trip.city, trip.country].filter(Boolean).join(", ")}</span>}
            {trip.start_date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} /> {fmtDate(trip.start_date)}
                {trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ""}
                {n != null ? ` · ${n} night${n === 1 ? "" : "s"}` : ""}
              </span>
            )}
            <span>{purposeLabel(trip.purpose)}</span>
          </div>
          {trip.notes && <p className="mt-1.5 text-xs text-text-muted">{trip.notes}</p>}
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Trip budget</div>
          <div className="text-2xl font-bold text-text-primary">{fmtMoney(tot.total, trip.currency)}</div>
          {usd != null && <div className="text-[11px] text-text-muted">≈ {fmtMoney(usd, "USD")}</div>}
        </div>
      </div>

      {/* Care abroad */}
      {cmp ? (
        <div className="rounded-xl border p-4" style={{ borderColor: cmp.savings >= 0 ? "rgba(61,220,151,0.35)" : "rgba(255,92,122,0.35)", background: cmp.savings >= 0 ? "rgba(61,220,151,0.06)" : "rgba(255,92,122,0.06)" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Scale size={16} className="text-[#f5d020]" /> Care abroad vs. U.S.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`U.S. price${trip.us_price_label ? ` (${trip.us_price_label})` : ""}`} value={fmtMoney(cmp.usPrice, "USD")} />
            <Stat label="Care abroad" value={fmtMoney(cmp.medical, "USD")} />
            <Stat label="Travel costs" value={fmtMoney(cmp.travel, "USD")} />
            <Stat label="Total abroad" value={fmtMoney(cmp.abroad, "USD")} />
          </div>
          <div className="mt-3 text-base font-bold" style={{ color: cmp.savings >= 0 ? "#3ddc97" : "#ff5c7a" }}>
            {cmp.savings >= 0
              ? `Saves ${fmtMoney(cmp.savings, "USD")} (${Math.round(cmp.pct)}%) by going${trip.city ? ` to ${trip.city}` : " abroad"}.`
              : `Costs ${fmtMoney(-cmp.savings, "USD")} more than the U.S. price.`}
          </div>
          {cmp.medical === 0 && <p className="mt-1 text-[11px] text-text-muted">Add the clinic&apos;s quote as a Medical cost to complete the comparison.</p>}
        </div>
      ) : (
        trip.purpose === "medical" && (
          <button type="button" onClick={onEdit} className="rounded-xl border border-dashed border-white/20 p-3 text-left text-sm text-text-muted hover:bg-white/[0.03]">
            <span className="font-semibold text-text-primary">Is this cheaper than at home?</span> Add the U.S. price to compare it with this trip&apos;s total.
          </button>
        )
      )}

      {/* Costs */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Wallet size={16} className="text-[#f5d020]" /> Costs
          </div>
          <button type="button" onClick={onAddCost} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
            <Plus size={14} /> Add cost
          </button>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-text-muted">Add flights, lodging, the clinic quote and anything else, in any currency.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {COST_CATEGORIES.filter((c) => mine.some((x) => x.category === c.value)).map((cat) => (
              <div key={cat.value}>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <span>{categoryLabel(cat.value)}</span>
                  <span>{fmtMoney(tot.byCategory[cat.value] ?? 0, trip.currency)}</span>
                </div>
                {mine
                  .filter((x) => x.category === cat.value)
                  .map((c) => {
                    const conv = c.currency !== trip.currency ? convert(c.amount, c.currency, trip.currency, rates) : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onEditCost(c)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{c.label || categoryLabel(c.category)}</span>
                        <span className="text-sm text-text-primary">{fmtMoney(c.amount, c.currency)}</span>
                        {conv != null && <span className="w-24 text-right text-[11px] text-text-muted">≈ {fmtMoney(conv, trip.currency)}</span>}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
        {tot.missingRate && <p className="mt-2 text-[11px] text-[#f5d020]">Some costs couldn&apos;t be converted yet (exchange rates not loaded).</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-text-muted">{label}</div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}
