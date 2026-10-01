"use client";

import { useState } from "react";
import { money } from "@/lib/investors/calc";
import type { CompanySettings, CompanySettingsInput } from "@/lib/investors/queries";

// Company Valuation card (restored from the Webflow Investors page).
// Everyone who can read company_settings (director + investors) sees it;
// only app_director gets the Edit control (RLS enforces the same rule).
export default function CompanyValuationCard({
  settings,
  canEdit,
  onSave,
}: {
  settings: CompanySettings | null;
  canEdit: boolean;
  onSave: (input: CompanySettingsInput) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [valuation, setValuation] = useState("");
  const [shares, setShares] = useState("");
  const [pool, setPool] = useState("");
  const [cap, setCap] = useState("");
  const [seats, setSeats] = useState("");
  const [boardOnly, setBoardOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!settings && !canEdit) return null;

  const v = settings?.valuation ?? null;
  const s = settings?.total_shares ?? null;
  const pps = v != null && s ? v / s : null;

  function startEdit() {
    setValuation(v == null ? "" : String(v));
    setShares(s == null ? "" : String(s));
    setPool(String(settings?.investor_pool_pct ?? 49));
    setCap(String(settings?.individual_cap_pct ?? 8));
    setSeats(String(settings?.board_seat_limit ?? 7));
    setBoardOnly(settings?.board_only ?? true);
    setErr(null);
    setEditing(true);
  }

  async function save() {
    const nv = Number(valuation);
    const ns = Number(shares);
    if (!Number.isFinite(nv) || nv < 0) return setErr("Valuation must be zero or more.");
    if (!Number.isFinite(ns) || ns <= 0 || !Number.isInteger(ns)) return setErr("Total shares must be a whole number above zero.");
    const np = Number(pool);
    const nc = Number(cap);
    const nseat = Number(seats);
    if (!Number.isFinite(np) || np <= 0 || np >= 100) return setErr("Investor pool must be between 0 and 100%.");
    if (!Number.isFinite(nc) || nc <= 0 || nc > 100) return setErr("Per-person cap must be between 0 and 100%.");
    if (!Number.isInteger(nseat) || nseat < 0) return setErr("Board seats must be a whole number.");
    setBusy(true);
    const { error } = await onSave({
      valuation: nv,
      total_shares: ns,
      investor_pool_pct: np,
      individual_cap_pct: nc,
      board_seat_limit: nseat,
      board_only: boardOnly,
    });
    setBusy(false);
    // The DB guard's messages are user-readable (e.g. "pool can't go below X%").
    if (error) return setErr(error);
    setEditing(false);
  }

  const previewPps = Number(valuation) > 0 && Number(shares) > 0 ? Number(valuation) / Number(shares) : null;
  const input = "w-full rounded-lg border border-white/10 bg-[#0f131c] px-3 py-2 text-sm text-text-primary";

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Company Valuation</h3>
        {canEdit && !editing && (
          <button type="button" onClick={startEdit} className="text-xs font-semibold text-[#4f8cff] hover:underline">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-muted">
              Valuation (USD)
              <input type="number" min="0" step="1" value={valuation} onChange={(e) => setValuation(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-xs text-text-muted">
              Total shares
              <input type="number" min="1" step="1" value={shares} onChange={(e) => setShares(e.target.value)} className={`${input} mt-1`} />
            </label>
            <div className="text-xs text-text-muted">
              Price per share
              <div className="mt-1 py-2 text-sm font-semibold text-text-primary">{previewPps == null ? "—" : fmtPps(previewPps)}</div>
            </div>
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Cap table limits</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-muted">
              Investor pool %
              <input type="number" min="0.1" max="99.9" step="0.1" value={pool} onChange={(e) => setPool(e.target.value)} className={`${input} mt-1`} />
              <span className="mt-1 block">You keep {Number(pool) > 0 && Number(pool) < 100 ? `${(100 - Number(pool)).toFixed(1)}%` : "—"}</span>
            </label>
            <label className="text-xs text-text-muted">
              Per-person cap %
              <input type="number" min="0.1" max="100" step="0.1" value={cap} onChange={(e) => setCap(e.target.value)} className={`${input} mt-1`} />
              <span className="mt-1 block">Override per person on their entry</span>
            </label>
            <label className="text-xs text-text-muted">
              Board seats
              <input type="number" min="0" step="1" value={seats} onChange={(e) => setSeats(e.target.value)} className={`${input} mt-1`} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={boardOnly} onChange={(e) => setBoardOnly(e.target.checked)} className="h-4 w-4" />
            Board members only (equity requires a board seat)
          </label>
          {err && <div className="text-xs text-[#e05656]">{err}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#4f8cff" }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Valuation" value={v == null ? "—" : money(v, "USD")} />
          <Tile label="Total Shares" value={s == null ? "—" : s.toLocaleString("en-US")} />
          <Tile label="Price per Share" value={pps == null ? "—" : fmtPps(pps)} />
        </div>
      )}
      {settings && canEdit && !editing && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>
            Investor pool <b className="text-text-primary">{settings.investor_pool_pct}%</b> (you keep {100 - settings.investor_pool_pct}%)
          </span>
          <span>
            Per-person cap <b className="text-text-primary">{settings.individual_cap_pct}%</b>
          </span>
          <span>
            Board seats <b className="text-text-primary">{settings.board_seat_limit}</b>
          </span>
          <span>{settings.board_only ? "Board members only" : "Open to non-board investors"}</span>
        </div>
      )}
      {settings?.updated_at && !editing && (
        <div className="mt-3 text-xs text-text-muted">Updated {new Date(settings.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3.5">
      <div className="mb-1 text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

// Sub-cent share prices need more than 2 decimals to be meaningful.
function fmtPps(n: number): string {
  const digits = n < 0.01 ? 6 : n < 1 ? 4 : 2;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
