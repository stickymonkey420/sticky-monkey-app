"use client";

import { useEffect, useMemo, useState } from "react";
import { parseCsv, parseDate, parseMoney } from "@/lib/tax/gainsImport";
import type { GigCollection, GigField, RecordData } from "@/lib/gigs/schema";
import { INPUT } from "./gigFormat";

// CSV import into one collection (Etsy / Shopify / eBay / Airbnb / driver
// earnings exports). Headers are matched to fields automatically from the
// config's guesses and the field labels; every mapping can be changed.
// Rows that share the collection's idField value with an existing record
// update that record instead of duplicating it.

const IMPORTABLE: GigField["type"][] = ["text", "textarea", "number", "money", "percent", "date", "datetime", "select", "bool", "url", "rating"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function guessHeader(f: GigField, headers: string[], guesses: string[] | undefined): number {
  const nh = headers.map(norm);
  for (const g of guesses ?? []) {
    const i = nh.indexOf(norm(g));
    if (i >= 0) return i;
  }
  for (const cand of [f.label, f.key.replace(/_/g, " ")]) {
    const i = nh.indexOf(norm(cand));
    if (i >= 0) return i;
  }
  return -1;
}

function convert(f: GigField, raw: string): unknown {
  const v = raw.trim();
  if (!v) return undefined;
  switch (f.type) {
    case "number":
    case "money":
    case "percent":
    case "rating": {
      const n = parseMoney(v);
      return n == null ? undefined : f.type === "money" ? Math.abs(n) * (n < 0 ? -1 : 1) : n;
    }
    case "date":
      return parseDate(v) ?? undefined;
    case "datetime": {
      const t = new Date(v);
      if (Number.isNaN(t.getTime())) return undefined;
      const p = (n: number) => String(n).padStart(2, "0");
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
    }
    case "bool":
      return /^(y|yes|true|1|x)$/i.test(v);
    case "select": {
      const hit = (f.options ?? []).find((o) => o.toLowerCase() === v.toLowerCase());
      return hit ?? v;
    }
    default:
      return v;
  }
}

export type CsvImportRow = { data: RecordData; externalId: string | null };

export default function GigCsvImport({
  col,
  importing,
  result,
  onImport,
  onClose,
}: {
  col: GigCollection;
  importing: boolean;
  result: string | null;
  onImport: (rows: CsvImportRow[]) => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const fields = useMemo(() => col.fields.filter((f) => IMPORTABLE.includes(f.type)), [col.fields]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const text = await file.text();
    const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) {
      setErr("That file has no data rows.");
      return;
    }
    const headers = rows[0];
    const m: Record<string, number> = {};
    for (const f of fields) m[f.key] = guessHeader(f, headers, col.csvImport?.guess?.[f.key]);
    setFileName(file.name);
    setTable(rows);
    setMap(m);
  }

  const parsed = useMemo<CsvImportRow[]>(() => {
    if (!table) return [];
    const out: CsvImportRow[] = [];
    for (const row of table.slice(1)) {
      const data: RecordData = {};
      for (const f of fields) {
        const i = map[f.key];
        if (i == null || i < 0) continue;
        const v = convert(f, row[i] ?? "");
        if (v !== undefined) data[f.key] = v;
      }
      if (data[col.titleField] == null || data[col.titleField] === "") continue; // summary / payout lines
      for (const f of col.fields) if (data[f.key] === undefined && f.default !== undefined) data[f.key] = f.default;
      const idv = col.csvImport?.idField ? data[col.csvImport.idField] : null;
      out.push({ data, externalId: idv == null || idv === "" ? null : `ref-${String(idv)}` });
    }
    return out;
  }, [table, map, fields, col]);

  const titleMapped = (map[col.titleField] ?? -1) >= 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Import {col.label.toLowerCase()} from CSV</h3>
            {col.csvImport?.hint && <p className="mt-0.5 text-xs text-text-muted">{col.csvImport.hint}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white">
          {fileName ? "Choose another file" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
        </label>
        {fileName && <span className="ml-2 text-xs text-text-muted">{fileName}</span>}
        {err && <p className="mt-2 text-sm text-[#ff5c7a]">{err}</p>}

        {table && (
          <>
            <p className="mb-2 mt-4 text-xs text-text-muted">Match your file&apos;s columns to each field (auto-matched where possible).</p>
            <div className="grid max-h-[45vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-0.5 block text-[11px] text-text-muted">
                    {f.label}
                    {f.key === col.titleField && <span className="text-[#ff5c7a]"> *</span>}
                  </label>
                  <select className={INPUT} value={map[f.key] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                    <option value={-1}>(skip)</option>
                    {table[0].map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-text-primary">
              {titleMapped ? `${parsed.length} row${parsed.length === 1 ? "" : "s"} ready to import.` : "Map the required field to continue."}
              {col.csvImport?.idField && <span className="text-text-muted"> Rows already imported are updated, not duplicated.</span>}
            </p>
          </>
        )}
        {result && <p className="mt-2 text-sm text-[#3ddc97]">{result}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Close
          </button>
          <button
            type="button"
            disabled={!table || !titleMapped || !parsed.length || importing}
            onClick={() => onImport(parsed)}
            className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            {importing ? "Importing…" : `Import ${parsed.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
