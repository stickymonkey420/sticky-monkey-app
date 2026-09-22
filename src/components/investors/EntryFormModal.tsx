"use client";

import { useState } from "react";
import type { CapTableEntryInput, ProfileOption } from "@/lib/investors/queries";
import { ENTRY_TYPE_LABELS, STATUS_LABELS, type CapTableEntry, type EntryStatus, type EntryType } from "@/lib/investors/types";

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";

// lockup_expires_on is a DB-generated column (acquired_on + 5 years,
// computed by Postgres itself) -- it can never be part of an insert/update
// payload (Postgres rejects any explicit value, even null, for a
// GENERATED ALWAYS column). This mirrors that same +5-years math purely
// for an informational preview; the real value always comes from what the
// database computed and stored on the row.
function fmtLockupPreview(acquiredOn: string): string {
  const d = new Date(`${acquiredOn}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "--";
  d.setFullYear(d.getFullYear() + 5);
  return d.toLocaleDateString();
}

// App Director-only. Add/Edit for a single cap_table_entries row. Does NOT
// re-implement check_cap_table_limits()'s validation client-side -- on
// save it just submits and surfaces whatever error message Postgres
// returns (the trigger's own exceptions are already written to be
// user-readable, e.g. "...exceeding the 49 percent investor pool").
export default function EntryFormModal({
  entry,
  profileOptions,
  onClose,
  onSave,
}: {
  entry: CapTableEntry | null;
  profileOptions: ProfileOption[];
  onClose: () => void;
  onSave: (input: CapTableEntryInput, id: string | null) => Promise<{ error: string | null }>;
}) {
  const [userId, setUserId] = useState(entry?.user_id ?? "");
  const [firstName, setFirstName] = useState(entry?.first_name ?? "");
  const [lastName, setLastName] = useState(entry?.last_name ?? "");
  const [email, setEmail] = useState(entry?.email ?? "");
  const [relationship, setRelationship] = useState(entry?.relationship_to_founder ?? "");
  const [entryType, setEntryType] = useState<EntryType>(entry?.entry_type ?? "purchase");
  const [equityPct, setEquityPct] = useState(entry ? String(entry.equity_pct) : "");
  const [pricePaid, setPricePaid] = useState(entry?.price_paid != null ? String(entry.price_paid) : "");
  const [currency, setCurrency] = useState(entry?.currency ?? "USD");
  const [acquiredOn, setAcquiredOn] = useState(entry?.acquired_on ?? "");
  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? "pending");
  const [isBoardSeat, setIsBoardSeat] = useState(entry?.is_board_seat ?? false);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePickProfile(id: string) {
    setUserId(id);
    const p = profileOptions.find((o) => o.id === id);
    if (p && !entry) {
      const [f, ...rest] = (p.name ?? "").split(" ");
      setFirstName(f ?? "");
      setLastName(rest.join(" "));
      setEmail(p.email ?? "");
    }
  }

  async function handleSave() {
    if (!userId) {
      setError("Choose an investor first.");
      return;
    }
    const pct = Number(equityPct);
    if (!equityPct || Number.isNaN(pct) || pct <= 0) {
      setError("Equity % must be a positive number.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await onSave(
      {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        relationship_to_founder: relationship || null,
        entry_type: entryType,
        equity_pct: pct,
        price_paid: pricePaid ? Number(pricePaid) : null,
        currency: currency || null,
        acquired_on: acquiredOn || null,
        status,
        is_board_seat: isBoardSeat,
        notes: notes || null,
      },
      entry?.id ?? null
    );
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <h2 className="mb-5 text-lg font-bold text-text-primary">{entry ? "Edit Entry" : "Add Entry"}</h2>

        {!entry && (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs text-text-muted">Investor</label>
            <select value={userId} onChange={(e) => handlePickProfile(e.target.value)} className={FIELD_CLASS}>
              <option value="">Select an account…</option>
              {profileOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email || p.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">First Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Email</label>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} />
        </div>
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Relationship to Founder</label>
          <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} className={FIELD_CLASS} />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Type</label>
            <select value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)} className={FIELD_CLASS}>
              {Object.entries(ENTRY_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as EntryStatus)} className={FIELD_CLASS}>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Equity %</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={equityPct}
              onChange={(e) => setEquityPct(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2.5 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={isBoardSeat}
                onChange={(e) => setIsBoardSeat(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              Board Seat
            </label>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Price Paid</label>
            <input type="number" step="0.01" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Currency</label>
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Acquired On</label>
            <input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Lockup Expires</label>
            <div className={`${FIELD_CLASS} flex items-center text-text-muted`}>
              {acquiredOn ? fmtLockupPreview(acquiredOn) : "Set once Acquired On is filled in"}
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={FIELD_CLASS} />
        </div>

        {error && <div className="mt-3 text-xs text-[#e05656]">{error}</div>}

        <div className="mt-6 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-semibold text-text-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
