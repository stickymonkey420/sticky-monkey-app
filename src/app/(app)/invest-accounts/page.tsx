"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import ManualAccountList from "@/components/accounts/ManualAccountList";
import { createClient } from "@/lib/supabase/client";
import { addManualAccount, deleteManualAccount, fetchManualAccounts, updateManualAccount } from "@/lib/accounts/queries";
import { groupAccountsByCategory } from "@/lib/accounts/calc";
import { addMetalHolding } from "@/lib/invest/queries";
import { METAL_OPTIONS } from "@/lib/invest/types";
import type { AccountCategory, ManualAccount } from "@/lib/accounts/types";

const INVEST_CATEGORIES: AccountCategory[] = ["brokerage_account", "retirement_account", "precious_metal"];
const CATEGORY_OPTIONS: { value: AccountCategory; label: string }[] = [
  { value: "brokerage_account", label: "Brokerage Account" },
  { value: "retirement_account", label: "Retirement Account" },
  { value: "precious_metal", label: "Precious Metals (Physical)" },
];
const RETIREMENT_TYPE_OPTIONS = [
  { value: "roth", label: "Roth IRA" },
  { value: "traditional", label: "Traditional IRA" },
  { value: "401k", label: "401(k)" },
  { value: "self_directed_ira", label: "Self-Directed IRA" },
];
const IRA_ASSET_TYPE_OPTIONS = [
  { value: "real_estate", label: "Real Estate" },
  { value: "precious_metals", label: "Precious Metals" },
  { value: "personal_loan", label: "Personal Loan" },
];

type FormState = {
  category: AccountCategory;
  institution_name: string;
  account_name: string;
  balance: string;
  interest_rate: string;
  annual_fee: string;
  notes: string;
  retirement_type: string;
  ira_asset_type: string;
};

const EMPTY_FORM: FormState = {
  category: "brokerage_account",
  institution_name: "",
  account_name: "",
  balance: "",
  interest_rate: "",
  annual_fee: "",
  notes: "",
  retirement_type: "",
  ira_asset_type: "",
};

function toInput(f: FormState) {
  const isRetirement = f.category === "retirement_account";
  const isSdira = isRetirement && f.retirement_type === "self_directed_ira";
  return {
    category: f.category,
    institution_name: f.institution_name.trim(),
    account_name: f.account_name.trim(),
    balance: Number(f.balance) || 0,
    interest_rate: f.interest_rate.trim() ? Number(f.interest_rate) : null,
    annual_fee: f.annual_fee.trim() ? Number(f.annual_fee) : null,
    notes: f.notes.trim() || null,
    retirement_type: isRetirement && f.retirement_type ? f.retirement_type : null,
    ira_asset_type: isSdira && f.ira_asset_type ? f.ira_asset_type : null,
  };
}

function fromAccount(a: ManualAccount): FormState {
  return {
    category: a.category,
    institution_name: a.institution_name,
    account_name: a.account_name,
    balance: String(a.balance),
    interest_rate: a.interest_rate != null ? String(a.interest_rate) : "",
    annual_fee: a.annual_fee != null ? String(a.annual_fee) : "",
    notes: a.notes ?? "",
    retirement_type: a.retirement_type ?? "",
    ira_asset_type: a.ira_asset_type ?? "",
  };
}

function AccountFormFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const isRetirement = form.category === "retirement_account";
  const isSdira = isRetirement && form.retirement_type === "self_directed_ira";
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input
        type="text"
        placeholder="Institution (e.g. Fidelity)"
        value={form.institution_name}
        onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <input
        type="text"
        placeholder="Account name"
        value={form.account_name}
        onChange={(e) => setForm({ ...form, account_name: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <input
        type="number"
        placeholder="Current balance"
        value={form.balance}
        onChange={(e) => setForm({ ...form, balance: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <input
        type="number"
        placeholder="Interest rate % (optional)"
        value={form.interest_rate}
        onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <input
        type="number"
        placeholder="Annual fee (optional)"
        value={form.annual_fee}
        onChange={(e) => setForm({ ...form, annual_fee: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <input
        type="text"
        placeholder="Notes (optional)"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      {isRetirement && (
        <select
          value={form.retirement_type}
          onChange={(e) => setForm({ ...form, retirement_type: e.target.value, ira_asset_type: "" })}
          className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none sm:col-span-2"
        >
          <option value="">Retirement account type…</option>
          {RETIREMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {isSdira && (
        <select
          value={form.ira_asset_type}
          onChange={(e) => setForm({ ...form, ira_asset_type: e.target.value })}
          className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none sm:col-span-2"
        >
          <option value="">What does the SDIRA hold?</option>
          {IRA_ASSET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

type MetalFormState = { product_name: string; metal: string; quantity: string; current_value: string };
const EMPTY_METAL_FORM: MetalFormState = { product_name: "", metal: "Gold", quantity: "", current_value: "" };

// Port of the live Webflow "Accounts" page under the Invest dropdown
// (slug invest-accounts, href /invest-accounts -- distinct from Banking's
// own /accounts). Manages the account-level record (institution, account
// name, balance) for brokerage/retirement/precious-metal manual accounts,
// not the positions/vault items inside them (that's Holdings/Invest).
// Live page's own subtitle: "No card, account, or routing numbers are
// stored" -- confirms this is metadata only, no Plaid overlap.
//
// A Self-Directed IRA holding precious metals gets an extra "Add Metals"
// step after creation, tying new metal_holdings rows to the new account
// via account_id (account_type='sdira') -- those rows then also show up
// in the Invest page's Vault Summary/Metals donut, which reads every
// metal_holdings row regardless of account_type.
//
// This page lives under the Invest nav group, which is entirely
// paid-gated -- same as Portfolio/Taxable/Retirement/Vault, this page has
// no separate in-page role check (matching that existing precedent).
export default function InvestAccountsPage() {
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // After a new SDIRA-holding-metals account is created, its id lands
  // here so the "Add Metals" sub-form knows which account to link to.
  const [addMetalsForAccountId, setAddMetalsForAccountId] = useState<string | null>(null);
  const [metalForm, setMetalForm] = useState<MetalFormState>(EMPTY_METAL_FORM);
  const [savingMetal, setSavingMetal] = useState(false);

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
      const rows = await fetchManualAccounts(supabase, user.id);
      if (cancelled) return;
      setAccounts(rows.filter((a) => INVEST_CATEGORIES.includes(a.category)));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => groupAccountsByCategory(accounts).filter((g) => INVEST_CATEGORIES.includes(g.category)),
    [accounts]
  );

  async function handleAdd() {
    if (!userId || adding) return;
    if (!addForm.institution_name.trim() || !addForm.account_name.trim()) return;
    setAdding(true);
    setMessage(null);
    const supabase = createClient();
    const { account, error } = await addManualAccount(supabase, userId, toInput(addForm));
    setAdding(false);
    if (error || !account) {
      setMessage(error === "forbidden" ? "Adding an account requires a paid account." : "Could not add that account. Please try again.");
      return;
    }
    setAccounts((rows) => [...rows, account]);
    setShowAddForm(false);
    if (account.category === "retirement_account" && account.retirement_type === "self_directed_ira" && account.ira_asset_type === "precious_metals") {
      setAddMetalsForAccountId(account.id);
      setMetalForm(EMPTY_METAL_FORM);
    }
    setAddForm(EMPTY_FORM);
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
      setMessage(error === "forbidden" ? "Editing an account requires a paid account." : "Could not save that account. Please try again.");
      return;
    }
    setAccounts((rows) => rows.map((r) => (r.id === a.id ? account : r)));
    setEditingId(null);
  }

  async function handleDelete(a: ManualAccount) {
    if (!(await confirm({ message: `Remove "${a.account_name}"? This can't be undone.`, danger: true }))) return;
    setDeletingId(a.id);
    const prev = accounts;
    setAccounts((rows) => rows.filter((r) => r.id !== a.id));
    const supabase = createClient();
    const { error } = await deleteManualAccount(supabase, a.id);
    setDeletingId(null);
    if (error) {
      setMessage(error === "forbidden" ? "Removing an account requires a paid account." : "Could not remove that account. Please try again.");
      setAccounts(prev);
    }
  }

  async function handleAddMetal() {
    if (!userId || !addMetalsForAccountId || savingMetal) return;
    if (!metalForm.product_name.trim() || !metalForm.quantity.trim() || !metalForm.current_value.trim()) return;
    setSavingMetal(true);
    const supabase = createClient();
    const { error } = await addMetalHolding(supabase, userId, {
      product_name: metalForm.product_name.trim(),
      metal: metalForm.metal as (typeof METAL_OPTIONS)[number],
      quantity: Number(metalForm.quantity) || 0,
      current_value: Number(metalForm.current_value) || 0,
      account_type: "sdira",
      account_id: addMetalsForAccountId,
    });
    setSavingMetal(false);
    if (error) {
      setMessage(error === "forbidden" ? "Adding metals requires a paid account." : "Could not add that metal. Please try again.");
      return;
    }
    setMetalForm(EMPTY_METAL_FORM);
    setMessage("Metal added to the account's vault. See the Invest → Vault section to view or add more.");
    setAddMetalsForAccountId(null);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Investment Accounts</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <p className="mb-4 text-xs text-text-muted">
            No card, account, or routing numbers are stored -- this tracks the account itself (institution, name,
            balance), not what&apos;s held inside it. Manage positions on the Investments page.
          </p>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Your Investment Accounts</h3>
            {!showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c]"
              >
                + Add Investment Account
              </button>
            )}
          </div>

          {message && <div className="mb-4 text-sm text-[#4f8cff]">{message}</div>}

          {showAddForm && (
            <div className="mb-4 rounded-xl bg-white/5 p-3.5">
              <select
                value={addForm.category}
                onChange={(e) =>
                  setAddForm({ ...EMPTY_FORM, category: e.target.value as AccountCategory, institution_name: addForm.institution_name, account_name: addForm.account_name, balance: addForm.balance })
                }
                className="mb-2 w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <AccountFormFields form={addForm} setForm={setAddForm} />
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={adding || !addForm.institution_name.trim() || !addForm.account_name.trim()}
                  onClick={handleAdd}
                  className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {adding ? "Adding…" : "Save Account"}
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

          {addMetalsForAccountId && (
            <div className="mb-4 rounded-xl bg-white/5 p-3.5">
              <h4 className="mb-2 text-sm font-semibold text-text-primary">Add metals to this SDIRA</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Product name (e.g. 1oz Gold Eagle)"
                  value={metalForm.product_name}
                  onChange={(e) => setMetalForm((f) => ({ ...f, product_name: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <select
                  value={metalForm.metal}
                  onChange={(e) => setMetalForm((f) => ({ ...f, metal: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  {METAL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={metalForm.quantity}
                  onChange={(e) => setMetalForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
                <input
                  type="number"
                  placeholder="Current value ($)"
                  value={metalForm.current_value}
                  onChange={(e) => setMetalForm((f) => ({ ...f, current_value: e.target.value }))}
                  className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingMetal || !metalForm.product_name.trim() || !metalForm.quantity.trim() || !metalForm.current_value.trim()}
                  onClick={handleAddMetal}
                  className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {savingMetal ? "Adding…" : "Add Metal"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddMetalsForAccountId(null)}
                  className="text-sm text-text-muted hover:underline"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-text-muted">No investment accounts added yet.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.category}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{group.label}</h4>
                  </div>
                  <ManualAccountList
                    accounts={group.accounts}
                    loading={false}
                    emptyLabel=""
                    canEdit={true}
                    editingId={editingId}
                    deletingId={deletingId}
                    onStartEdit={startEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={handleDelete}
                    renderSubtext={(a) =>
                      a.retirement_type
                        ? RETIREMENT_TYPE_OPTIONS.find((o) => o.value === a.retirement_type)?.label ?? null
                        : null
                    }
                    renderEditForm={(a) => (
                      <div>
                        <AccountFormFields form={editForm} setForm={setEditForm} />
                        <button
                          type="button"
                          disabled={savingId === a.id}
                          onClick={() => submitEdit(a)}
                          className="mt-3 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                        >
                          {savingId === a.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
