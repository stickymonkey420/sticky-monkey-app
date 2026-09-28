"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateManualAccount } from "@/lib/accounts/queries";
import { ACCOUNT_CATEGORIES, ACCOUNT_CATEGORY_LABELS, type AccountCategory, type ManualAccount } from "@/lib/accounts/types";

// Edit pop-up for one manual_accounts row on the Banking page. Same fields
// the Card Center / Investment Accounts inline editors use (institution,
// account name, category, balance, interest rate, annual fee, notes).
// RLS already limits UPDATE to paid/app_director; "forbidden" is mapped to a
// plain-language message.

const inputClass =
  "w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted";

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "Disconnect" (Plaid-synced) / "Remove account" (manual) goes through the
// plaid-unlink-account edge function: it deletes the account, its Plaid link,
// and -- once no other account uses that bank login -- removes the login at
// Plaid too so it stops being billed. Already-synced transactions are kept.
// Two-step confirm inline (no stacked dialogs over this modal).
async function unlinkAccount(accountId: string): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return "Please sign in again.";
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/plaid-unlink-account`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ account_id: accountId }),
    });
    if (!res.ok) return "Couldn't remove that account. Please try again.";
    return null;
  } catch {
    return "Couldn't reach the server. Please try again.";
  }
}

export default function EditManualAccountModal({
  account,
  onClose,
  onSaved,
  onRemoved,
}: {
  account: ManualAccount;
  onClose: () => void;
  onSaved: (a: ManualAccount) => void;
  onRemoved: (id: string) => void;
}) {
  const isPlaid = /plaid/i.test(account.notes ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [institution, setInstitution] = useState(account.institution_name ?? "");
  const [name, setName] = useState(account.account_name ?? "");
  const [category, setCategory] = useState<AccountCategory>(account.category);
  const [balance, setBalance] = useState(String(Number(account.balance) || 0));
  const [rate, setRate] = useState(account.interest_rate == null ? "" : String(Number(account.interest_rate)));
  const [fee, setFee] = useState(account.annual_fee == null ? "" : String(Number(account.annual_fee)));
  const [notes, setNotes] = useState(account.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const balNum = Number(balance);
  const valid = institution.trim() !== "" && name.trim() !== "" && balance.trim() !== "" && Number.isFinite(balNum);

  async function remove() {
    if (removing) return;
    setRemoving(true);
    setError(null);
    const err = await unlinkAccount(account.id);
    setRemoving(false);
    if (err) {
      setError(err);
      setConfirmRemove(false);
      return;
    }
    onRemoved(account.id);
  }

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const { account: saved, error: err } = await updateManualAccount(createClient(), account.id, {
      institution_name: institution.trim(),
      account_name: name.trim(),
      category,
      balance: balNum,
      interest_rate: numOrNull(rate),
      annual_fee: numOrNull(fee),
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (err || !saved) {
      setError(err === "forbidden" ? "Editing accounts requires a paid account." : "That didn't save. Check the fields and try again.");
      return;
    }
    onSaved(saved);
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit account" className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">Edit Account</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>

        {error && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{error}</div>}

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="ma-inst">Institution</label>
              <input id="ma-inst" autoFocus value={institution} maxLength={120} onChange={(e) => setInstitution(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ma-name">Account name</label>
              <input id="ma-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="ma-cat">Category</label>
              <select id="ma-cat" value={category} onChange={(e) => setCategory(e.target.value as AccountCategory)} className={inputClass}>
                {ACCOUNT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ACCOUNT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ma-bal">Balance</label>
              <input id="ma-bal" type="number" step="0.01" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="ma-rate">Interest rate %</label>
              <input id="ma-rate" type="number" step="0.01" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="optional" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ma-fee">Annual fee</label>
              <input id="ma-fee" type="number" step="0.01" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="optional" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="ma-notes">Notes</label>
            <textarea id="ma-notes" rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              disabled={!valid || saving}
              onClick={submit}
              className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>

          <div className="mt-2 border-t border-white/[0.08] pt-3">
            {!confirmRemove ? (
              <button type="button" onClick={() => setConfirmRemove(true)} className="text-sm font-semibold text-[#ff5c7a] hover:underline">
                {isPlaid ? "Disconnect account" : "Remove account"}
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg bg-[#ff5c7a]/10 p-3">
                <div className="text-xs text-text-primary">
                  {isPlaid
                    ? `Disconnect ${account.account_name}? It stops syncing and is removed from the app. Past transactions stay.`
                    : `Remove ${account.account_name}? This can't be undone.`}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={removing}
                    onClick={remove}
                    className="rounded-md bg-[#ff5c7a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {removing ? "Working…" : isPlaid ? "Yes, disconnect" : "Yes, remove"}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className="text-xs text-text-muted hover:text-text-primary">
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
