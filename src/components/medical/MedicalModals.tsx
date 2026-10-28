"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  CURRENCIES,
  fmtMoney,
  parseMoney,
  deleteCheck,
  deleteCheckEvent,
  deleteDose,
  deleteProvider,
  deleteVaccine,
  doseRows,
  fmtDate,
  isoToday,
  recordCheck,
  recordDose,
  saveCheck,
  saveProvider,
  saveVaccine,
  type Check,
  type CheckEvent,
  type Currency,
  type DoseRecord,
  type DoseSpec,
  type Provider,
  type Vaccine,
} from "@/lib/medical/model";

export const INPUT = "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
// Same look without w-full, for fields sized side by side (amount + currency).
const INPUT_NOWIDTH = INPUT.replace("w-full ", "");
export const LABEL = "mb-1 block text-xs font-medium text-text-muted";

// Shared popup shell: closes only via its buttons or Escape (app rule).
export function Shell({ title, subtitle, onClose, children, footer, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        {children}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

const btnPrimary = "rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50";
const btnGhost = "rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary";
const btnDanger = "mr-auto rounded-md px-3 py-2 text-sm text-text-muted hover:text-[#ff5c7a]";

function useSave(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>, close = true) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onDone();
      return close;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, run, setError };
}

// Amount + currency pair used on vaccines, checks, doses and results.
export function CostInput({
  label,
  amount,
  currency,
  onAmount,
  onCurrency,
  placeholder,
}: {
  label: string;
  amount: string;
  currency: Currency;
  onAmount: (v: string) => void;
  onCurrency: (c: Currency) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex gap-1.5">
        <input className={`${INPUT_NOWIDTH} min-w-0 flex-1`} inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder={placeholder ?? "0.00"} />
        <select className={`${INPUT_NOWIDTH} w-[88px] flex-none`} value={currency} onChange={(e) => onCurrency(e.target.value as Currency)} aria-label="Currency">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const money = (n: number | null | undefined, c: Currency | null | undefined, fallback: Currency) => (n != null ? fmtMoney(Number(n), c ?? fallback) : null);

// ---- Record a vaccine dose ---------------------------------------------
export function DoseModal({
  userId,
  vaccine,
  doses,
  providers,
  currency,
  onClose,
  onSaved,
}: {
  userId: string;
  vaccine: Vaccine;
  doses: DoseRecord[];
  providers: Provider[];
  currency: Currency;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const rows = doseRows(vaccine, doses);
  const pending = rows.filter((r) => !r.record);
  const mine = doses.filter((d) => d.vaccine_id === vaccine.id).sort((a, b) => b.given_on.localeCompare(a.given_on));
  const [label, setLabel] = useState(pending[0]?.label ?? (vaccine.repeat_days ? "Booster" : vaccine.doses[0]?.label ?? "1"));
  const [date, setDate] = useState(isoToday());
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState(vaccine.cost_per_dose != null ? String(vaccine.cost_per_dose) : "");
  const [cur, setCur] = useState<Currency>(vaccine.cost_currency ?? currency);
  const { saving, error, run } = useSave(onSaved);
  const options = Array.from(new Set([...pending.map((p) => p.label), ...(vaccine.repeat_days ? ["Booster"] : [])]));

  return (
    <Shell
      title={vaccine.name}
      subtitle={vaccine.reason ?? undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Close
          </button>
          {options.length > 0 && (
            <button
              type="button"
              disabled={saving}
              className={btnPrimary}
              onClick={async () => {
                if (!date) return;
                const ok = await run(() =>
                  recordDose(createClient(), userId, {
                    vaccine_id: vaccine.id,
                    dose_label: label,
                    given_on: date,
                    location: location.trim() || null,
                    notes: notes.trim() || null,
                    cost: parseMoney(cost),
                    currency: parseMoney(cost) != null ? cur : null,
                  }),
                );
                if (ok) onClose();
              }}
            >
              {saving ? "Saving…" : `Record dose ${label}`}
            </button>
          )}
        </>
      }
    >
      {options.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Dose</label>
            <select className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o === "Booster" ? "Booster" : `Dose ${o}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Date given</label>
            <input className={INPUT} type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Where</label>
            <input className={INPUT} list="medical-providers" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic or hospital" />
            <datalist id="medical-providers">
              {providers.map((p) => (
                <option key={p.id} value={[p.name, p.city].filter(Boolean).join(", ")} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Notes (brand, lot, reaction…)</label>
            <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          <CostInput label="Cost paid" amount={cost} currency={cur} onAmount={setCost} onCurrency={setCur} />
        </div>
      ) : (
        <p className="text-sm text-text-muted">Series complete.</p>
      )}
      {mine.length > 0 && (
        <div className="mt-4 border-t border-white/[0.08] pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">History</div>
          {mine.map((d) => (
            <div key={d.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-20 text-text-primary">{d.dose_label === "Booster" ? "Booster" : `Dose ${d.dose_label}`}</span>
              <span className="text-text-muted">{fmtDate(d.given_on)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{[d.location, d.notes, money(d.cost, d.currency, currency)].filter(Boolean).join(" · ")}</span>
              <button
                type="button"
                aria-label="Delete"
                className="text-text-muted hover:text-[#ff5c7a]"
                onClick={async () => {
                  if (await confirm({ message: `Delete this ${vaccine.name} dose record?`, danger: true, confirmLabel: "Delete" })) await run(() => deleteDose(createClient(), d.id), false);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Add / edit a vaccine ----------------------------------------------
const REPEATS: { label: string; days: number | null }[] = [
  { label: "No repeat", days: null },
  { label: "Every year", days: 365 },
  { label: "Every 2 years", days: 730 },
  { label: "Every 5 years", days: 1825 },
  { label: "Every 10 years", days: 3650 },
];

export function VaccineModal({ userId, vaccine, currency, onClose, onSaved }: { userId: string; vaccine?: Vaccine | null; currency: Currency; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(vaccine?.name ?? "");
  const [category, setCategory] = useState(vaccine?.category ?? "Core");
  const [reason, setReason] = useState(vaccine?.reason ?? "");
  const [doses, setDoses] = useState<DoseSpec[]>(vaccine?.doses?.length ? vaccine.doses : [{ label: "1", after_days: 0 }]);
  const [repeat, setRepeat] = useState<number | null>(vaccine?.repeat_days ?? null);
  const [cost, setCost] = useState(vaccine?.cost_per_dose != null ? String(vaccine.cost_per_dose) : "");
  const [cur, setCur] = useState<Currency>(vaccine?.cost_currency ?? currency);
  const { saving, error, run, setError } = useSave(onSaved);

  const setDose = (i: number, patch: Partial<DoseSpec>) => setDoses((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Shell
      title={vaccine ? "Edit vaccine" : "Add vaccine"}
      onClose={onClose}
      wide
      footer={
        <>
          {vaccine && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: `Remove ${vaccine.name} and its dose records?`, danger: true, confirmLabel: "Remove" }))) return;
                if (await run(() => deleteVaccine(createClient(), vaccine.id))) onClose();
              }}
            >
              Remove
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
              if (!name.trim()) return setError("Name is required.");
              const clean = doses.map((d, i) => ({
                label: (d.label || String(i + 1)).slice(0, 20),
                after_days: i === 0 ? 0 : Math.max(0, Math.round(Number(d.after_days) || 0)),
                ...(i > 0 && Number(d.window_days) > 0 ? { window_days: Math.round(Number(d.window_days)) } : {}),
              }));
              const ok = await run(() =>
                saveVaccine(
                  createClient(),
                  userId,
                  {
                    name: name.trim(),
                    category: category.trim() || "Core",
                    reason: reason.trim() || null,
                    doses: clean,
                    repeat_days: repeat,
                    active: true,
                    sort: vaccine?.sort ?? 100,
                    cost_per_dose: parseMoney(cost),
                    cost_currency: parseMoney(cost) != null ? cur : null,
                  },
                  vaccine?.id,
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
          <label className={LABEL}>Vaccine</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Yellow fever" />
        </div>
        <div>
          <label className={LABEL}>Group</label>
          <input className={INPUT} list="vaccine-groups" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
          <datalist id="vaccine-groups">
            {["Core", "Age 50+", "Travel – rural / remote", "If never vaccinated", "Occupational", "Condition-specific"].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={LABEL}>Repeats</label>
          <select className={INPUT} value={repeat ?? ""} onChange={(e) => setRepeat(e.target.value ? Number(e.target.value) : null)}>
            {REPEATS.map((r) => (
              <option key={r.label} value={r.days ?? ""}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Why / notes</label>
          <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <CostInput label="Cost per dose (estimate)" amount={cost} currency={cur} onAmount={setCost} onCurrency={setCur} />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Dose schedule</div>
        <div className="flex flex-col gap-2">
          {doses.map((d, i) => (
            <div key={i} className="grid grid-cols-[70px_1fr_1fr_24px] items-end gap-2">
              <div>
                <label className={LABEL}>Dose</label>
                <input className={INPUT} value={d.label} onChange={(e) => setDose(i, { label: e.target.value })} />
              </div>
              {i === 0 ? (
                <div className="col-span-2 pb-2 text-xs text-text-muted">Due when you start the series</div>
              ) : (
                <>
                  <div>
                    <label className={LABEL}>Days after previous</label>
                    <input className={INPUT} type="number" min={0} value={d.after_days} onChange={(e) => setDose(i, { after_days: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={LABEL}>Latest (days, optional)</label>
                    <input className={INPUT} type="number" min={0} value={d.window_days ?? ""} onChange={(e) => setDose(i, { window_days: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </>
              )}
              {i > 0 ? (
                <button type="button" aria-label="Remove dose" className="pb-2 text-text-muted hover:text-[#ff5c7a]" onClick={() => setDoses((x) => x.filter((_, j) => j !== i))}>
                  <X size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setDoses((x) => [...x, { label: String(x.length + 1), after_days: 28 }])} className="mt-2 inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
          <Plus size={14} /> Add dose
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Log a health check --------------------------------------------------
export function CheckLogModal({
  userId,
  check,
  events,
  providers,
  currency,
  onClose,
  onSaved,
}: {
  userId: string;
  check: Check;
  events: CheckEvent[];
  providers: Provider[];
  currency: Currency;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const mine = events.filter((e) => e.check_id === check.id);
  const [date, setDate] = useState(isoToday());
  const [result, setResult] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState(check.est_cost != null ? String(check.est_cost) : "");
  const [cur, setCur] = useState<Currency>(check.cost_currency ?? currency);
  const { saving, error, run } = useSave(onSaved);
  return (
    <Shell
      title={check.name}
      subtitle={check.why ?? undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Close
          </button>
          <button
            type="button"
            disabled={saving}
            className={btnPrimary}
            onClick={async () => {
              if (!date) return;
              const ok = await run(() => recordCheck(createClient(), userId, {
                  check_id: check.id,
                  done_on: date,
                  result: result.trim() || null,
                  location: location.trim() || null,
                  cost: parseMoney(cost),
                  currency: parseMoney(cost) != null ? cur : null,
                }));
              if (ok) onClose();
            }}
          >
            {saving ? "Saving…" : "Log result"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Date</label>
          <input className={INPUT} type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Where</label>
          <input className={INPUT} list="medical-providers-c" value={location} onChange={(e) => setLocation(e.target.value)} />
          <datalist id="medical-providers-c">
            {providers.map((p) => (
              <option key={p.id} value={[p.name, p.city].filter(Boolean).join(", ")} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={LABEL}>Result</label>
          <input className={INPUT} value={result} onChange={(e) => setResult(e.target.value)} maxLength={500} placeholder="e.g. 122/78, A1c 5.4%" />
        </div>
        <CostInput label="Cost paid" amount={cost} currency={cur} onAmount={setCost} onCurrency={setCur} />
      </div>
      {mine.length > 0 && (
        <div className="mt-4 border-t border-white/[0.08] pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">History</div>
          {mine.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-28 text-text-muted">{fmtDate(e.done_on)}</span>
              <span className="min-w-0 flex-1 truncate text-text-primary">{e.result || "—"}</span>
              {e.cost != null && <span className="text-xs text-text-muted">{money(e.cost, e.currency, currency)}</span>}
              <button
                type="button"
                aria-label="Delete"
                className="text-text-muted hover:text-[#ff5c7a]"
                onClick={async () => {
                  if (await confirm({ message: "Delete this result?", danger: true, confirmLabel: "Delete" })) await run(() => deleteCheckEvent(createClient(), e.id), false);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Add / edit a health check -------------------------------------------
export function CheckEditModal({ userId, check, currency, onClose, onSaved }: { userId: string; check?: Check | null; currency: Currency; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(check?.name ?? "");
  const [why, setWhy] = useState(check?.why ?? "");
  const [kind, setKind] = useState<Check["kind"]>(check?.kind ?? "recurring");
  const [months, setMonths] = useState(String(check?.interval_months ?? 12));
  const [cost, setCost] = useState(check?.est_cost != null ? String(check.est_cost) : "");
  const [cur, setCur] = useState<Currency>(check?.cost_currency ?? currency);
  const { saving, error, run, setError } = useSave(onSaved);
  return (
    <Shell
      title={check ? "Edit check" : "Add check"}
      onClose={onClose}
      footer={
        <>
          {check && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: `Remove ${check.name} and its results?`, danger: true, confirmLabel: "Remove" }))) return;
                if (await run(() => deleteCheck(createClient(), check.id))) onClose();
              }}
            >
              Remove
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
              if (!name.trim()) return setError("Name is required.");
              const m = Math.round(Number(months));
              const ok = await run(() =>
                saveCheck(
                  createClient(),
                  userId,
                  {
                    name: name.trim(),
                    why: why.trim() || null,
                    kind,
                    interval_months: kind === "recurring" ? Math.min(240, Math.max(1, m || 12)) : null,
                    active: true,
                    sort: check?.sort ?? 100,
                    est_cost: parseMoney(cost),
                    cost_currency: parseMoney(cost) != null ? cur : null,
                  },
                  check?.id,
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
          <label className={LABEL}>Check</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Eye exam" />
        </div>
        <div>
          <label className={LABEL}>Type</label>
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as Check["kind"])}>
            <option value="recurring">Repeats</option>
            <option value="once">One-time</option>
            <option value="discuss">Discuss with doctor</option>
            <option value="conditional">Only if it applies</option>
          </select>
        </div>
        {kind === "recurring" && (
          <div>
            <label className={LABEL}>Every (months)</label>
            <input className={INPUT} type="number" min={1} max={240} value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
        )}
        <div>
          <label className={LABEL}>When / why</label>
          <input className={INPUT} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </div>
        <CostInput label="Cost per visit (estimate)" amount={cost} currency={cur} onAmount={setCost} onCurrency={setCur} />
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}

// ---- Add / edit a clinic -------------------------------------------------
export function ProviderModal({ userId, provider, onClose, onSaved }: { userId: string; provider?: Provider | null; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [v, setV] = useState({
    name: provider?.name ?? "",
    city: provider?.city ?? "",
    country: provider?.country ?? "",
    kind: provider?.kind ?? "",
    phone: provider?.phone ?? "",
    email: provider?.email ?? "",
    notes: provider?.notes ?? "",
  });
  const { saving, error, run, setError } = useSave(onSaved);
  const field = (k: keyof typeof v, label: string, span = false, placeholder?: string) => (
    <div className={span ? "col-span-2" : ""}>
      <label className={LABEL}>{label}</label>
      <input className={INPUT} value={v[k]} placeholder={placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={k === "notes" ? 500 : 160} />
    </div>
  );
  return (
    <Shell
      title={provider ? "Edit clinic" : "Add clinic"}
      onClose={onClose}
      footer={
        <>
          {provider && (
            <button
              type="button"
              className={btnDanger}
              onClick={async () => {
                if (!(await confirm({ message: `Remove ${provider.name}?`, danger: true, confirmLabel: "Remove" }))) return;
                if (await run(() => deleteProvider(createClient(), provider.id))) onClose();
              }}
            >
              Remove
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
              if (!v.name.trim()) return setError("Name is required.");
              if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setError("That email doesn't look right.");
              const t = (s: string) => s.trim() || null;
              const ok = await run(() =>
                saveProvider(createClient(), userId, { name: v.name.trim(), city: t(v.city), country: t(v.country), kind: t(v.kind), phone: t(v.phone), email: t(v.email), notes: t(v.notes) }, provider?.id),
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
        {field("name", "Name", true)}
        {field("city", "City / area")}
        {field("country", "Country")}
        {field("kind", "Type", false, "Private hospital, clinic…")}
        {field("phone", "Phone")}
        {field("email", "Email (for quote requests)", true, "appointments@clinic.com")}
        {field("notes", "Notes", true, "Hours, accreditation, what they stock")}
      </div>
      {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
    </Shell>
  );
}
