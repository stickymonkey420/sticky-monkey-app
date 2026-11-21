"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { fetchCashOffers, fmtApy, INSURERS, isStale, KIND_LABEL, OFFER_KINDS, STALE_DAYS, type CashOffer, type OfferKind } from "@/lib/cashRates";

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const INPUT = "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";
const LABEL = "mb-1 block text-xs text-text-muted";

type Form = {
  bank: string;
  product: string;
  kind: OfferKind;
  apy: string;
  term_months: string;
  min_deposit: string;
  insured: CashOffer["insured"];
  url: string;
  notes: string;
};
const EMPTY: Form = { bank: "", product: "", kind: "savings", apy: "", term_months: "", min_deposit: "0", insured: "FDIC", url: "", notes: "" };

function toForm(o: CashOffer): Form {
  return {
    bank: o.bank,
    product: o.product,
    kind: o.kind,
    apy: o.apy == null ? "" : String(Number(o.apy)),
    term_months: o.term_months == null ? "" : String(o.term_months),
    min_deposit: String(Number(o.min_deposit) || 0),
    insured: o.insured,
    url: o.url ?? "",
    notes: o.notes ?? "",
  };
}

// Validates and converts the form to a row patch; returns an error string instead when invalid.
function toRow(f: Form): Record<string, unknown> | string {
  if (!f.bank.trim()) return "Bank name is required.";
  const apy = f.apy.trim() === "" ? null : Number(f.apy);
  if (apy !== null && (!Number.isFinite(apy) || apy < 0 || apy > 25)) return "APY must be between 0 and 25.";
  const term = f.term_months.trim() === "" ? null : Math.round(Number(f.term_months));
  if (term !== null && (!Number.isFinite(term) || term < 1 || term > 120)) return "Term must be 1–120 months.";
  if (f.kind === "cd" && term === null) return "CDs need a term in months.";
  const min = Number(f.min_deposit || 0);
  if (!Number.isFinite(min) || min < 0) return "Minimum deposit must be 0 or more.";
  const url = f.url.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return "Link must start with https://";
  return {
    bank: f.bank.trim().slice(0, 80),
    product: f.product.trim().slice(0, 120),
    kind: f.kind,
    apy,
    term_months: f.kind === "cd" ? term : null,
    min_deposit: min,
    insured: f.insured,
    url: url || null,
    notes: f.notes.trim().slice(0, 300) || null,
  };
}

function OfferFields({ f, set }: { f: Form; set: (f: Form) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className={LABEL}>Bank</label>
        <input className={INPUT} value={f.bank} maxLength={80} onChange={(e) => set({ ...f, bank: e.target.value })} placeholder="Ally Bank" />
      </div>
      <div>
        <label className={LABEL}>Product</label>
        <input className={INPUT} value={f.product} maxLength={120} onChange={(e) => set({ ...f, product: e.target.value })} placeholder="Online Savings" />
      </div>
      <div>
        <label className={LABEL}>Type</label>
        <select className={INPUT} value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value as OfferKind })}>
          {OFFER_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>APY %</label>
        <input className={INPUT} type="number" inputMode="decimal" step="0.01" value={f.apy} onChange={(e) => set({ ...f, apy: e.target.value })} placeholder="4.10" />
      </div>
      {f.kind === "cd" && (
        <div>
          <label className={LABEL}>Term (months)</label>
          <input className={INPUT} type="number" inputMode="numeric" value={f.term_months} onChange={(e) => set({ ...f, term_months: e.target.value })} placeholder="12" />
        </div>
      )}
      <div>
        <label className={LABEL}>Minimum deposit $</label>
        <input className={INPUT} type="number" inputMode="decimal" value={f.min_deposit} onChange={(e) => set({ ...f, min_deposit: e.target.value })} />
      </div>
      <div>
        <label className={LABEL}>Insured by</label>
        <select className={INPUT} value={f.insured} onChange={(e) => set({ ...f, insured: e.target.value as CashOffer["insured"] })}>
          {INSURERS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={LABEL}>Link to open an account (bank&apos;s own page, https://)</label>
        <input className={INPUT} value={f.url} onChange={(e) => set({ ...f, url: e.target.value })} placeholder="https://" />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label className={LABEL}>Notes for members (optional)</label>
        <input className={INPUT} value={f.notes} maxLength={300} onChange={(e) => set({ ...f, notes: e.target.value })} placeholder="No fees, no minimum balance" />
      </div>
    </div>
  );
}

export default function CashRatesAdmin({ onStatus }: { onStatus: (text: string, isError: boolean) => void }) {
  const confirm = useConfirm();
  const [offers, setOffers] = useState<CashOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<Form>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);

  const load = useCallback(async () => {
    const rows = await fetchCashOffers(createClient());
    setOffers(rows);
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function patch(id: string, row: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await createClient()
      .from("cash_offers")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    if (error) {
      onStatus(`Couldn't save: ${error.message}`, true);
      return false;
    }
    onStatus(ok, false);
    await load();
    return true;
  }

  async function add() {
    const row = toRow(addForm);
    if (typeof row === "string") return onStatus(row, true);
    setBusy(true);
    const now = new Date().toISOString();
    const withApy = row.apy !== null;
    const { error } = await createClient()
      .from("cash_offers")
      .insert({ ...row, active: withApy, verified_at: withApy ? now : null });
    setBusy(false);
    if (error) return onStatus(`Couldn't add: ${error.message}`, true);
    onStatus(withApy ? "Added and live for members." : "Added. Enter an APY to make it live.", false);
    setAddForm(EMPTY);
    setAdding(false);
    load();
  }

  async function saveEdit(o: CashOffer) {
    const row = toRow(editForm);
    if (typeof row === "string") return onStatus(row, true);
    // Editing the APY counts as checking it.
    const apyChanged = row.apy !== (o.apy == null ? null : Number(o.apy));
    const extra: Record<string, unknown> = apyChanged && row.apy !== null ? { verified_at: new Date().toISOString() } : {};
    if (row.apy === null) extra.active = false;
    if (await patch(o.id, { ...row, ...extra }, "Saved.")) setEditId(null);
  }

  async function remove(o: CashOffer) {
    if (!(await confirm({ message: `Remove ${o.bank} ${o.product} from Cash Rates?`, danger: true }))) return;
    const { error } = await createClient().from("cash_offers").delete().eq("id", o.id);
    if (error) onStatus("Couldn't remove it.", true);
    else load();
  }

  const stale = offers.filter((o) => o.active && isStale(o)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className={CARD}>
        <p className="text-sm text-text-muted">
          Members see active offers on Bank Accounts under <span className="text-text-primary">Where to park your cash</span>. Every Monday the app
          notifies members whose cash earns well below the best offer, and reminds you to check rates. Open each bank&apos;s page, confirm the APY, then
          tap <span className="text-text-primary">Verified</span>. Offers not verified in 21 days stop being used for alerts.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className={stale ? "text-[#f5d020]" : "text-[#3ddc97]"}>
            {stale ? `${stale} active offer${stale === 1 ? "" : "s"} not checked in ${STALE_DAYS}+ days` : "All active offers checked this week"}
          </span>
          <button type="button" onClick={() => setAdding((v) => !v)} className="ml-auto rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]">
            {adding ? "Close" : "Add offer"}
          </button>
        </div>
      </div>

      {adding && (
        <div className={CARD}>
          <OfferFields f={addForm} set={setAddForm} />
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={add} className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={CARD}>
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : offers.length === 0 ? (
          <div className="text-sm text-text-muted">No offers yet. Add the banks you want members to see.</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {offers.map((o) =>
              editId === o.id ? (
                <div key={o.id} className="py-4">
                  <OfferFields f={editForm} set={setEditForm} />
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => saveEdit(o)} className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-text-primary">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-semibold text-text-primary">
                      {o.bank} <span className="font-normal text-text-muted">· {o.product || KIND_LABEL[o.kind]}</span>
                    </div>
                    <div className="text-xs text-text-muted">
                      {KIND_LABEL[o.kind]}
                      {o.kind === "cd" && o.term_months ? ` · ${o.term_months} mo` : ""} · {o.insured}
                      {Number(o.min_deposit) > 0 ? ` · min $${Number(o.min_deposit).toLocaleString()}` : ""}
                      {o.url && (
                        <>
                          {" · "}
                          <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
                            bank page
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-20 text-right text-lg font-semibold text-text-primary">{fmtApy(o.apy)}</div>
                  <div className="w-36 text-xs">
                    {!o.active ? (
                      <span className="text-text-muted">Off for members</span>
                    ) : isStale(o) ? (
                      <span className="text-[#f5d020]">Needs a check</span>
                    ) : (
                      <span className="text-[#3ddc97]">Verified {new Date(o.verified_at as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {o.apy != null && (
                      <button type="button" disabled={busy} onClick={() => patch(o.id, { verified_at: new Date().toISOString(), active: true }, `${o.bank} verified.`)} className="font-semibold text-[#3ddc97] hover:underline disabled:opacity-40">
                        Verified
                      </button>
                    )}
                    {o.apy != null && (
                      <button type="button" disabled={busy} onClick={() => patch(o.id, { active: !o.active }, o.active ? "Hidden from members." : "Live for members.")} className="text-text-muted hover:underline disabled:opacity-40">
                        {o.active ? "Turn off" : "Turn on"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(o.id);
                        setEditForm(toForm(o));
                      }}
                      className="text-[#4f8cff] hover:underline"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(o)} className="text-[#ff5c7a] hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
