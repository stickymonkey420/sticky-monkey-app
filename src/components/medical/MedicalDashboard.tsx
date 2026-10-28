"use client";

import { useEffect, useState } from "react";
import { Building2, CalendarDays, FileText, Pencil, Plus, ShieldCheck, Stethoscope, Syringe, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CURRENCIES,
  STATUS_STYLE,
  addMoney,
  checkRow,
  fmtMoney,
  fmtTotals,
  daysBetween,
  doseRows,
  fetchMedical,
  fmtDate,
  isoToday,
  saveSettings,
  type Check,
  type Currency,
  type DueStatus,
  type MoneyTotals,
  type MedicalData,
  type Provider,
  type Vaccine,
} from "@/lib/medical/model";
import { CheckEditModal, CheckLogModal, DoseModal, INPUT, LABEL, ProviderModal, VaccineModal } from "./MedicalModals";
import { useLiveRefresh } from "@/lib/supabase/useLiveRefresh";
import QuoteModal from "./QuoteModal";
import FitValue from "@/components/ui/FitValue";

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";

function Pill({ status, text }: { status: DueStatus; text?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, backgroundColor: s.bg }}>
      {text ?? s.label}
    </span>
  );
}

function relDays(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d === 0) return "today";
  if (d > 0) return d === 1 ? "tomorrow" : `in ${d} days`;
  return d === -1 ? "1 day ago" : `${-d} days ago`;
}

type NextItem = { key: string; kind: "dose" | "check"; title: string; detail: string; due: string | null; status: DueStatus; open: () => void };

// Medical follow-ups dashboard (App Director only for now). Universal: works
// in any country; the plan is the member's own list of vaccines, preventive
// checks and clinics. Future: an AI pass builds this plan from the member's
// profile (age, sex, conditions such as diabetes, heart disease, cancer).
export default function MedicalDashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<MedicalData | null>(null);
  const [profile, setProfile] = useState<{ birth_year: number | null; sex: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dose, setDose] = useState<Vaccine | null>(null);
  const [editVaccine, setEditVaccine] = useState<{ v: Vaccine | null } | null>(null);
  const [logCheck, setLogCheck] = useState<Check | null>(null);
  const [editCheck, setEditCheck] = useState<{ c: Check | null } | null>(null);
  const [editProvider, setEditProvider] = useState<{ p: Provider | null } | null>(null);
  const [notes, setNotes] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [quote, setQuote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      try {
        const [d, hp] = await Promise.all([
          fetchMedical(supabase, userId),
          supabase.from("health_profiles").select("birth_year,sex").eq("user_id", userId).maybeSingle(),
        ]);
        if (cancelled) return;
        setData(d);
        setProfile((hp.data as { birth_year: number | null; sex: string | null } | null) ?? null);
        setNotes(d.settings.notes ?? "");
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load medical data.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  const refresh = () => setReload((n) => n + 1);
  // Live: doses, checks and clinics logged on another device appear without a
  // refresh. (Settings are left out so typing in Visit notes isn't overwritten.)
  useLiveRefresh(["medical_vaccines", "medical_vaccine_doses", "medical_checks", "medical_check_events", "medical_providers"], userId, refresh);
  if (error) return <div className="rounded-xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 px-4 py-3 text-sm text-[#ff5c7a]">{error}</div>;
  if (!data) return <div className="text-sm text-text-muted">Loading…</div>;

  const today = isoToday();
  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null;
  const vaccines = data.vaccines.filter((v) => v.active);
  const checks = data.checks.filter((c) => c.active);
  const currency: Currency = data.settings.currency ?? "USD";

  // Costs, kept in the currency each was entered in (no exchange-rate guessing).
  const year = today.slice(0, 4);
  const spent: MoneyTotals = {};
  for (const d of data.doses) if (d.given_on.startsWith(year)) addMoney(spent, d.cost, d.currency, currency);
  for (const e of data.events) if (e.done_on.startsWith(year)) addMoney(spent, e.cost, e.currency, currency);
  const ahead: MoneyTotals = {};
  let unpriced = 0;
  for (const v of vaccines) {
    const open = doseRows(v, data.doses, today).filter((r) => !r.record).length;
    if (!open) continue;
    if (v.cost_per_dose != null) addMoney(ahead, Number(v.cost_per_dose) * open, v.cost_currency, currency);
    else unpriced++;
  }
  for (const c of checks) {
    const st = checkRow(c, data.events, today).status;
    if (st === "done" || st === "info") continue;
    if (c.est_cost != null) addMoney(ahead, c.est_cost, c.cost_currency, currency);
    else unpriced++;
  }

  // Everything still open, most urgent first.
  const next: NextItem[] = [];
  for (const v of vaccines) {
    const rows = doseRows(v, data.doses, today);
    const n = rows.find((r) => !r.record);
    if (n)
      next.push({
        key: `v-${v.id}`,
        kind: "dose",
        title: v.name,
        detail: n.isBooster ? "Booster" : rows.length > 1 ? `Dose ${n.label} of ${v.doses.length}` : "1 dose",
        due: n.due,
        status: n.status,
        open: () => setDose(v),
      });
  }
  for (const c of checks) {
    const r = checkRow(c, data.events, today);
    if (r.status !== "done" && r.status !== "info")
      next.push({ key: `c-${c.id}`, kind: "check", title: c.name, detail: c.why ?? "", due: r.due, status: r.status, open: () => setLogCheck(c) });
  }
  const rank: Record<DueStatus, number> = { overdue: 0, due: 1, soon: 2, scheduled: 3, unscheduled: 4, info: 5, done: 6 };
  next.sort((a, b) => rank[a.status] - rank[b.status] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const dueNow = next.filter((n) => n.status === "overdue" || n.status === "due").length;
  const soon = next.filter((n) => n.status === "soon").length;
  const seriesDone = vaccines.filter((v) => doseRows(v, data.doses, today).filter((r) => !r.isBooster).every((r) => r.record)).length;
  const checksCurrent = checks.filter((c) => {
    const s = checkRow(c, data.events, today).status;
    return s === "done" || s === "info";
  }).length;

  async function saveCurrency(c: Currency) {
    try {
      await saveSettings(createClient(), userId, { currency: c });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  }

  async function saveSettingsNow() {
    setSavingSettings(true);
    try {
      await saveSettings(createClient(), userId, { notes: notes.trim() || null });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  const groups = Array.from(new Set(vaccines.map((v) => v.category)));
  const byCountry = data.providers.reduce<Record<string, Provider[]>>((acc, p) => {
    const k = p.country || "Other";
    (acc[k] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Profile */}
      <div className={`${CARD} flex flex-wrap items-end justify-between gap-4`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Your plan</div>
          <div className="mt-1 text-lg font-semibold text-text-primary">
            {age ? `Age ${age}` : "Age not set"}
            {profile?.sex ? ` · ${profile.sex[0].toUpperCase()}${profile.sex.slice(1)}` : ""}
          </div>
          <div className="text-xs text-text-muted">{age ? "From your Health profile." : "Set your birth year in Health → Profile."}</div>
        </div>
        <div>
          <label className={LABEL}>Default currency</label>
          <select className={`${INPUT} w-56`} value={currency} onChange={(e) => saveCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Costs */}
      <div className={`${CARD} grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center`}>
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Wallet size={14} className="text-[#f5d020]" /> Spent in {year}
          </div>
          <FitValue value={fmtTotals(spent)} max={24} className="mt-1.5 font-bold text-text-primary" />
          <div className="text-[11px] text-text-muted">From the costs you log on doses and check results.</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Still to pay (estimate)</div>
          <FitValue value={fmtTotals(ahead)} max={24} className="mt-1.5 font-bold text-[#f5d020]" />
          <div className="text-[11px] text-text-muted">
            Remaining doses and checks due.{unpriced ? ` ${unpriced} item${unpriced === 1 ? " has" : "s have"} no cost yet; add one with the pencil.` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setQuote(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]"
        >
          <FileText size={15} /> Request a quote
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Due now", value: dueNow, color: dueNow ? "#ff5c7a" : "#3ddc97" },
          { label: "Due in 30 days", value: soon, color: soon ? "#f5d020" : undefined },
          { label: "Vaccine series done", value: `${seriesDone} / ${vaccines.length}`, color: undefined },
          { label: "Checks up to date", value: `${checksCurrent} / ${checks.length}`, color: undefined },
        ].map((t) => (
          <div key={t.label} className={CARD}>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t.label}</div>
            <FitValue
              value={String(t.value)}
              className={`mt-1.5 font-bold ${t.color ? "" : "text-text-primary"}`}
              style={t.color ? { color: t.color } : undefined}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Up next */}
        <div className={`${CARD} xl:col-span-1`}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <CalendarDays size={16} className="text-[#f5d020]" /> Up next
          </div>
          {next.length === 0 ? (
            <p className="text-sm text-text-muted">All caught up.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {next.slice(0, 12).map((n) => (
                <button key={n.key} type="button" onClick={n.open} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.05]">
                  {n.kind === "dose" ? <Syringe size={16} className="shrink-0 text-[#7fa9ff]" /> : <Stethoscope size={16} className="shrink-0 text-[#ff5c7a]" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{n.title}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {n.detail}
                      {n.due ? ` · ${fmtDate(n.due)} (${relDays(n.due, today)})` : ""}
                    </div>
                  </div>
                  <Pill status={n.status} text={n.kind === "check" && !n.due && n.status === "overdue" ? "Not done" : undefined} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vaccines */}
        <div className={`${CARD} xl:col-span-2`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Syringe size={16} className="text-[#7fa9ff]" /> Vaccines
            </div>
            <button type="button" onClick={() => setEditVaccine({ v: null })} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
              <Plus size={14} /> Add vaccine
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{g}</div>
                <div className="flex flex-col gap-2">
                  {vaccines
                    .filter((v) => v.category === g)
                    .map((v) => {
                      const rows = doseRows(v, data.doses, today);
                      const n = rows.find((r) => !r.record);
                      return (
                        <div key={v.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setDose(v)} className="min-w-0 flex-1 text-left">
                              <div className="text-sm font-semibold text-text-primary">{v.name}</div>
                              {v.reason && <div className="text-[11px] text-text-muted">{v.reason}</div>}
                            </button>
                            {v.cost_per_dose != null && (
                              <span className="text-[11px] text-text-muted">{fmtMoney(Number(v.cost_per_dose), v.cost_currency ?? currency)}/dose</span>
                            )}
                            <button type="button" onClick={() => setEditVaccine({ v })} aria-label="Edit vaccine" className="text-text-muted hover:text-text-primary">
                              <Pencil size={14} />
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {rows.map((r) => (
                              <button
                                key={r.label}
                                type="button"
                                onClick={() => setDose(v)}
                                className="rounded-lg px-2 py-1 text-[11px]"
                                style={{ color: STATUS_STYLE[r.status].color, backgroundColor: STATUS_STYLE[r.status].bg }}
                                title={r.windowEnd ? `Window until ${fmtDate(r.windowEnd)}` : undefined}
                              >
                                <span className="font-semibold">{r.isBooster ? "Booster" : `Dose ${r.label}`}</span>
                                {" · "}
                                {r.record ? `given ${fmtDate(r.record.given_on)}` : r.due ? fmtDate(r.due) : r.status === "overdue" ? "due now" : "after previous dose"}
                              </button>
                            ))}
                            {!n && !v.repeat_days && <Pill status="done" text="Complete" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Health checks */}
        <div className={CARD}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ShieldCheck size={16} className="text-[#3ddc97]" /> Health checks
            </div>
            <button type="button" onClick={() => setEditCheck({ c: null })} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
              <Plus size={14} /> Add check
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {checks.map((c) => {
              const r = checkRow(c, data.events, today);
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
                  <button type="button" onClick={() => setLogCheck(c)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-text-primary">{c.name}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {r.last ? `Last ${fmtDate(r.last.done_on)}${r.last.result ? ` · ${r.last.result}` : ""}` : c.why}
                      {r.due ? ` · next ${fmtDate(r.due)}` : ""}
                    </div>
                  </button>
                  {c.est_cost != null && <span className="text-[11px] text-text-muted">~{fmtMoney(Number(c.est_cost), c.cost_currency ?? currency)}</span>}
                  <Pill
                    status={r.status}
                    text={r.status === "overdue" && !r.last ? (c.kind === "once" ? "Not done" : "Not done") : r.status === "done" && c.kind === "once" ? "Done" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setLogCheck(c)}
                    className="shrink-0 rounded-md bg-[#3ddc97]/15 px-2 py-1 text-[11px] font-semibold text-[#3ddc97] hover:bg-[#3ddc97]/25"
                  >
                    Log result
                  </button>
                  <button type="button" onClick={() => setEditCheck({ c })} aria-label="Edit check settings" className="text-text-muted hover:text-text-primary">
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clinics */}
        <div className={CARD}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Building2 size={16} className="text-[#f5d020]" /> Clinics & hospitals
            </div>
            <button type="button" onClick={() => setEditProvider({ p: null })} className="inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
              <Plus size={14} /> Add clinic
            </button>
          </div>
          {data.providers.length === 0 ? (
            <p className="text-sm text-text-muted">Add the clinics you use, in any country.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {Object.entries(byCountry).map(([country, list]) => (
                <div key={country}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{country}</div>
                  {list.map((p) => (
                    <button key={p.id} type="button" onClick={() => setEditProvider({ p })} className="flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-white/[0.03]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-text-primary">{p.name}</div>
                        <div className="truncate text-[11px] text-text-muted">{[p.city, p.kind, p.notes, p.phone, p.email].filter(Boolean).join(" · ")}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-white/[0.08] pt-3">
            <label className={LABEL}>Visit notes</label>
            <textarea className={`${INPUT} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            {(notes.trim() || null) !== (data.settings.notes ?? null) && (
              <button type="button" disabled={savingSettings} onClick={saveSettingsNow} className="mt-2 rounded-md border border-white/20 px-3 py-1.5 text-xs text-text-primary hover:bg-white/5">
                Save notes
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-text-muted/80">
        Your personal follow-up list, not medical advice. Dose timing follows the schedule you set for each vaccine; confirm with your doctor or travel clinic.
      </p>

      {dose && <DoseModal userId={userId} vaccine={dose} doses={data.doses} providers={data.providers} currency={currency} onClose={() => setDose(null)} onSaved={refresh} />}
      {editVaccine && <VaccineModal userId={userId} vaccine={editVaccine.v} currency={currency} onClose={() => setEditVaccine(null)} onSaved={refresh} />}
      {logCheck && <CheckLogModal userId={userId} check={logCheck} events={data.events} providers={data.providers} currency={currency} onClose={() => setLogCheck(null)} onSaved={refresh} />}
      {editCheck && <CheckEditModal userId={userId} check={editCheck.c} currency={currency} onClose={() => setEditCheck(null)} onSaved={refresh} />}
      {quote && <QuoteModal data={data} currency={currency} patient={profile ? { age, sex: profile.sex } : null} onClose={() => setQuote(false)} />}
      {editProvider && <ProviderModal userId={userId} provider={editProvider.p} onClose={() => setEditProvider(null)} onSaved={refresh} />}
    </div>
  );
}
