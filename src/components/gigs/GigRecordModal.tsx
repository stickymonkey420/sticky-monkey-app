"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessClient } from "@/lib/business/types";
import { fmtValue, type GigCollection, type GigField, type RecordData } from "@/lib/gigs/schema";
import { INPUT } from "./gigFormat";

// Add / edit one record. Repo rule: popups close only via a button (Cancel
// or ×), never by clicking the backdrop. Escape closes too.

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initialData(col: GigCollection, existing: RecordData | null): RecordData {
  if (existing) return { ...existing };
  const d: RecordData = {};
  for (const f of col.fields) {
    if (f.default !== undefined) d[f.key] = f.default;
    else if (f.type === "date" && (f.key === col.dateField || f.required)) d[f.key] = todayIso();
    else if (f.type === "bool") d[f.key] = false;
  }
  return d;
}

function isEmpty(v: unknown) {
  return v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
}

export default function GigRecordModal({
  col,
  existing,
  clients,
  refOptions,
  saving,
  error,
  onSave,
  onClose,
}: {
  col: GigCollection;
  existing: RecordData | null;
  clients: BusinessClient[];
  refOptions: (collectionKey: string) => { id: string; label: string }[];
  saving: boolean;
  error: string | null;
  onSave: (data: RecordData) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<RecordData>(() => initialData(col, existing));
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: string, v: unknown) => setData((d) => ({ ...d, [key]: v }));

  const preview = useMemo(
    () =>
      (col.computed ?? []).map((c) => {
        let v: number | null = null;
        try {
          v = c.fn(data);
        } catch {
          v = null;
        }
        return { label: c.label, text: fmtValue(c.format, v) };
      }),
    [col.computed, data]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss = col.fields.filter((f) => f.required && isEmpty(data[f.key])).map((f) => f.label);
    setMissing(miss);
    if (miss.length) return;
    const clean: RecordData = {};
    for (const [k, v] of Object.entries(data)) if (!isEmpty(v)) clean[k] = typeof v === "string" ? v.trim() : v;
    onSave(clean);
  }

  function input(f: GigField) {
    const v = data[f.key];
    const id = `gig-${col.key}-${f.key}`;
    switch (f.type) {
      case "textarea":
        return <textarea id={id} className={`${INPUT} min-h-[80px]`} value={(v as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case "number":
      case "money":
      case "percent":
        return (
          <div className="relative">
            {f.type === "money" && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>}
            <input
              id={id}
              type="number"
              step="any"
              inputMode="decimal"
              className={`${INPUT} ${f.type === "money" ? "pl-6" : ""} ${f.type === "percent" || f.unit ? "pr-12" : ""}`}
              value={v == null || v === "" ? "" : String(v)}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
            {(f.type === "percent" || f.unit) && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">{f.type === "percent" ? "%" : f.unit}</span>
            )}
          </div>
        );
      case "date":
        return <input id={id} type="date" className={INPUT} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
      case "datetime":
        return <input id={id} type="datetime-local" className={INPUT} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
      case "select":
        return (
          <select id={id} className={INPUT} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {typeof v === "string" && v && !(f.options ?? []).includes(v) && <option value={v}>{v}</option>}
          </select>
        );
      case "bool":
        return (
          <label className="flex h-[38px] items-center gap-2 text-sm text-text-primary">
            <input id={id} type="checkbox" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4" />
            Yes
          </label>
        );
      case "client":
        return (
          <select id={id} className={INPUT} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{clients.length ? "—" : "Add clients in the card above"}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        );
      case "ref": {
        const opts = refOptions(f.ref ?? "");
        return (
          <select id={id} className={INPUT} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      case "rating":
        return (
          <select id={id} className={INPUT} value={v == null ? "" : String(v)} onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        );
      case "url":
        return <input id={id} type="url" className={INPUT} value={(v as string) ?? ""} placeholder={f.placeholder ?? "https://"} onChange={(e) => set(f.key, e.target.value)} />;
      default:
        return <input id={id} type="text" className={INPUT} value={(v as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{existing ? `Edit ${col.singular.toLowerCase()}` : `Add ${col.singular.toLowerCase()}`}</h3>
            {col.description && <p className="mt-0.5 text-xs text-text-muted">{col.description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {col.fields.map((f) => (
            <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
              <label htmlFor={`gig-${col.key}-${f.key}`} className="mb-1 block text-xs text-text-muted">
                {f.label}
                {f.required && <span className="text-[#ff5c7a]"> *</span>}
              </label>
              {input(f)}
              {f.help && <p className="mt-1 text-[11px] leading-snug text-text-muted">{f.help}</p>}
            </div>
          ))}
        </div>
        {preview.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-white/5 p-3">
            {preview.map((p) => (
              <div key={p.label} className="min-w-[110px]">
                <div className="text-[11px] text-text-muted">{p.label}</div>
                <div className="text-sm font-semibold text-text-primary">{p.text}</div>
              </div>
            ))}
          </div>
        )}
        {missing.length > 0 && <p className="mt-3 text-sm text-[#ff5c7a]">Required: {missing.join(", ")}</p>}
        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
