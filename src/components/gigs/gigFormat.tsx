"use client";

import type { BusinessClient } from "@/lib/business/types";
import { fmtValue, num, type GigCollection, type GigField, type RecordData } from "@/lib/gigs/schema";
import type { GigRecord } from "@/lib/gigs/queries";

export const INPUT =
  "w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";

export type DisplayCtx = {
  clientName: (id: string) => string | null;
  recordTitle: (id: string) => string | null;
};

export function makeDisplayCtx(clients: BusinessClient[], records: GigRecord[], collections: GigCollection[]): DisplayCtx {
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const colByKey = new Map(collections.map((c) => [c.key, c]));
  const recMap = new Map(records.map((r) => [r.id, r]));
  const ctx: DisplayCtx = {
    clientName: (id) => clientMap.get(id) ?? null,
    recordTitle: (id) => {
      const r = recMap.get(id);
      if (!r) return null;
      const col = colByKey.get(r.collection);
      if (!col) return null;
      const f = col.fields.find((x) => x.key === col.titleField);
      const v = r.data[col.titleField];
      if (!f || f.type === "ref") return v == null ? null : String(v);
      return plainValue(f, v, { clientName: ctx.clientName, recordTitle: () => null });
    },
  };
  return ctx;
}

function fmtDate(v: string): string {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return v;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(v: string): string {
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return v;
  return t.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Text form of a field value (titles, search, CSV-safe).
export function plainValue(f: GigField, v: unknown, ctx: DisplayCtx): string {
  if (v == null || v === "") return "";
  switch (f.type) {
    case "money":
      return fmtValue("money", num(v));
    case "number":
      return `${num(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${f.unit ? ` ${f.unit}` : ""}`;
    case "percent":
      return `${num(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    case "date":
      return typeof v === "string" ? fmtDate(v) : String(v);
    case "datetime":
      return typeof v === "string" ? fmtDateTime(v) : String(v);
    case "bool":
      return v === true || v === "true" ? "Yes" : "No";
    case "client":
      return ctx.clientName(String(v)) ?? "";
    case "ref":
      return ctx.recordTitle(String(v)) ?? "";
    case "rating":
      return `${num(v)}/5`;
    default:
      return String(v);
  }
}

export function CellValue({ f, v, ctx }: { f: GigField; v: unknown; ctx: DisplayCtx }) {
  if (v == null || v === "") return <span className="text-text-muted">—</span>;
  if (f.type === "url" && typeof v === "string" && /^https?:\/\//i.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
        Open
      </a>
    );
  }
  if (f.type === "bool") return v === true || v === "true" ? <span className="text-[#3ddc97]">Yes</span> : <span className="text-text-muted">No</span>;
  return <>{plainValue(f, v, ctx)}</>;
}

export function titleText(col: GigCollection, data: RecordData, ctx: DisplayCtx): string {
  const f = col.fields.find((x) => x.key === col.titleField);
  const v = data[col.titleField];
  if (!f) return v == null ? "" : String(v);
  return plainValue(f, v, ctx) || `Untitled ${col.singular.toLowerCase()}`;
}

// Date used for "this year / this month" KPIs.
export function recordDay(col: GigCollection | undefined, r: GigRecord): string {
  const v = col?.dateField ? r.data[col.dateField] : null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return r.created_at.slice(0, 10);
}
