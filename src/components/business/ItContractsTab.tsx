"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { itDelete, itInsert, itUpdate, setDefaultHourlyRate } from "@/lib/business/itQueries";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  billedMinutes,
  fmtMinutes,
  type ContractType,
  type ItContract,
  type ItTicket,
  type ItTimeEntry,
} from "@/lib/business/itTypes";
import type { BusinessClient } from "@/lib/business/types";
import { itBtnSmall, itSmall, money, num } from "./itUi";

// Contracts & rates for IT / Tech Support:
//   Managed (monthly fee, covers remote / on-site / after-hours as set),
//   Prepaid hours block (covered time draws down the block, 15-min rounding),
//   Ad-hoc rate card (hourly rate, everything billable).
// Plus the business default hourly rate for tickets with no contract.

export default function ItContractsTab({
  userId,
  businessId,
  clients,
  contracts,
  tickets,
  time,
  defaultRate,
  onDefaultRate,
  onChanged,
  onError,
}: {
  userId: string;
  businessId: string;
  clients: BusinessClient[];
  contracts: ItContract[];
  tickets: ItTicket[];
  time: ItTimeEntry[];
  defaultRate: number | null;
  onDefaultRate: (r: number | null) => void;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const confirm = useConfirm();
  const [rateInput, setRateInput] = useState(defaultRate == null ? "" : String(defaultRate));
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    client_id: clients[0]?.id ?? "",
    title: "",
    contract_type: "managed" as ContractType,
    monthly_fee: "",
    hours_purchased: "",
    hourly_rate: "",
    covers_remote: true,
    covers_onsite: false,
    covers_after_hours: false,
    start_date: "",
    end_date: "",
  });

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const ticketContract = new Map(tickets.map((t) => [t.id, t.contract_id]));

  // Prepaid usage: covered time on tickets tied to the contract (15-min rounding).
  function usedMinutes(c: ItContract) {
    return time.filter((e) => e.covered && ticketContract.get(e.ticket_id) === c.id).reduce((s, e) => s + billedMinutes(e.minutes), 0);
  }

  async function saveDefaultRate() {
    const v = rateInput.trim();
    const rate = v ? Number(v) : null;
    if (rate != null && (!Number.isFinite(rate) || rate < 0)) return onError("Default rate must be zero or more.");
    const { error } = await setDefaultHourlyRate(createClient(), businessId, rate);
    if (error) return onError("Could not save the default rate. Please try again.");
    onDefaultRate(rate);
  }

  async function addContract() {
    if (busy || !form.title.trim() || !form.client_id) return;
    const n = (s: string) => (s.trim() ? Number(s) : null);
    setBusy(true);
    const { error } = await itInsert(createClient(), "it_contracts", {
      user_id: userId,
      business_id: businessId,
      client_id: form.client_id,
      title: form.title.trim(),
      contract_type: form.contract_type,
      monthly_fee: form.contract_type === "managed" ? n(form.monthly_fee) : null,
      hours_purchased: form.contract_type === "prepaid" ? n(form.hours_purchased) : null,
      hourly_rate: n(form.hourly_rate),
      covers_remote: form.contract_type === "ad_hoc" ? false : form.covers_remote,
      covers_onsite: form.contract_type === "ad_hoc" ? false : form.covers_onsite,
      covers_after_hours: form.contract_type === "ad_hoc" ? false : form.covers_after_hours,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    setBusy(false);
    if (error) return onError("Could not add that contract. Please try again.");
    setForm((f) => ({ ...f, title: "", monthly_fee: "", hours_purchased: "", hourly_rate: "" }));
    onChanged();
  }

  async function toggleActive(c: ItContract) {
    const { error } = await itUpdate(createClient(), "it_contracts", c.id, { active: !c.active });
    if (error) return onError("Could not update that contract. Please try again.");
    onChanged();
  }

  async function deleteContract(c: ItContract) {
    if (!(await confirm({ message: `Delete contract "${c.title}"? Tickets on it fall back to your default rate.`, danger: true }))) return;
    const { error } = await itDelete(createClient(), "it_contracts", c.id);
    if (error) return onError("Could not delete that contract. Please try again.");
    onChanged();
  }

  const covers = (c: ItContract) =>
    [c.covers_remote && "remote", c.covers_onsite && "on-site", c.covers_after_hours && "after-hours"].filter(Boolean).join(", ") || "nothing";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-3.5 text-xs">
        <span className="font-semibold uppercase tracking-wide text-text-muted">Default hourly rate</span>
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label="Default hourly rate"
          placeholder="$ / hour"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          className={`${itSmall} w-28`}
        />
        <button type="button" onClick={saveDefaultRate} className={itBtnSmall}>
          Save
        </button>
        <span className="text-text-muted">Used for tickets with no contract (or a contract without its own rate). Time bills in 15-minute increments.</span>
      </div>

      {clients.length === 0 ? (
        <div className="text-sm text-text-muted">Add a client first (Clients section above).</div>
      ) : (
        <div className="rounded-xl bg-white/5 p-3.5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Contracts</div>
          {contracts.length === 0 ? (
            <div className="mb-3 text-xs text-text-muted">No contracts yet.</div>
          ) : (
            <div className="mb-3 flex flex-col gap-1.5">
              {contracts.map((c) => {
                const used = c.contract_type === "prepaid" ? usedMinutes(c) : 0;
                const bought = num(c.hours_purchased) * 60;
                const pct = bought ? Math.min(100, Math.round((used / bought) * 100)) : 0;
                return (
                  <div key={c.id} className={`rounded-lg bg-[#0f131c] px-3 py-2 text-xs ${c.active ? "" : "opacity-50"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm text-text-primary">{c.title}</span>
                        <span className="text-text-muted">
                          {" "}
                          · {clientName.get(c.client_id) ?? "client"} · {CONTRACT_TYPE_LABELS[c.contract_type]}
                          {c.monthly_fee != null ? ` · ${money(num(c.monthly_fee))}/mo` : ""}
                          {c.hourly_rate != null ? ` · ${money(num(c.hourly_rate))}/h` : ""}
                          {c.contract_type !== "ad_hoc" ? ` · covers ${covers(c)}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => toggleActive(c)} className="text-text-muted hover:text-text-primary">
                          {c.active ? "Deactivate" : "Activate"}
                        </button>
                        <button type="button" onClick={() => deleteContract(c)} className="text-[#ff5c7a] hover:underline">
                          ×
                        </button>
                      </div>
                    </div>
                    {c.contract_type === "prepaid" && bought > 0 && (
                      <div className="mt-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className={`h-full rounded-full ${pct >= 90 ? "bg-[#ff5c7a]" : pct >= 75 ? "bg-[#f5d020]" : "bg-[#3ddc97]"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-0.5 text-text-muted">
                          {fmtMinutes(used)} used of {num(c.hours_purchased)}h · {fmtMinutes(Math.max(0, bought - used))} left
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <select aria-label="Client" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} className={itSmall}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input placeholder="Title (e.g. Managed IT – Gold)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={itSmall} />
            <select
              aria-label="Contract type"
              value={form.contract_type}
              onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value as ContractType }))}
              className={itSmall}
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {form.contract_type === "managed" && (
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monthly fee ($)"
                value={form.monthly_fee}
                onChange={(e) => setForm((f) => ({ ...f, monthly_fee: e.target.value }))}
                className={`${itSmall} w-32`}
              />
            )}
            {form.contract_type === "prepaid" && (
              <input
                type="number"
                min="0"
                step="0.25"
                placeholder="Hours purchased"
                value={form.hours_purchased}
                onChange={(e) => setForm((f) => ({ ...f, hours_purchased: e.target.value }))}
                className={`${itSmall} w-32`}
              />
            )}
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={form.contract_type === "ad_hoc" ? "Hourly rate ($)" : "Rate for extra work ($/h)"}
              value={form.hourly_rate}
              onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
              className={`${itSmall} w-44`}
            />
            {form.contract_type !== "ad_hoc" && (
              <span className="flex items-center gap-2 text-xs text-text-muted">
                Covers:
                {(
                  [
                    ["covers_remote", "Remote"],
                    ["covers_onsite", "On-site"],
                    ["covers_after_hours", "After-hours"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="checkbox" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </span>
            )}
            <button type="button" disabled={busy || !form.title.trim() || !form.client_id} onClick={addContract} className={itBtnSmall}>
              Add contract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
