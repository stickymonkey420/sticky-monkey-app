"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { CostInput, INPUT, LABEL, Shell } from "@/components/medical/MedicalModals";
import { CURRENCIES, parseMoney, type Currency } from "@/lib/medical/model";
import {
  COST_CATEGORIES,
  DOC_KINDS,
  PURPOSES,
  deleteCost,
  deleteDoc,
  deleteTrip,
  saveCost,
  saveDoc,
  saveTrip,
  type CostCategory,
  type DocKind,
  type Purpose,
  type TravelDoc,
  type Trip,
  type TripCost,
} from "@/lib/travel/model";

const btnPrimary = "rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50";
const btnGhost = "rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary";
const btnDanger = "mr-auto rounded-md px-3 py-2 text-sm text-text-muted hover:text-[#ff5c7a]";

function useSave(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onDone();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, setError, run };
}

const t = (s: string) => s.trim() || null;

// ---- Trip ----------------------------------------------------------------
export function TripModal({ userId, trip, onClose, onSaved }: { userId: string; trip?: Trip | null; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [v, setV] = useState({
    name: trip?.name ?? "",
    city: trip?.city ?? "",
    country: trip?.country ?? "",
    start_date: trip?.start_date ?? "",
    end_date: trip?.end_date ?? "",
    purpose: (trip?.purpose ?? "vacation") as Purpose,
    currency: (trip?.currency ?? "USD") as Currency,
    us_price: trip?.us_price != null ? String(trip.us_price) : "",
    us_price_label: trip?.us_price_label ?? "",
    notes: trip?.notes ?? "",
  });
  const { saving, error, setError, run } = useSave(onSaved);
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  return (
    <Shell
      title={trip ? "Edit trip" : "Add trip"}
      onClose={onClose}
      wide
      footer={
        <>
          {trip && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: `Delete ${trip.name} and its costs?`, danger: true, confirmLabel: "Delete" }))) return;
                if (await run(() => deleteTrip(createClient(), trip.id))) onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className={btnPrimary}
            onClick={async () => {
              if (!v.name.trim()) return setError("Give the trip a name.");
              if (v.start_date && v.end_date && v.end_date < v.start_date) return setError("The return date is before the start date.");
              const ok = await run(() =>
                saveTrip(
                  createClient(),
                  userId,
                  {
                    name: v.name.trim(),
                    city: t(v.city),
                    country: t(v.country),
                    start_date: v.start_date || null,
                    end_date: v.end_date || null,
                    purpose: v.purpose,
                    currency: v.currency,
                    us_price: parseMoney(v.us_price),
                    us_price_label: t(v.us_price_label),
                    notes: t(v.notes),
                  },
                  trip?.id,
                ),
              );
              if (ok) onClose();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={LABEL}>Trip name</label>
          <input className={INPUT} value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="e.g. Cebu dental + vaccines" />
        </div>
        <div>
          <label className={LABEL}>City</label>
          <input className={INPUT} value={v.city} onChange={(e) => set({ city: e.target.value })} maxLength={120} />
        </div>
        <div>
          <label className={LABEL}>Country</label>
          <input className={INPUT} value={v.country} onChange={(e) => set({ country: e.target.value })} maxLength={80} />
        </div>
        <div>
          <label className={LABEL}>Start</label>
          <input className={INPUT} type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Return</label>
          <input className={INPUT} type="date" value={v.end_date} min={v.start_date || undefined} onChange={(e) => set({ end_date: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Purpose</label>
          <select className={INPUT} value={v.purpose} onChange={(e) => set({ purpose: e.target.value as Purpose })}>
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Trip currency (totals)</label>
          <select className={INPUT} value={v.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="text-xs font-semibold text-text-primary">Care-abroad comparison (optional)</div>
          <p className="mb-2 text-[11px] text-text-muted">What the same care would cost in the U.S., so the app can show whether this trip saves money.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>U.S. price (USD)</label>
              <input className={INPUT} inputMode="decimal" value={v.us_price} onChange={(e) => set({ us_price: e.target.value })} placeholder="e.g. 6500" />
            </div>
            <div>
              <label className={LABEL}>Where that price is from</label>
              <input className={INPUT} value={v.us_price_label} onChange={(e) => set({ us_price_label: e.target.value })} maxLength={200} placeholder="e.g. Reno dentist quote" />
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Notes</label>
          <textarea className={`${INPUT} min-h-[56px]`} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Cost line -------------------------------------------------------------
export function CostModal({
  userId,
  trip,
  cost,
  onClose,
  onSaved,
}: {
  userId: string;
  trip: Trip;
  cost?: TripCost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? (trip.purpose === "medical" ? "medical" : "flights"));
  const [label, setLabel] = useState(cost?.label ?? "");
  const [amount, setAmount] = useState(cost ? String(cost.amount) : "");
  const [cur, setCur] = useState<Currency>(cost?.currency ?? trip.currency);
  const { saving, error, setError, run } = useSave(onSaved);
  return (
    <Shell
      title={cost ? "Edit cost" : "Add cost"}
      subtitle={trip.name}
      onClose={onClose}
      footer={
        <>
          {cost && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: "Delete this cost?", danger: true, confirmLabel: "Delete" }))) return;
                if (await run(() => deleteCost(createClient(), cost.id))) onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className={btnPrimary}
            onClick={async () => {
              const n = parseMoney(amount);
              if (n == null) return setError("Enter an amount.");
              const ok = await run(() => saveCost(createClient(), userId, { trip_id: trip.id, category, label: t(label), amount: n, currency: cur }, cost?.id));
              if (ok) onClose();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Category</label>
          <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
            {COST_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <CostInput label="Amount" amount={amount} currency={cur} onAmount={setAmount} onCurrency={setCur} />
        <div className="col-span-2">
          <label className={LABEL}>Description (optional)</label>
          <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} placeholder="e.g. Round trip RNO–CEB, Chong Hua quote, 10 nights hotel" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Travel document -------------------------------------------------------
export function DocModal({ userId, doc, onClose, onSaved }: { userId: string; doc?: TravelDoc | null; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [kind, setKind] = useState<DocKind>(doc?.kind ?? "passport");
  const [label, setLabel] = useState(doc?.label ?? "");
  const [country, setCountry] = useState(doc?.country ?? "");
  const [expires, setExpires] = useState(doc?.expires_on ?? "");
  const [remind, setRemind] = useState(String(doc?.remind_days ?? 180));
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const { saving, error, setError, run } = useSave(onSaved);
  const kindLabel = DOC_KINDS.find((k) => k.value === kind)?.label ?? "Document";
  return (
    <Shell
      title={doc ? "Edit document" : "Add document"}
      subtitle="Dates only. Don't enter passport or visa numbers; they aren't needed and aren't stored."
      onClose={onClose}
      footer={
        <>
          {doc && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: `Delete ${doc.label}?`, danger: true, confirmLabel: "Delete" }))) return;
                if (await run(() => deleteDoc(createClient(), doc.id))) onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className={btnPrimary}
            onClick={async () => {
              const name = label.trim() || [kindLabel, country.trim()].filter(Boolean).join(" – ");
              const r = Math.round(Number(remind));
              if (!(r >= 0 && r <= 730)) return setError("Reminder must be 0–730 days.");
              const ok = await run(() =>
                saveDoc(createClient(), userId, { kind, label: name.slice(0, 120), country: t(country), expires_on: expires || null, remind_days: r, notes: t(notes) }, doc?.id),
              );
              if (ok) onClose();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Type</label>
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
            {DOC_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Country</label>
          <input className={INPUT} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} placeholder="e.g. United States" />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Name (optional)</label>
          <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={`e.g. ${kindLabel} – ${country || "Philippines"}`} />
        </div>
        <div>
          <label className={LABEL}>Expires</label>
          <input className={INPUT} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Remind me (days before)</label>
          <input className={INPUT} type="number" min={0} max={730} value={remind} onChange={(e) => setRemind(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Notes</label>
          <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Extension at BI Tagbilaran; many countries need 6 months left on a passport" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}
