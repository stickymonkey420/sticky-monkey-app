"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { renderMarketingEmail } from "@/lib/marketing/email";
import {
  PLATFORMS,
  composePost,
  isValidUrl,
  launchUrl,
  postLength,
  type Campaign,
  type SocialPlatform,
} from "@/lib/marketing/platforms";

type Tab = "email" | "social" | "history";
type Status = (text: string, isError: boolean) => void;

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const INPUT = "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";
const LABEL = "mb-1 block text-xs text-text-muted";
const CHANNEL_LABEL: Record<string, string> = { email: "Email", x: "X", facebook: "Facebook", tiktok: "TikTok" };

export default function MarketingTool({ onStatus }: { onStatus: Status }) {
  const [tab, setTab] = useState<Tab>("email");
  const [history, setHistory] = useState<Campaign[]>([]);
  const [optedIn, setOptedIn] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { count }] = await Promise.all([
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true).eq("is_demo", false),
    ]);
    setHistory((data ?? []) as Campaign[]);
    setOptedIn(count ?? 0);
  }, []);

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

  const today = new Date().toISOString().slice(0, 10);
  const sentToday = history
    .filter((c) => c.channel === "email" && c.status === "sent" && (c.sent_at ?? "").slice(0, 10) === today)
    .reduce((s, c) => s + c.recipients, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["email", "Email"],
            ["social", "Social posts"],
            ["history", `History (${history.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-[#f5d020] text-[#0f131c]" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "email" && <EmailComposer optedIn={optedIn} sentToday={sentToday} onStatus={onStatus} onSent={reload} />}
      {tab === "social" && <SocialComposer onStatus={onStatus} onLaunched={reload} />}
      {tab === "history" && <History rows={history} />}
    </>
  );
}

function EmailComposer({ optedIn, sentToday, onStatus, onSent }: { optedIn: number | null; sentToday: number; onStatus: Status; onSent: () => void }) {
  const confirm = useConfirm();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Open Sticky Monkey");
  const [ctaUrl, setCtaUrl] = useState("");
  const [busy, setBusy] = useState<"test" | "all" | null>(null);

  const preview = useMemo(
    () =>
      renderMarketingEmail({
        subject,
        body: body || "Your message will appear here.",
        ctaLabel: ctaUrl ? ctaLabel : undefined,
        ctaUrl: ctaUrl || undefined,
        name: "Alex Member",
        unsubscribeUrl: "#",
        postalAddress: "Your mailing address",
      }).html,
    [subject, body, ctaLabel, ctaUrl]
  );

  const ready = subject.trim() && body.trim() && (!ctaUrl || /^https:\/\/\S+$/.test(ctaUrl.trim()));

  async function send(mode: "test" | "all") {
    if (!ready || busy) return;
    if (mode === "all") {
      const ok = await confirm({
        title: `Send to ${optedIn ?? 0} member${optedIn === 1 ? "" : "s"}?`,
        message: `"${subject.trim()}" goes to every member who opted in to email updates. This can't be undone.`,
        confirmLabel: "Send email",
      });
      if (!ok) return;
    }
    setBusy(mode);
    const res = await fetch("/api/admin/marketing/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, ctaLabel, ctaUrl: ctaUrl.trim(), mode }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { sent?: number; failed?: number; error?: string } | null;
    setBusy(null);
    if (!res?.ok) {
      onStatus(j?.error || "Couldn't send.", true);
      return;
    }
    onStatus(mode === "test" ? "Test sent to your email." : `Sent to ${j?.sent ?? 0} member${j?.sent === 1 ? "" : "s"}${j?.failed ? ` (${j.failed} failed)` : ""}.`, !!j?.failed);
    onSent();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div>
            <div className="text-xs text-text-muted">Opted-in members</div>
            <div className="text-lg font-semibold text-text-primary">{optedIn ?? "…"}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Sent today</div>
            <div className="text-lg font-semibold text-text-primary">{sentToday} / 100</div>
          </div>
        </div>
        <label className={LABEL}>Subject</label>
        <input className={`${INPUT} mb-3`} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="New in Sticky Monkey: tax estimates" />
        <label className={LABEL}>Message (blank line = new paragraph)</label>
        <textarea className={`${INPUT} mb-3 min-h-[200px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1.5fr]">
          <div>
            <label className={LABEL}>Button text</label>
            <input className={INPUT} value={ctaLabel} maxLength={40} onChange={(e) => setCtaLabel(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Button link (optional, https://)</label>
            <input className={INPUT} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!ready || !!busy} onClick={() => send("test")} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-text-primary disabled:opacity-40">
            {busy === "test" ? "Sending…" : "Send test to me"}
          </button>
          <button
            type="button"
            disabled={!ready || !!busy || !optedIn}
            onClick={() => send("all")}
            className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
          >
            {busy === "all" ? "Sending…" : `Send to ${optedIn ?? 0} member${optedIn === 1 ? "" : "s"}`}
          </button>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Only members who turned on Email Updates in their profile receive this. Every email includes an unsubscribe link and your mailing address.
        </p>
      </div>
      <div className={CARD}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Preview</div>
        <iframe title="Email preview" srcDoc={preview} className="h-[560px] w-full rounded-lg border border-white/10 bg-[#0f131c]" sandbox="" />
      </div>
    </div>
  );
}

function SocialComposer({ onStatus, onLaunched }: { onStatus: Status; onLaunched: () => void }) {
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("StickyMonkey, investing");
  const linkOk = isValidUrl(link);

  async function launch(p: SocialPlatform) {
    const text = composePost(p, message, link, tags);
    if (p !== "x") {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        onStatus("Couldn't copy automatically. Copy the text from the preview.", true);
      }
    }
    window.open(launchUrl(p, message, link, tags), "_blank", "noopener,noreferrer");
    onStatus(p === "x" ? "Opened X with your post." : `Text copied. Paste it in ${p === "facebook" ? "Facebook" : "TikTok"}.`, false);
    await createClient().from("marketing_campaigns").insert({ channel: p, body: text, link: link.trim() || null, status: "launched" });
    onLaunched();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <div className={CARD}>
        <label className={LABEL}>Message</label>
        <textarea className={`${INPUT} mb-3 min-h-[160px]`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's new at Sticky Monkey?" />
        <label className={LABEL}>Link (optional)</label>
        <input className={`${INPUT} mb-1`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        {!linkOk && <div className="mb-2 text-xs text-[#ff5c7a]">Enter a full link starting with https://</div>}
        <label className={`${LABEL} mt-2`}>Hashtags (comma or space separated)</label>
        <input className={INPUT} value={tags} onChange={(e) => setTags(e.target.value)} />
        <p className="mt-3 text-xs text-text-muted">
          Write once. Each platform gets its own version with a character check. Launch opens the platform signed in as you; nothing posts without your final click there.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {PLATFORMS.map((p) => {
          const len = postLength(p.key, message, link, tags);
          const over = len > p.limit;
          const text = composePost(p.key, message, link, tags);
          return (
            <div key={p.key} className={CARD}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold" style={{ color: p.color }}>
                  {p.label}
                </div>
                <div className={`text-xs ${over ? "font-semibold text-[#ff5c7a]" : "text-text-muted"}`}>
                  {len.toLocaleString()} / {p.limit.toLocaleString()}
                </div>
              </div>
              <div className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-sm text-text-primary">
                {text || <span className="text-text-muted">Your post preview</span>}
                {p.key === "x" && link.trim() && <span className="text-[#4f8cff]">{"\n" + link.trim()}</span>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-text-muted">{p.how}</span>
                <button
                  type="button"
                  disabled={!message.trim() || over || !linkOk}
                  onClick={() => launch(p.key)}
                  className="shrink-0 rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
                >
                  Launch {p.key === "x" ? "on X" : p.key === "facebook" ? "on Facebook" : "on TikTok"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function History({ rows }: { rows: Campaign[] }) {
  if (!rows.length) return <div className={`${CARD} text-sm text-text-muted`}>Nothing sent or launched yet.</div>;
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Channel</th>
            <th className="py-2 pr-3">Content</th>
            <th className="py-2 pr-3 text-right">Recipients</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-white/5 align-top">
              <td className="whitespace-nowrap py-2 pr-3 text-text-muted">{new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="py-2 pr-3 text-text-primary">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
              <td className="max-w-[420px] py-2 pr-3 text-text-primary">
                <div className="truncate">{r.subject || r.body.split("\n")[0]}</div>
                {r.error && <div className="truncate text-xs text-[#ff5c7a]">{r.error}</div>}
              </td>
              <td className="py-2 pr-3 text-right text-text-primary">{r.channel === "email" ? r.recipients : "–"}</td>
              <td className={`py-2 ${r.status === "failed" ? "text-[#ff5c7a]" : r.status === "sent" ? "text-[#3ddc97]" : "text-[#f5d020]"}`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
