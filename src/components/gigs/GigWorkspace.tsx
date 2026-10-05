"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import type { BusinessClient } from "@/lib/business/types";
import { fmtValue, num, rowFields, type GigCollection, type GigConfig, type GigField, type KpiCtx, type RecordData } from "@/lib/gigs/schema";
import {
  deleteGigRecord,
  fetchGigIntegrations,
  fetchGigRecords,
  insertGigRecord,
  saveChecklist,
  updateGigRecord,
  type GigIntegrationRow,
  type GigRecord,
} from "@/lib/gigs/queries";
import { CellValue, INPUT, makeDisplayCtx, plainValue, recordDay, titleText, type DisplayCtx } from "./gigFormat";
import GigRecordModal from "./GigRecordModal";
import GigCsvImport, { type CsvImportRow } from "./GigCsvImport";
import GigIntegrations from "./GigIntegrations";

// Tailored workspace for one gig business, drawn from its GigConfig
// (lib/gigs/configs/*). KPIs on top, one tab per record type, and a Setup
// tab with the getting-started checklist, integrations and resources.

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const SETUP = "__setup";

type ModalState = { col: GigCollection; record: GigRecord | null } | null;

function tableColumns(col: GigCollection): GigField[] {
  const candidates = col.fields.filter((f) => f.key !== col.titleField && f.key !== col.statusField && f.type !== "textarea");
  const chosen = new Set(candidates.filter((f) => f.list).map((f) => f.key));
  for (const f of candidates) {
    if (chosen.size >= 4) break;
    chosen.add(f.key);
  }
  return candidates.filter((f) => chosen.has(f.key));
}

function compareValues(a: unknown, b: unknown): number {
  const an = typeof a === "number" ? a : NaN;
  const bn = typeof b === "number" ? b : NaN;
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export default function GigWorkspace({
  userId,
  businessId,
  config,
  clients,
}: {
  userId: string;
  businessId: string;
  config: GigConfig;
  clients: BusinessClient[];
}) {
  const confirm = useConfirm();
  const [records, setRecords] = useState<GigRecord[]>([]);
  const [integrationRows, setIntegrationRows] = useState<GigIntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(config.collections[0]?.key ?? SETUP);
  const [modal, setModal] = useState<ModalState>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [importCol, setImportCol] = useState<GigCollection | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    try {
      const [recs, ints] = await Promise.all([fetchGigRecords(supabase, businessId), fetchGigIntegrations(supabase, businessId)]);
      setRecords(recs);
      setIntegrationRows(ints);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this workspace.");
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!cancelled) await reload();
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const colByKey = useMemo(() => new Map(config.collections.map((c) => [c.key, c])), [config.collections]);
  const byCol = useMemo(() => {
    const m = new Map<string, GigRecord[]>();
    for (const r of records) {
      const list = m.get(r.collection) ?? [];
      list.push(r);
      m.set(r.collection, list);
    }
    return m;
  }, [records]);
  const ctx = useMemo<DisplayCtx>(() => makeDisplayCtx(clients, records, config.collections), [clients, records, config.collections]);

  const kpiCtx = useMemo<KpiCtx>(() => {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rows = (key: string, pred: (day: string) => boolean) =>
      (byCol.get(key) ?? []).filter((r) => pred(recordDay(colByKey.get(key), r))).map((r) => r.data);
    let incomeYtd = 0;
    let expenseYtd = 0;
    for (const col of config.collections) {
      for (const r of byCol.get(col.key) ?? []) {
        if (!recordDay(col, r).startsWith(year)) continue;
        const rf = rowFields(col, r.data);
        incomeYtd += rf.income;
        expenseYtd += rf.expense;
      }
    }
    return {
      all: (key) => (byCol.get(key) ?? []).map((r) => r.data),
      ytd: (key) => rows(key, (d) => d.startsWith(year)),
      month: (key) => rows(key, (d) => d.startsWith(month)),
      incomeYtd,
      expenseYtd,
    };
  }, [byCol, colByKey, config.collections]);

  const refOptions = useCallback(
    (key: string) => {
      const col = colByKey.get(key);
      if (!col) return [];
      return (byCol.get(key) ?? []).map((r) => ({ id: r.id, label: titleText(col, r.data, ctx) })).sort((a, b) => a.label.localeCompare(b.label));
    },
    [byCol, colByKey, ctx]
  );

  async function saveRecord(data: RecordData) {
    if (!modal) return;
    setSaving(true);
    setModalError(null);
    const supabase = createClient();
    try {
      if (modal.record) {
        const updated = await updateGigRecord(supabase, modal.col, modal.record.id, data);
        setRecords((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await insertGigRecord(supabase, userId, businessId, modal.col, data);
        setRecords((rows) => [created, ...rows]);
      }
      setModal(null);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
    setSaving(false);
  }

  async function removeRecord(col: GigCollection, r: GigRecord) {
    if (!(await confirm({ message: `Remove ${col.singular.toLowerCase()} "${titleText(col, r.data, ctx)}"?`, danger: true }))) return;
    try {
      await deleteGigRecord(createClient(), r.id);
      setRecords((rows) => rows.filter((x) => x.id !== r.id));
    } catch {
      setError("Couldn't remove that. Try again.");
    }
  }

  async function quickStatus(col: GigCollection, r: GigRecord, status: string) {
    if (!col.statusField) return;
    const data = { ...r.data, [col.statusField]: status };
    setRecords((rows) => rows.map((x) => (x.id === r.id ? { ...x, data } : x)));
    try {
      const updated = await updateGigRecord(createClient(), col, r.id, data);
      setRecords((rows) => rows.map((x) => (x.id === updated.id ? updated : x)));
    } catch {
      setError("Couldn't update the status. Try again.");
      reload();
    }
  }

  async function runImport(rows: CsvImportRow[]) {
    if (!importCol) return;
    setImporting(true);
    setImportResult(null);
    const supabase = createClient();
    const idField = importCol.csvImport?.idField;
    const existing = byCol.get(importCol.key) ?? [];
    let added = 0;
    let updated = 0;
    let failed = 0;
    for (const row of rows) {
      const match = row.externalId
        ? existing.find((r) => r.external_id === row.externalId || (idField && String(r.data[idField] ?? "") === String(row.data[idField] ?? "")))
        : undefined;
      try {
        if (match) {
          await updateGigRecord(supabase, importCol, match.id, { ...match.data, ...row.data }, row.externalId);
          updated++;
        } else {
          await insertGigRecord(supabase, userId, businessId, importCol, row.data, { external_id: row.externalId, source: "csv" });
          added++;
        }
      } catch {
        failed++;
      }
    }
    setImporting(false);
    setImportResult(`Added ${added}, updated ${updated}${failed ? `, ${failed} failed` : ""}.`);
    await reload();
  }

  const checklistRec = byCol.get("_checklist")?.[0] ?? null;
  const checklistDone = (checklistRec?.data.done as Record<string, boolean> | undefined) ?? {};
  async function toggleCheck(i: number) {
    const done = { ...checklistDone, [String(i)]: !checklistDone[String(i)] };
    try {
      const saved = await saveChecklist(createClient(), userId, businessId, checklistRec, done);
      setRecords((rows) => (checklistRec ? rows.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...rows]));
    } catch {
      setError("Couldn't save the checklist. Try again.");
    }
  }

  const hasSetup = !!(config.checklist || config.integrations?.length || config.resources?.length);
  const checklistCount = config.checklist?.items.length ?? 0;
  const checklistDoneCount = config.checklist ? config.checklist.items.filter((_, i) => checklistDone[String(i)]).length : 0;
  const activeCol = colByKey.get(tab) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className={CARD}>
        <p className="mb-4 text-sm text-text-muted">{config.tagline}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {config.kpis.map((k) => {
            let v: number | string | null = null;
            try {
              v = k.value(kpiCtx);
            } catch {
              v = null;
            }
            const text = typeof v === "string" ? v : k.format === "text" ? String(v ?? "—") : fmtValue(k.format, v);
            return (
              <div key={k.label} className="rounded-xl bg-white/5 p-3" title={k.hint}>
                <div className="text-[11px] uppercase tracking-wide text-text-muted">{k.label}</div>
                <div className="mt-1 text-lg font-semibold text-text-primary">{loading ? "…" : text}</div>
                {k.hint && <div className="mt-0.5 text-[11px] leading-snug text-text-muted">{k.hint}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-4 flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
          {config.collections.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === c.key ? "bg-[#f5d020] text-[#0f131c]" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
            >
              {c.label}
              <span className="ml-1.5 text-xs opacity-70">{(byCol.get(c.key) ?? []).length}</span>
            </button>
          ))}
          {hasSetup && (
            <button
              type="button"
              onClick={() => setTab(SETUP)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === SETUP ? "bg-[#f5d020] text-[#0f131c]" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
            >
              Setup &amp; tools
              {checklistCount > 0 && (
                <span className="ml-1.5 text-xs opacity-70">
                  {checklistDoneCount}/{checklistCount}
                </span>
              )}
            </button>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-[#ff5c7a]">{error}</p>}

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : tab === SETUP ? (
          <div className="flex flex-col gap-6">
            {config.checklist && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{config.checklist.label}</h4>
                <div className="flex flex-col gap-1.5">
                  {config.checklist.items.map((item, i) => (
                    <label key={item} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text-primary hover:bg-white/5">
                      <input type="checkbox" checked={!!checklistDone[String(i)]} onChange={() => toggleCheck(i)} className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className={checklistDone[String(i)] ? "text-text-muted line-through" : ""}>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {!!config.integrations?.length && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Connected apps</h4>
                <GigIntegrations
                  businessId={businessId}
                  integrations={config.integrations}
                  rows={integrationRows}
                  listings={refOptions("listings")}
                  onChanged={reload}
                />
              </div>
            )}
            {!!config.resources?.length && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Resources</h4>
                <ul className="flex flex-col gap-1.5">
                  {config.resources.map((r) => (
                    <li key={r.url} className="text-sm">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
                        {r.label} ↗
                      </a>
                      {r.note && <span className="text-text-muted"> · {r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : activeCol ? (
          <CollectionView
            key={activeCol.key}
            col={activeCol}
            records={byCol.get(activeCol.key) ?? []}
            ctx={ctx}
            onAdd={() => {
              setModalError(null);
              setModal({ col: activeCol, record: null });
            }}
            onEdit={(r) => {
              setModalError(null);
              setModal({ col: activeCol, record: r });
            }}
            onDelete={(r) => removeRecord(activeCol, r)}
            onStatus={(r, s) => quickStatus(activeCol, r, s)}
            onImport={
              activeCol.csvImport
                ? () => {
                    setImportResult(null);
                    setImportCol(activeCol);
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      {modal && (
        <GigRecordModal
          key={modal.record?.id ?? `new-${modal.col.key}`}
          col={modal.col}
          existing={modal.record?.data ?? null}
          clients={clients}
          refOptions={refOptions}
          saving={saving}
          error={modalError}
          onSave={saveRecord}
          onClose={() => setModal(null)}
        />
      )}
      {importCol && (
        <GigCsvImport col={importCol} importing={importing} result={importResult} onImport={runImport} onClose={() => setImportCol(null)} />
      )}
    </div>
  );
}

function CollectionView({
  col,
  records,
  ctx,
  onAdd,
  onEdit,
  onDelete,
  onStatus,
  onImport,
}: {
  col: GigCollection;
  records: GigRecord[];
  ctx: DisplayCtx;
  onAdd: () => void;
  onEdit: (r: GigRecord) => void;
  onDelete: (r: GigRecord) => void;
  onStatus: (r: GigRecord, status: string) => void;
  onImport?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const statusField = col.statusField ? col.fields.find((f) => f.key === col.statusField) : undefined;
  const columns = useMemo(() => tableColumns(col), [col]);
  const computed = useMemo(() => (col.computed ?? []).filter((c) => c.list !== false).slice(0, 4), [col.computed]);

  const sorted = useMemo(() => {
    const s = col.sort ?? (col.dateField ? { field: col.dateField, dir: "desc" as const } : null);
    const rows = [...records];
    rows.sort((a, b) => {
      if (s) {
        const c = compareValues(a.data[s.field], b.data[s.field]);
        if (c !== 0) return s.dir === "asc" ? c : -c;
      }
      return b.created_at.localeCompare(a.created_at);
    });
    return rows;
  }, [records, col.sort, col.dateField]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((r) => {
      if (statusFilter && String(r.data[col.statusField ?? ""] ?? "") !== statusFilter) return false;
      if (!q) return true;
      const hay = [titleText(col, r.data, ctx), ...col.fields.map((f) => plainValue(f, r.data[f.key], ctx))].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, statusFilter, query, col, ctx]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!col.statusField) return m;
    for (const r of records) {
      const s = String(r.data[col.statusField] ?? "");
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [records, col.statusField]);

  const compVal = (c: (typeof computed)[number], d: RecordData) => {
    try {
      return c.fn(d);
    } catch {
      return null;
    }
  };
  const moneyCols = columns.filter((f) => f.type === "money");
  const moneyComps = computed.filter((c) => c.format === "money");
  const showTotals = visible.length > 1 && (moneyCols.length > 0 || moneyComps.length > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {col.description && <p className="text-xs text-text-muted">{col.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {records.length > 5 && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label={`Search ${col.label}`} className={`${INPUT} w-40`} />
          )}
          {onImport && (
            <button type="button" onClick={onImport} className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-text-primary hover:bg-white/15">
              Import CSV
            </button>
          )}
          <button type="button" onClick={onAdd} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]">
            + Add {col.singular.toLowerCase()}
          </button>
        </div>
      </div>

      {statusField && records.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={`rounded-full px-3 py-1 text-xs ${!statusFilter ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
          >
            All {records.length}
          </button>
          {(statusField.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setStatusFilter(statusFilter === o ? "" : o)}
              className={`rounded-full px-3 py-1 text-xs ${statusFilter === o ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:text-text-primary"} ${counts.get(o) ? "" : "opacity-50"}`}
            >
              {o} {counts.get(o) ?? 0}
            </button>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-text-muted">
          No {col.label.toLowerCase()} yet.{" "}
          <button type="button" onClick={onAdd} className="font-semibold text-[#f5d020] hover:underline">
            Add the first one
          </button>
          {onImport && (
            <>
              {" "}
              or{" "}
              <button type="button" onClick={onImport} className="font-semibold text-[#4f8cff] hover:underline">
                import a CSV
              </button>
            </>
          )}
          .
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3">{col.fields.find((f) => f.key === col.titleField)?.label ?? col.singular}</th>
                {statusField && <th className="py-2 pr-3">{statusField.label}</th>}
                {columns.map((f) => (
                  <th key={f.key} className={`py-2 pr-3 ${["money", "number", "percent"].includes(f.type) ? "text-right" : ""}`}>
                    {f.label}
                  </th>
                ))}
                {computed.map((c) => (
                  <th key={c.key} className="py-2 pr-3 text-right text-[#f5d020]/80">
                    {c.label}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-3">
                    <button type="button" onClick={() => onEdit(r)} className="text-left font-medium text-text-primary hover:text-[#f5d020]">
                      {titleText(col, r.data, ctx)}
                    </button>
                    {r.source !== "manual" && <span className="ml-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-text-muted">{r.source}</span>}
                  </td>
                  {statusField && (
                    <td className="py-2 pr-3">
                      <select
                        value={String(r.data[statusField.key] ?? "")}
                        onChange={(e) => onStatus(r, e.target.value)}
                        aria-label={statusField.label}
                        className="rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                      >
                        <option value="">—</option>
                        {(statusField.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {columns.map((f) => (
                    <td key={f.key} className={`py-2 pr-3 ${["money", "number", "percent"].includes(f.type) ? "text-right tabular-nums" : ""} text-text-primary`}>
                      <CellValue f={f} v={r.data[f.key]} ctx={ctx} />
                    </td>
                  ))}
                  {computed.map((c) => {
                    const v = compVal(c, r.data);
                    return (
                      <td key={c.key} className={`py-2 pr-3 text-right tabular-nums ${c.format === "money" && v != null && v < 0 ? "text-[#ff5c7a]" : "text-text-primary"}`}>
                        {fmtValue(c.format, v)}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap py-2 text-right">
                    <button type="button" onClick={() => onEdit(r)} className="mr-3 text-xs font-semibold text-[#f5d020] hover:underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => onDelete(r)} className="text-xs text-[#ff5c7a] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {showTotals && (
              <tfoot>
                <tr className="border-t border-white/15 text-xs font-semibold text-text-primary">
                  <td className="py-2 pr-3">Total ({visible.length})</td>
                  {statusField && <td />}
                  {columns.map((f) => (
                    <td key={f.key} className="py-2 pr-3 text-right tabular-nums">
                      {f.type === "money" ? fmtValue("money", visible.reduce((s, r) => s + num(r.data[f.key]), 0)) : ""}
                    </td>
                  ))}
                  {computed.map((c) => (
                    <td key={c.key} className="py-2 pr-3 text-right tabular-nums">
                      {c.format === "money" ? fmtValue("money", visible.reduce((s, r) => s + (compVal(c, r.data) ?? 0), 0)) : ""}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {visible.length === 0 && <p className="py-4 text-center text-sm text-text-muted">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}
