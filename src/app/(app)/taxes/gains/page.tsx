"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { TAX_YEAR } from "@/lib/tax/data2026";
import { parseGainsFile, type ParseResult } from "@/lib/tax/gainsImport";
import { deleteBatch, deleteGain, existingKeys, fetchGains, importGains, totalGains, type RealizedGainRow } from "@/lib/tax/gainsQueries";
import TaxDisclaimer from "@/components/tax/TaxDisclaimer";

// Taxes > Imported Gains: upload a Robinhood account activity CSV or any
// realized-gains / 1099-B CSV. Preview shows new vs already-imported rows
// (fingerprint match); only new rows are saved.

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const FORMAT_LABEL = { robinhood_activity: "Robinhood account activity report", gains_csv: "Realized gains / 1099-B CSV" } as const;

type Preview = { fileName: string; parsed: ParseResult; dupes: Set<string> };

export default function ImportedGainsPage() {
  const confirm = useConfirm();
  const [year, setYear] = useState(TAX_YEAR);
  const [rows, setRows] = useState<RealizedGainRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [taxable, setTaxable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await fetchGains(createClient(), year);
      if (!cancelled) setRows(r);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year, reload]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setPreview(null);
    setTaxable(false);
    if (file.size > 10_000_000) return setMsg({ text: "That file is over 10 MB.", error: true });
    const parsed = parseGainsFile(await file.text());
    if (!parsed.format || parsed.gains.length === 0) {
      setMsg({ text: parsed.notes[0] ?? "No realized sales found in that file.", error: true });
      return;
    }
    setBusy(true);
    try {
      const dupes = await existingKeys(createClient(), parsed.gains.map((g) => g.dedupe_key));
      setPreview({ fileName: file.name, parsed, dupes });
    } catch {
      setMsg({ text: "Couldn't check for duplicates. Please try again.", error: true });
    }
    setBusy(false);
  }

  const fresh = useMemo(() => (preview ? preview.parsed.gains.filter((g) => !preview.dupes.has(g.dedupe_key)) : []), [preview]);
  const freshTotals = useMemo(() => totalGains(fresh), [fresh]);

  async function doImport() {
    if (!preview || !fresh.length || !taxable || busy) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setBusy(false);
    const { inserted, error } = await importGains(supabase, user.id, preview.parsed.format!, preview.fileName, fresh);
    setBusy(false);
    if (error) return setMsg({ text: `Import stopped: ${error}`, error: true });
    const skipped = preview.parsed.gains.length - inserted;
    setMsg({ text: `Imported ${inserted} sale${inserted === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped} already imported` : ""}.` });
    setPreview(null);
    setReload((n) => n + 1);
  }

  async function removeBatch(batch: string, name: string | null, count: number) {
    if (!(await confirm({ message: `Remove all ${count} rows imported from ${name ?? "this file"}?`, danger: true }))) return;
    const { error } = await deleteBatch(createClient(), batch);
    if (error) return setMsg({ text: error, error: true });
    setReload((n) => n + 1);
  }

  async function removeRow(id: string) {
    const { error } = await deleteGain(createClient(), id);
    if (error) return setMsg({ text: error, error: true });
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  }

  const totals = useMemo(() => totalGains(rows ?? []), [rows]);
  const batches = useMemo(() => {
    const m = new Map<string, { name: string | null; count: number; source: string; at: string }>();
    for (const r of rows ?? []) {
      const b = m.get(r.import_batch) ?? { name: r.file_name, count: 0, source: r.source, at: r.created_at };
      b.count++;
      m.set(r.import_batch, b);
    }
    return Array.from(m.entries());
  }, [rows]);
  const otherSource = preview && (rows ?? []).some((r) => r.source !== preview.parsed.format);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Imported gains</h1>
        <div className="flex items-center gap-3 text-xs">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-card-border bg-[#0d0f17] px-2 py-1.5 text-text-primary">
            {[TAX_YEAR, TAX_YEAR - 1, TAX_YEAR - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Link href="/taxes" className="font-semibold text-[#4f8cff] hover:underline">
            ← Taxes overview
          </Link>
        </div>
      </div>

      <TaxDisclaimer compact />

      <div className={`${CARD} mt-6`}>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Import a CSV</h3>
        <ul className="mb-4 list-disc pl-5 text-xs leading-relaxed text-text-muted">
          <li>
            <b className="text-text-primary">Robinhood:</b> Account → Reports and statements → Reports → Generate new report → <i>Account activity</i> (choose
            your <b>individual/taxable</b> account and start the date range early enough to include the buys). It arrives in about 2 hours as a CSV.
          </li>
          <li>
            <b className="text-text-primary">Other brokers / 1099-B:</b> any realized gain/loss CSV with Date Sold and Proceeds (or Gain/Loss) columns.
          </li>
          <li>Already-imported sales are detected and skipped, so overlapping files are safe.</li>
        </ul>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white">
          {busy ? "Reading…" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
        </label>
        {msg && <div className={`mt-3 text-sm ${msg.error ? "text-[#ff5c7a]" : "text-[#3ddc97]"}`}>{msg.text}</div>}

        {preview && (
          <div className="mt-5 rounded-xl border border-white/10 p-4 text-sm">
            <div className="mb-2 text-text-primary">
              <b>{preview.fileName}</b> · {FORMAT_LABEL[preview.parsed.format!]}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sales found" value={String(preview.parsed.gains.length)} />
              <Stat label="New" value={String(fresh.length)} tone="#3ddc97" />
              <Stat label="Already imported" value={String(preview.dupes.size)} tone={preview.dupes.size ? "#f5d020" : undefined} />
              <Stat label="New net gain" value={usd(freshTotals.short + freshTotals.long)} />
            </div>
            {fresh.length > 0 && (
              <div className="mt-2 text-xs text-text-muted">
                New: short-term {usd(freshTotals.short)} · long-term {usd(freshTotals.long)}
              </div>
            )}
            {preview.parsed.skipped.map((s) => (
              <div key={s.reason} className="mt-1 text-xs text-[#f5d020]">
                Skipped {s.count} {s.reason}.
              </div>
            ))}
            {preview.parsed.notes.map((n) => (
              <div key={n} className="mt-1 text-xs text-text-muted">
                {n}
              </div>
            ))}
            {otherSource && (
              <div className="mt-2 rounded-lg bg-[#f5d020]/10 p-2 text-xs text-[#f5d020]">
                You already have gains imported from a different kind of file. Importing the same trades from both a 1099 CSV and an
                activity report would count them twice. Remove one set if they overlap.
              </div>
            )}
            <label className="mt-3 flex items-start gap-2 text-xs text-text-primary">
              <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} className="mt-0.5" />
              This file is from a taxable account (not an IRA, Roth IRA or other retirement account).
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!fresh.length || !taxable || busy}
                onClick={doImport}
                className="rounded-lg bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Importing…" : fresh.length ? `Import ${fresh.length} new sale${fresh.length === 1 ? "" : "s"}` : "Nothing new to import"}
              </button>
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`${CARD} mt-6`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{year} realized gains</h3>
          <span className="text-xs text-text-muted">
            Short-term <b className="text-text-primary">{usd(totals.short)}</b> · Long-term <b className="text-text-primary">{usd(totals.long)}</b> ·{" "}
            {totals.count} sales
          </span>
        </div>
        {batches.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {batches.map(([id, b]) => (
              <span key={id} className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-text-muted">
                {b.name ?? "file"} · {b.count}
                <button type="button" onClick={() => removeBatch(id, b.name, b.count)} className="text-[#ff5c7a] hover:underline">
                  remove
                </button>
              </span>
            ))}
          </div>
        )}
        {rows === null ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-text-muted">Nothing imported for {year} yet.</div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-card-bg">
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                  <th className="py-2 pr-3">Sold</th>
                  <th className="py-2 pr-3">Security</th>
                  <th className="py-2 pr-3">Acquired</th>
                  <th className="py-2 pr-3 text-right">Proceeds</th>
                  <th className="py-2 pr-3 text-right">Cost</th>
                  <th className="py-2 pr-3 text-right">Gain</th>
                  <th className="py-2 pr-3">Term</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-text-muted">{r.date_sold}</td>
                    <td className="max-w-[240px] truncate py-2 pr-3 text-text-primary" title={r.description ?? ""}>
                      {r.description ?? r.symbol}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-text-muted">{r.date_acquired ?? "—"}</td>
                    <td className="py-2 pr-3 text-right text-text-primary">{usd(r.proceeds)}</td>
                    <td className="py-2 pr-3 text-right text-text-primary">{usd(r.cost_basis)}</td>
                    <td className="py-2 pr-3 text-right font-semibold" style={{ color: r.gain >= 0 ? "#3ddc97" : "#ff5c7a" }}>
                      {usd(r.gain)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-muted">{r.term === "long" ? "Long" : "Short"}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => removeRow(r.id)} aria-label="Delete" className="text-xs text-text-muted hover:text-[#ff5c7a]">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="font-semibold" style={{ color: tone ?? undefined }}>
        {value}
      </div>
    </div>
  );
}
