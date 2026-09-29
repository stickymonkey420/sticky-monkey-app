"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callPlaidFunction } from "@/lib/plaid/link";
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
// Plaid too. Already-synced transactions are kept.
//
// Trial-plan guardrail (plaid-unlink-account v6): if this is the LAST account
// on a Plaid connection, the server refuses with 409
// confirm_remove_connection_required, because removing the connection is
// permanent and the free slot can't be reused. The modal then shows that
// warning and only proceeds on a second, explicit confirmation.
type UnlinkResult = { ok: true } | { ok: false; needsConnectionConfirm: true; message: string } | { ok: false; error: string };

async function unlinkAccount(accountId: string, confirmRemoveConnection = false): Promise<UnlinkResult> {
  const res = await callPlaidFunction("plaid-unlink-account", {
    account_id: accountId,
    ...(confirmRemoveConnection ? { confirm_remove_connection: true } : {}),
  });
  if (res.ok) return { ok: true };
  if (res.status === 409 && res.data.error === "confirm_remove_connection_required") {
    return { ok: false, needsConnectionConfirm: true, message: String(res.data.message || "") };
  }
  if (res.status === 0 || res.status === 401) return { ok: false, error: String(res.data.message) };
  return { ok: false, error: "Couldn't remove that account. Please try again." };
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
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
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
    const result = await unlinkAccount(account.id, connectionWarning !== null);
    setRemoving(false);
    if (result.ok) {
      onRemoved(account.id);
      return;
    }
    if ("needsConnectionConfirm" in result) {
      setConnectionWarning(
        result.message ||
          "This is the last account on this bank connection. Disconnecting it permanently removes the connection, and the free Plaid slot can't be reused.",
      );
      return;
    }
    setError(result.error);
    setConfirmRemove(false);
    setConnectionWarning(null);
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
                  {connectionWarning
                    ? connectionWarning
                    : isPlaid
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
                    {removing
                      ? "Working…"
                      : connectionWarning
                        ? "Remove connection permanently"
                        : isPlaid
                          ? "Yes, disconnect"
                          : "Yes, remove"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRemove(false);
                      setConnectionWarning(null);
                    }}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >
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
