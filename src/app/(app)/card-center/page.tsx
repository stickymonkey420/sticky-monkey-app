"use client";

import { useEffect, useState } from "react";
import ManualAccountList from "@/components/accounts/ManualAccountList";
import { createClient } from "@/lib/supabase/client";
import { addManualAccount, deleteManualAccount, fetchManualAccounts, updateManualAccount } from "@/lib/accounts/queries";
import type { ManualAccount } from "@/lib/accounts/types";

type FormState = {
  institution_name: string;
  account_name: string;
  balance: string;
  interest_rate: string;
  annual_fee: string;
  notes: string;
};

const EMPTY_FORM: FormState = { institution_name: "", account_name: "", balance: "", interest_rate: "", annual_fee: "", notes: "" };

function toInput(f: FormState) {
  return {
    category: "credit_card" as const,
    institution_name: f.institution_name.trim(),
    account_name: f.account_name.trim(),
    balance: Number(f.balance) || 0,
    interest_rate: f.interest_rate.trim() ? Number(f.interest_rate) : null,
    annual_fee: f.annual_fee.trim() ? Number(f.annual_fee) : null,
    notes: f.notes.trim() || null,
  };
}

function fromAccount(a: ManualAccount): FormState {
  return {
    institution_name: a.institution_name,
    account_name: a.account_name,
    balance: String(a.balance),
    interest_rate: a.interest_rate != null ? String(a.interest_rate) : "",
    annual_fee: a.annual_fee != null ? String(a.annual_fee) : "",
    notes: a.notes ?? "",
  };
}

// Port of the live Webflow "Card Center" page (slug
// moneyfarm-webflow-html-website-template -- an un-customized starter
// title, but the "My Cards" list + "Add Card" modal underneath it are
// real and already have 6 live rows in manual_accounts under
// category='credit_card'). Left out on purpose: the static "Current
// Balance $340,500" hero and the Payoneer/Mastercard/Visa donut -- both
// are hardcoded MoneyFarm template demo content with no backing data, not
// a real feature of this app.
//
// Viewing is open to every signed-in role (manual_accounts SELECT has no
// role check), but adding/editing/removing a card requires paid or
// app_director per RLS -- same restriction Options/Holdings/Edit
// Categories-style pages already show inline rather than blocking the
// whole page.
export default function CardCenterPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [cards, setCards] = useState<ManualAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);

      const [rows, profile] = await Promise.all([
        fetchManualAccounts(supabase, user.id),
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setCards(rows.filter((a) => a.category === "credit_card"));
      if (profile.data) setRole((profile.data as { role: string }).role);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit = role === "paid" || role === "app_director";

  async function handleAdd() {
    if (!userId || adding) return;
    if (!addForm.institution_name.trim() || !addForm.account_name.trim()) return;
    setAdding(true);
    setMessage(null);
    const supabase = createClient();
    const { account, error } = await addManualAccount(supabase, userId, toInput(addForm));
    setAdding(false);
    if (error || !account) {
      setMessage(error === "forbidden" ? "Adding a card requires a paid account." : "Could not add that card. Please try again.");
      return;
    }
    setCards((rows) => [...rows, account]);
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
  }

  function startEdit(a: ManualAccount) {
    setEditingId(a.id);
    setEditForm(fromAccount(a));
    setMessage(null);
  }

  async function submitEdit(a: ManualAccount) {
    if (savingId) return;
    if (!editForm.institution_name.trim() || !editForm.account_name.trim()) return;
    setSavingId(a.id);
    const supabase = createClient();
    const { account, error } = await updateManualAccount(supabase, a.id, toInput(editForm));
    setSavingId(null);
    if (error || !account) {
      setMessage(error === "forbidden" ? "Editing a card requires a paid account." : "Could not save that card. Please try again.");
      return;
    }
    setCards((rows) => rows.map((r) => (r.id === a.id ? account : r)));
    setEditingId(null);
  }

  async function handleDelete(a: ManualAccount) {
    if (!window.confirm(`Remove "${a.account_name}"? This can't be undone.`)) return;
    setDeletingId(a.id);
    const prev = cards;
    setCards((rows) => rows.filter((r) => r.id !== a.id));
    const supabase = createClient();
    const { error } = await deleteManualAccount(supabase, a.id);
    setDeletingId(null);
    if (error) {
      setMessage(error === "forbidden" ? "Removing a card requires a paid account." : "Could not remove that card. Please try again.");
      setCards(prev);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Card Center</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">My Cards</h3>
            {canEdit && !showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="rounded-md bg-[#3ddc97] px-3 py-1.5 text-xs font-semibold text-[#0f131c]"
              >
                + Add Card
              </button>
            )}
          </div>

          {!canEdit && (
            <p className="mb-4 text-xs text-text-muted">
              Viewing is available on any plan. Adding, editing, or removing a card requires a paid account.
            </p>
          )}

          {message && <div className="mb-4 text-sm text-[#ff5c7a]">{message}</div>}

          {showAddForm && (
            <div className="mb-4 rounded-xl bg-white/5 p-3.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Card issuer (e.g. Chase)"
                  value={addForm.institution_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, institution_name: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="text"
                  placeholder="Card name (e.g. Sapphire Preferred)"
                  value={addForm.account_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, account_name: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="number"
                  placeholder="Current balance"
                  value={addForm.balance}
                  onChange={(e) => setAddForm((f) => ({ ...f, balance: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="number"
                  placeholder="Interest rate % (optional)"
                  value={addForm.interest_rate}
                  onChange={(e) => setAddForm((f) => ({ ...f, interest_rate: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="number"
                  placeholder="Annual fee (optional)"
                  value={addForm.annual_fee}
                  onChange={(e) => setAddForm((f) => ({ ...f, annual_fee: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={adding || !addForm.institution_name.trim() || !addForm.account_name.trim()}
                  onClick={handleAdd}
                  className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {adding ? "Adding…" : "Save Card"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm(EMPTY_FORM);
                  }}
                  className="text-sm text-text-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ManualAccountList
            accounts={cards}
            loading={loading}
            emptyLabel="No credit cards added yet."
            canEdit={canEdit}
            editingId={editingId}
            deletingId={deletingId}
            onStartEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={handleDelete}
            renderEditForm={(a) => (
              <div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={editForm.institution_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, institution_name: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="text"
                    value={editForm.account_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, account_name: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="number"
                    value={editForm.balance}
                    onChange={(e) => setEditForm((f) => ({ ...f, balance: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Interest rate %"
                    value={editForm.interest_rate}
                    onChange={(e) => setEditForm((f) => ({ ...f, interest_rate: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Annual fee"
                    value={editForm.annual_fee}
                    onChange={(e) => setEditForm((f) => ({ ...f, annual_fee: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingId === a.id}
                  onClick={() => submitEdit(a)}
                  className="mt-3 rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {savingId === a.id ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          />
        </div>
      </div>
    </>
  );
}
