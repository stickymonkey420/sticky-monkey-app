"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteFeedback, fetchFeedback, updateFeedback, type TriagePatch } from "@/lib/feedback/queries";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  IMPACT_LABELS,
  KIND_BADGE,
  KIND_LABELS,
  OPEN_FEEDBACK,
  STATUS_BADGE,
  STATUS_LABELS,
  feedbackScore,
  type BusinessFeedback,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback/types";

type Person = { id: string; name: string | null; email: string | null };
type SortKey = "score" | "newest" | "oldest";

const SMALL = "rounded-md border border-card-border bg-[#0d0f17] px-2 py-1.5 text-xs text-text-primary outline-none";
const URGENCY_SHORT = { low: "Low", medium: "Med", high: "High", critical: "Critical" } as const;
const URGENCY_COLOR = { low: "text-text-muted", medium: "text-text-primary", high: "text-[#ffb36b]", critical: "text-[#ff5c7a]" } as const;

// App Director triage view (Users & Groups → Feedback). RLS returns every
// row only to app_director.
export default function FeedbackAdmin({ people, onStatus }: { people: Person[]; onStatus: (text: string, isError: boolean) => void }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<BusinessFeedback[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all" | FeedbackStatus>("open");
  const [kindFilter, setKindFilter] = useState<"all" | FeedbackKind>("all");
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeedback(createClient()).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const who = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const categories = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.category_name).filter(Boolean) as string[])).sort(), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (statusFilter === "open" ? !OPEN_FEEDBACK.includes(r.status) : statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (catFilter !== "all" && r.category_name !== catFilter) return false;
      if (q) {
        const p = who.get(r.user_id);
        const hay = [r.title, r.details, r.area, r.business_name, r.category_name, p?.name, p?.email, r.tags.join(" ")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) =>
      sort === "score"
        ? feedbackScore(b) - feedbackScore(a) || b.created_at.localeCompare(a.created_at)
        : sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : a.created_at.localeCompare(b.created_at)
    );
  }, [rows, statusFilter, kindFilter, catFilter, search, sort, who]);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return {
      newCount: all.filter((r) => r.status === "new").length,
      open: all.filter((r) => OPEN_FEEDBACK.includes(r.status)).length,
      openBugs: all.filter((r) => r.kind === "bug" && OPEN_FEEDBACK.includes(r.status)).length,
      doneMonth: all.filter((r) => r.status === "done" && r.resolved_at && new Date(r.resolved_at) >= monthStart).length,
    };
  }, [rows]);

  async function patch(id: string, p: TriagePatch, quiet = false) {
    const { data, error } = await updateFeedback(createClient(), id, p);
    if (error || !data) return onStatus(`Could not save: ${error ?? "unknown error"}`, true);
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? data : r)));
    if (!quiet) onStatus("Feedback updated.", false);
  }

  async function remove(f: BusinessFeedback) {
    if (!(await confirm({ message: `Delete "${f.title}"? This can't be undone.`, danger: true }))) return;
    const { error } = await deleteFeedback(createClient(), f.id);
    if (error) return onStatus(`Could not delete: ${error}`, true);
    setRows((rs) => (rs ?? []).filter((r) => r.id !== f.id));
    setOpenId(null);
    onStatus("Feedback deleted.", false);
  }

  function exportCsv() {
    const head = ["Created", "Score", "Type", "Status", "Weight", "Urgency", "Reach", "Business", "Category", "Area", "Title", "Details", "Steps", "From", "Email", "Tags", "Reply", "Notes"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = visible.map((r) => {
      const p = who.get(r.user_id);
      return [
        r.created_at.slice(0, 10),
        feedbackScore(r),
        KIND_LABELS[r.kind],
        STATUS_LABELS[r.status],
        r.priority_weight ?? "",
        r.user_urgency,
        IMPACT_LABELS[r.user_impact],
        r.business_name,
        r.category_name,
        r.area,
        r.title,
        r.details,
        r.steps_to_reproduce,
        p?.name,
        p?.email,
        r.tags.join("; "),
        r.response,
        r.director_notes,
      ]
        .map(esc)
        .join(",");
    });
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (rows === null) return <div className="text-sm text-text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["New", stats.newCount, "#f5d020"],
          ["Open", stats.open, "#7aa8ff"],
          ["Open bugs", stats.openBugs, "#ff8aa0"],
          ["Done this month", stats.doneMonth, "#3ddc97"],
        ].map(([label, n, color]) => (
          <div key={label as string} className="rounded-xl bg-white/5 p-3.5">
            <div className="mb-1 text-xs text-text-muted">{label}</div>
            <div className="text-lg font-semibold" style={{ color: color as string }}>
              {n}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={SMALL}>
          <option value="open">Open (not done)</option>
          <option value="all">All statuses</option>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} className={SMALL}>
          <option value="all">All types</option>
          {FEEDBACK_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select aria-label="Business type" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className={SMALL}>
          <option value="all">All businesses / gigs</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={SMALL}>
          <option value="score">Sort: priority score</option>
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
        </select>
        <input placeholder="Search title, user, tag…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${SMALL} min-w-[180px] flex-1`} />
        <button type="button" onClick={exportCsv} disabled={!visible.length} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">{rows.length ? "Nothing matches these filters." : "No feedback yet."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-3" title="Weight × urgency × reach (bugs ×1.25)">
                  Score
                </th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Request</th>
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">Urgency</th>
                <th className="py-2 pr-3">Weight</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.map((f) => {
                const p = who.get(f.user_id);
                const isOpen = openId === f.id;
                return (
                  <Fragment key={f.id}>
                    <tr className="cursor-pointer align-top hover:bg-white/[0.03]" onClick={() => setOpenId(isOpen ? null : f.id)}>
                      <td className="py-2.5 pr-3 font-semibold text-text-primary">{feedbackScore(f)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_BADGE[f.kind]}`}>{KIND_LABELS[f.kind]}</span>
                      </td>
                      <td className="max-w-[280px] py-2.5 pr-3">
                        <div className="truncate text-text-primary">{f.title}</div>
                        <div className="flex flex-wrap gap-1 text-xs text-text-muted">
                          {f.area && <span>{f.area}</span>}
                          {f.tags.map((t) => (
                            <span key={t} className="rounded bg-white/10 px-1.5 text-[11px] text-text-primary">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        <div className="text-text-primary">{f.business_name ?? "—"}</div>
                        <div className="text-text-muted">{f.category_name}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        <div className="text-text-primary">{p?.name || "—"}</div>
                        <div className="text-text-muted">{p?.email}</div>
                      </td>
                      <td className={`whitespace-nowrap py-2.5 pr-3 text-xs ${URGENCY_COLOR[f.user_urgency]}`}>
                        {URGENCY_SHORT[f.user_urgency]}
                        <div className="text-text-muted">{IMPACT_LABELS[f.user_impact]}</div>
                      </td>
                      <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label="Priority weight"
                          value={f.priority_weight ?? ""}
                          onChange={(e) => patch(f.id, { priority_weight: e.target.value ? Number(e.target.value) : null }, true)}
                          className={SMALL}
                        >
                          <option value="">–</option>
                          {[1, 2, 3, 4, 5].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label="Status"
                          value={f.status}
                          onChange={(e) => patch(f.id, { status: e.target.value as FeedbackStatus }, true)}
                          className={`${SMALL} ${STATUS_BADGE[f.status]}`}
                        >
                          {FEEDBACK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right text-xs text-text-muted">{age(f.created_at)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="bg-white/[0.02] px-3 pb-4 pt-1">
                          <FeedbackDetail f={f} onSave={(p) => patch(f.id, p)} onDelete={() => remove(f)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-text-muted">
        Score = your weight (1–5, counts as 3 until set) × their urgency × reach; bugs get a 25% bump. Click a row for details, tags and a reply the
        user will see.
      </p>
    </div>
  );
}

function FeedbackDetail({ f, onSave, onDelete }: { f: BusinessFeedback; onSave: (p: TriagePatch) => void; onDelete: () => void }) {
  const [tags, setTags] = useState(f.tags.join(", "));
  const [response, setResponse] = useState(f.response ?? "");
  const [notes, setNotes] = useState(f.director_notes ?? "");
  const field = "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";

  function save() {
    const t = Array.from(new Set(tags.split(",").map((s) => s.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))).slice(0, 12);
    onSave({ tags: t, response: response.trim() || null, director_notes: notes.trim() || null });
  }

  return (
    <div className="grid gap-4 text-sm md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="text-base font-semibold text-text-primary">{f.title}</div>
        <div className="whitespace-pre-wrap text-text-primary">{f.details || <span className="text-text-muted">No details given.</span>}</div>
        {f.steps_to_reproduce && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Steps to reproduce</div>
            <div className="whitespace-pre-wrap text-text-primary">{f.steps_to_reproduce}</div>
          </div>
        )}
        <div className="text-xs text-text-muted">
          Sent {new Date(f.created_at).toLocaleString()}
          {f.page_path ? ` · from ${f.page_path}` : ""}
          {f.resolved_at ? ` · closed ${new Date(f.resolved_at).toLocaleDateString()}` : ""}
        </div>
        {f.user_agent && <div className="truncate text-[11px] text-text-muted" title={f.user_agent}>{f.user_agent}</div>}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-xs text-text-muted">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="invoices, mobile, quick-win" className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-text-muted">
          Reply to user (they see this under My requests)
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={3} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-text-muted">
          Internal notes (only you)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} mt-1`} />
        </label>
        <div className="flex justify-between gap-2">
          <button type="button" onClick={onDelete} className="text-xs text-[#ff5c7a] hover:underline">
            Delete
          </button>
          <button type="button" onClick={save} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#4f8cff" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function age(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
