"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteFeedback, fetchFeedback, submitFeedback } from "@/lib/feedback/queries";
import {
  FEEDBACK_AREAS,
  FEEDBACK_KINDS,
  IMPACTS,
  IMPACT_LABELS,
  KIND_BADGE,
  KIND_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  type BusinessFeedback,
  type FeedbackKind,
  type Impact,
  type Urgency,
} from "@/lib/feedback/types";

const FIELD =
  "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";
const LABEL = "mb-1.5 block text-xs text-text-muted";

// "Feedback" button shown on each business / gig. Opens a popup (closes by
// button only — repo rule) with a submit form plus the user's own past
// requests for this business, their status, and the director's reply.
export default function FeedbackButton({
  userId,
  businessId,
  businessName,
  categoryName,
}: {
  userId: string;
  businessId: string;
  businessName: string;
  categoryName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-text-primary hover:bg-white/5"
      >
        💬 Feedback / request
      </button>
      {open && (
        <FeedbackModal
          userId={userId}
          businessId={businessId}
          businessName={businessName}
          categoryName={categoryName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FeedbackModal({
  userId,
  businessId,
  businessName,
  categoryName,
  onClose,
}: {
  userId: string;
  businessId: string;
  businessName: string;
  categoryName: string;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [area, setArea] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [impact, setImpact] = useState<Impact>("me");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<BusinessFeedback[] | null>(null);

  async function loadMine() {
    setMine(await fetchFeedback(createClient(), { businessId, mineOnly: userId }));
  }

  function showMine() {
    setTab("mine");
    if (mine === null) loadMine();
  }

  async function submit() {
    if (busy) return;
    if (title.trim().length < 3) return setErr("Give it a short title (3+ characters).");
    setBusy(true);
    setErr(null);
    const { error } = await submitFeedback(createClient(), userId, {
      business_id: businessId,
      business_name: businessName,
      category_name: categoryName,
      kind,
      area: area || null,
      title: title.trim(),
      details: details.trim() || null,
      steps_to_reproduce: kind === "bug" ? steps.trim() || null : null,
      user_urgency: urgency,
      user_impact: impact,
    });
    setBusy(false);
    if (error) return setErr("Could not send that. Please try again.");
    setTitle("");
    setDetails("");
    setSteps("");
    setSent(true);
    setMine(null);
  }

  async function remove(f: BusinessFeedback) {
    if (!(await confirm({ message: `Withdraw "${f.title}"?`, danger: true }))) return;
    const { error } = await deleteFeedback(createClient(), f.id);
    if (error) return setErr("Could not withdraw that one.");
    setMine((rows) => (rows ?? []).filter((r) => r.id !== f.id));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-text-primary">Feedback &amp; requests</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>
        <p className="mb-4 text-xs text-text-muted">
          {businessName} · {categoryName}. Tell us what&apos;s broken or what would make this work better for you.
        </p>

        <div className="mb-4 flex gap-1 rounded-full bg-white/5 p-1 text-xs">
          {(
            [
              ["new", "New request"],
              ["mine", "My requests"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => (k === "mine" ? showMine() : setTab("new"))}
              className={`flex-1 rounded-full px-3 py-1.5 font-semibold ${tab === k ? "bg-[#4f8cff] text-white" : "text-text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "new" ? (
          sent ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-[#3ddc97]/10 p-4 text-sm text-[#3ddc97]">Thanks! Your request was sent to the team.</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSent(false)} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-text-primary">
                  Send another
                </button>
                <button type="button" onClick={showMine} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-text-primary">
                  View my requests
                </button>
                <button type="button" onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#4f8cff" }}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <span className={LABEL}>Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {FEEDBACK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === k ? KIND_BADGE[k] + " ring-1 ring-current" : "bg-white/5 text-text-muted"}`}
                    >
                      {KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className={LABEL}>
                  Part of the app
                  <select value={area} onChange={(e) => setArea(e.target.value)} className={`${FIELD} mt-1.5`}>
                    <option value="">Not sure / general</option>
                    {FEEDBACK_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL}>
                  How urgent?
                  <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} className={`${FIELD} mt-1.5`}>
                    {URGENCIES.map((u) => (
                      <option key={u} value={u}>
                        {URGENCY_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={LABEL}>
                Title
                <input
                  value={title}
                  maxLength={140}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={kind === "bug" ? "e.g. Invoice PDF cuts off the last line" : "e.g. Add recurring weekly classes"}
                  className={`${FIELD} mt-1.5`}
                />
              </label>
              <label className={LABEL}>
                Details
                <textarea
                  value={details}
                  maxLength={5000}
                  rows={4}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What do you want to happen, and why would it help?"
                  className={`${FIELD} mt-1.5`}
                />
              </label>
              {kind === "bug" && (
                <label className={LABEL}>
                  Steps to reproduce
                  <textarea
                    value={steps}
                    maxLength={3000}
                    rows={3}
                    onChange={(e) => setSteps(e.target.value)}
                    placeholder={"1. Open…\n2. Click…\n3. Expected … but saw …"}
                    className={`${FIELD} mt-1.5`}
                  />
                </label>
              )}
              <div>
                <span className={LABEL}>Who does this affect?</span>
                <div className="flex flex-wrap gap-3 text-sm text-text-primary">
                  {IMPACTS.map((i) => (
                    <label key={i} className="flex items-center gap-1.5">
                      <input type="radio" name="impact" checked={impact === i} onChange={() => setImpact(i)} />
                      {IMPACT_LABELS[i]}
                    </label>
                  ))}
                </div>
              </div>
              {err && <div className="text-xs text-[#e05656]">{err}</div>}
              <div className="mt-2 flex justify-between gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-text-primary">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || title.trim().length < 3}
                  onClick={submit}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#4f8cff" }}
                >
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {mine === null ? (
              <div className="text-sm text-text-muted">Loading…</div>
            ) : mine.length === 0 ? (
              <div className="text-sm text-text-muted">No requests for this business yet.</div>
            ) : (
              mine.map((f) => (
                <div key={f.id} className="rounded-xl bg-white/5 p-3 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${KIND_BADGE[f.kind]}`}>{KIND_LABELS[f.kind]}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_BADGE[f.status]}`}>{STATUS_LABELS[f.status]}</span>
                    <span className="text-text-muted">{new Date(f.created_at).toLocaleDateString()}</span>
                    {f.status === "new" && (
                      <button type="button" onClick={() => remove(f)} className="ml-auto text-[#ff5c7a] hover:underline">
                        Withdraw
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-text-primary">{f.title}</div>
                  {f.response && (
                    <div className="mt-2 rounded-lg bg-[#4f8cff]/10 p-2 text-text-primary">
                      <span className="font-semibold text-[#7aa8ff]">Reply: </span>
                      {f.response}
                    </div>
                  )}
                </div>
              ))
            )}
            {err && <div className="text-xs text-[#e05656]">{err}</div>}
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-text-primary">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
