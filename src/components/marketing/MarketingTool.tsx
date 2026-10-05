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

type Tab = "email" | "invites" | "social" | "history";
type Audience = "members" | "invitees";

export type Invitee = {
  id: string;
  email: string;
  name: string | null;
  notes: string | null;
  status: "pending" | "invited" | "joined" | "unsubscribed";
  invite_count: number;
  invited_at: string | null;
  created_at: string;
};

const INVITE_SUBJECT = "You're invited: be one of the first members of Sticky Monkey Finance";
const INVITE_BODY = `We're opening Sticky Monkey Finance to a small group of first members, and we'd like you to be one of them.

Sticky Monkey puts your whole money picture in one place: net worth, investments and options income, side gigs and small businesses, rentals, and a running federal and state tax estimate that updates as you go.

A few things we stand by:
- We will never sell your data.
- No ads, no third-party marketing. Ever.
- You can explore everything with demo data first, before entering anything of your own.

As a founding member, your feedback shapes what gets built next. Every business and gig page has a Feedback button that comes straight to us.

It takes about two minutes to sign up. Pick a handle, answer a short survey, and you're in.

Thanks for being early!`;
type Status = (text: string, isError: boolean) => void;

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const INPUT = "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";
const LABEL = "mb-1 block text-xs text-text-muted";
const CHANNEL_LABEL: Record<string, string> = { email: "Email", x: "X", facebook: "Facebook", tiktok: "TikTok" };

export default function MarketingTool({ onStatus }: { onStatus: Status }) {
  const [tab, setTab] = useState<Tab>("email");
  const [history, setHistory] = useState<Campaign[]>([]);
  const [optedIn, setOptedIn] = useState<number | null>(null);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [composer, setComposer] = useState<{ audience: Audience; ids: string[]; nonce: number }>({ audience: "members", ids: [], nonce: 0 });

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { count }, { data: inv }, { data: members }] = await Promise.all([
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true).eq("is_demo", false),
      supabase.from("marketing_invitees").select("id,email,name,notes,status,invite_count,invited_at,created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("profiles").select("email").not("email", "is", null).limit(5000),
    ]);
    setHistory((data ?? []) as Campaign[]);
    // Anyone on the list who has signed up since shows as Joined (and is skipped when sending).
    const joined = new Set(((members ?? []) as { email: string }[]).map((m) => m.email.toLowerCase()));
    const rows = ((inv ?? []) as Invitee[]).map((r) => (r.status !== "unsubscribed" && joined.has(r.email.toLowerCase()) ? { ...r, status: "joined" as const } : r));
    const newlyJoined = rows.filter((r, i) => r.status === "joined" && (inv as Invitee[])[i].status !== "joined").map((r) => r.id);
    if (newlyJoined.length) await supabase.from("marketing_invitees").update({ status: "joined" }).in("id", newlyJoined);
    setInvitees(rows);
    setOptedIn(count ?? 0); // last, so the composer mounts with the invite list already loaded
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
            ["invites", `Invite list (${invitees.filter((i) => i.status === "pending" || i.status === "invited").length})`],
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
      {tab === "email" && optedIn === null && <div className={`${CARD} text-sm text-text-muted`}>Loading…</div>}
      {tab === "email" && optedIn !== null && (
        <EmailComposer
          key={composer.nonce}
          optedIn={optedIn}
          invitees={invitees}
          // With no opted-in members yet, start on the invite list so the
          // preview (and its "personally invited" footer) matches who gets it.
          initialAudience={composer.nonce === 0 && optedIn === 0 && invitees.some((i) => i.status === "pending" || i.status === "invited") ? "invitees" : composer.audience}
          initialIds={composer.ids}
          sentToday={sentToday}
          onStatus={onStatus}
          onSent={reload}
        />
      )}
      {tab === "invites" && (
        <InviteList
          invitees={invitees}
          onStatus={onStatus}
          onChanged={reload}
          onCompose={(ids) => {
            setComposer((c) => ({ audience: "invitees", ids, nonce: c.nonce + 1 }));
            setTab("email");
          }}
        />
      )}
      {tab === "social" && <SocialComposer onStatus={onStatus} onLaunched={reload} />}
      {tab === "history" && <History rows={history} />}
    </>
  );
}

function EmailComposer({
  optedIn,
  invitees,
  initialAudience,
  initialIds,
  sentToday,
  onStatus,
  onSent,
}: {
  optedIn: number | null;
  invitees: Invitee[];
  initialAudience: Audience;
  initialIds: string[];
  sentToday: number;
  onStatus: Status;
  onSent: () => void;
}) {
  const confirm = useConfirm();
  const [audience, setAudience] = useState<Audience>(initialAudience);
  // Chosen invitees; null = everyone not signed up (also covers the list still loading).
  const [picked, setPicked] = useState<string[] | null>(initialIds.length ? initialIds : null);
  const inviting = audience === "invitees";
  const [subject, setSubject] = useState(inviting ? INVITE_SUBJECT : "");
  const [body, setBody] = useState(inviting ? INVITE_BODY : "");
  const [ctaLabel, setCtaLabel] = useState(inviting ? "Join as a founding member" : "Open Sticky Monkey");
  const [ctaUrl, setCtaUrl] = useState(inviting ? "https://app.stickymonkey.net/sign-up" : "");
  const [busy, setBusy] = useState<"test" | "all" | null>(null);

  const sendable = invitees.filter((i) => i.status === "pending" || i.status === "invited");
  const inviteTargets = picked ? sendable.filter((i) => picked.includes(i.id)) : sendable;
  const isPicked = (id: string) => (picked ? picked.includes(id) : true);
  function togglePick(id: string) {
    const cur = picked ?? sendable.map((i) => i.id);
    setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }
  const count = inviting ? inviteTargets.length : optedIn ?? 0;
  const who = inviting ? `invite${count === 1 ? "" : "s"}` : `member${count === 1 ? "" : "s"}`;

  function switchAudience(a: Audience) {
    setAudience(a);
    setPicked(null);
    if (a === "invitees" && !subject.trim() && !body.trim()) {
      setSubject(INVITE_SUBJECT);
      setBody(INVITE_BODY);
      setCtaLabel("Join as a founding member");
      setCtaUrl("https://app.stickymonkey.net/sign-up");
    }
  }

  // Preview renders exactly what one real recipient gets: their name, the
  // real From line, subject and footer address (from the server settings).
  const [previewId, setPreviewId] = useState<string>("");
  const [cfg, setCfg] = useState<{ from: string | null; postal: string | null; ready: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/admin/marketing/config").catch(() => null);
      const j = res?.ok ? ((await res.json().catch(() => null)) as { from: string | null; postal: string | null; ready: boolean } | null) : null;
      if (!cancelled) setCfg(j);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  const previewPerson = inviting ? inviteTargets.find((i) => i.id === previewId) ?? inviteTargets[0] ?? null : null;
  const preview = renderMarketingEmail({
    subject,
    body: body || "Your message will appear here.",
    ctaLabel: ctaUrl ? ctaLabel : undefined,
    ctaUrl: ctaUrl || undefined,
    name: inviting ? previewPerson?.name ?? null : null,
    unsubscribeUrl: "#",
    postalAddress: cfg?.postal || "(mailing address not set in Vercel yet)",
    audience,
  }).html;

  const ready = subject.trim() && body.trim() && (!ctaUrl || /^https:\/\/\S+$/.test(ctaUrl.trim()));

  async function send(kind: "test" | "all") {
    if (!ready || busy) return;
    if (kind === "all") {
      const ok = await confirm({
        title: inviting ? `Send ${count} invite${count === 1 ? "" : "s"}?` : `Send to ${count} member${count === 1 ? "" : "s"}?`,
        message: inviting
          ? `"${subject.trim()}" goes to ${inviteTargets.length === sendable.length ? "everyone on your invite list who hasn't joined or unsubscribed" : inviteTargets.map((i) => i.name || i.email).join(", ")}. This can't be undone.`
          : `"${subject.trim()}" goes to every member who opted in to email updates. This can't be undone.`,
        confirmLabel: inviting ? "Send invites" : "Send email",
      });
      if (!ok) return;
    }
    setBusy(kind);
    const mode = kind === "test" ? "test" : inviting ? "invitees" : "all";
    const res = await fetch("/api/admin/marketing/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, ctaLabel, ctaUrl: ctaUrl.trim(), mode, testAudience: audience, inviteeIds: inviting ? inviteTargets.map((i) => i.id) : undefined }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { sent?: number; failed?: number; error?: string } | null;
    setBusy(null);
    if (!res?.ok) {
      onStatus(j?.error || "Couldn't send.", true);
      return;
    }
    const n = j?.sent ?? 0;
    onStatus(
      kind === "test" ? "Test sent to your email." : `Sent ${n} ${inviting ? `invite${n === 1 ? "" : "s"}` : `email${n === 1 ? "" : "s"}`}${j?.failed ? ` (${j.failed} failed)` : ""}.`,
      !!j?.failed
    );
    onSent();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className={CARD}>
        <label className={LABEL}>Send to</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["members", `Opted-in members (${optedIn ?? "…"})`],
              ["invitees", `Invite list, not signed up (${sendable.length})`],
            ] as [Audience, string][]
          ).map(([a, label]) => (
            <button
              key={a}
              type="button"
              onClick={() => switchAudience(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${audience === a ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {inviting && (
          <div className="mb-4 rounded-xl bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-text-muted">
                {inviteTargets.length} of {sendable.length} selected
              </span>
              <span className="flex gap-3">
                <button type="button" onClick={() => setPicked(null)} className="text-[#4f8cff] hover:underline">
                  All
                </button>
                <button type="button" onClick={() => setPicked([])} className="text-[#4f8cff] hover:underline">
                  None
                </button>
              </span>
            </div>
            {sendable.length === 0 ? (
              <p className="text-xs text-text-muted">No one to invite. Add people in the Invite list tab.</p>
            ) : (
              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1">
                {sendable.map((i) => (
                  <label key={i.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={isPicked(i.id)} onChange={() => togglePick(i.id)} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {i.name || i.email}
                      {i.name && <span className="text-text-muted"> · {i.email}</span>}
                    </span>
                    {i.status === "invited" && <span className="shrink-0 text-[11px] text-[#4f8cff]">invited{i.invite_count > 1 ? ` ${i.invite_count}x` : ""}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
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
            disabled={!ready || !!busy || !count}
            onClick={() => send("all")}
            className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
          >
            {busy === "all" ? "Sending…" : inviting ? `Send ${count} ${who}` : `Send to ${count} ${who}`}
          </button>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          {inviting
            ? "Only invite people you know who'd want this (no bought or scraped lists). Anyone who has already joined or unsubscribed is skipped automatically."
            : "Only members who turned on Email Updates in their profile receive this."}{" "}
          Every email includes an unsubscribe link and your mailing address.
        </p>
      </div>
      <div className={CARD}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Preview</div>
          {inviting && inviteTargets.length > 1 && (
            <select
              aria-label="Preview as"
              value={previewPerson?.id ?? ""}
              onChange={(e) => setPreviewId(e.target.value)}
              className="rounded border border-card-border bg-[#0f131c] px-2 py-1 text-xs text-text-primary outline-none"
            >
              {inviteTargets.map((i) => (
                <option key={i.id} value={i.id}>
                  Preview as {i.name || i.email}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mb-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed">
          <div>
            <span className="text-text-muted">From: </span>
            <span className="text-text-primary">{cfg?.from || "(sender not set in Vercel yet)"}</span>
          </div>
          <div>
            <span className="text-text-muted">To: </span>
            <span className="text-text-primary">
              {inviting ? (previewPerson ? previewPerson.email : "(no one selected)") : `each opted-in member (${optedIn ?? 0})`}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Subject: </span>
            <span className="font-semibold text-text-primary">{subject || "(no subject)"}</span>
          </div>
        </div>
        <iframe title="Email preview" srcDoc={preview} className="h-[560px] w-full rounded-lg border border-white/10 bg-[#0f131c]" sandbox="" />
        {!inviting && <p className="mt-2 text-xs text-text-muted">Each member sees their own first name in the greeting.</p>}
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

// People you want to invite who haven't signed up yet. Add one at a time or
// paste a list; anyone who later signs up with that email shows as Joined.
const INVITE_STATUS_STYLE: Record<Invitee["status"], string> = {
  pending: "text-text-muted",
  invited: "text-[#4f8cff]",
  joined: "text-[#3ddc97]",
  unsubscribed: "text-[#ff5c7a]",
};
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// "Jane Doe <jane@x.com>", "jane@x.com, Jane Doe", "Jane Doe, jane@x.com" or just an email; one per line.
function parseInviteLines(text: string): { email: string; name: string | null }[] {
  const out = new Map<string, { email: string; name: string | null }>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(EMAIL_RE);
    if (!m) continue;
    const email = m[0].toLowerCase();
    const name = line.replace(m[0], "").replace(/[<>",;\t]/g, " ").replace(/\s+/g, " ").trim() || null;
    if (!out.has(email)) out.set(email, { email, name });
  }
  return [...out.values()];
}

function InviteList({
  invitees,
  onStatus,
  onChanged,
  onCompose,
}: {
  invitees: Invitee[];
  onStatus: Status;
  onChanged: () => void;
  onCompose: (ids: string[]) => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"" | Invitee["status"]>("");

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invitees) m[i.status] = (m[i.status] ?? 0) + 1;
    return m;
  }, [invitees]);
  const visible = filter ? invitees.filter((i) => i.status === filter) : invitees;
  const selectable = (i: Invitee) => i.status === "pending" || i.status === "invited";

  async function add(rows: { email: string; name: string | null }[]) {
    if (!rows.length || busy) return;
    setBusy(true);
    const existing = new Set(invitees.map((i) => i.email.toLowerCase()));
    const fresh = rows.filter((r) => !existing.has(r.email));
    if (fresh.length) {
      const { error } = await createClient().from("marketing_invitees").insert(fresh.map((r) => ({ email: r.email, name: r.name })));
      setBusy(false);
      if (error) {
        onStatus(`Couldn't add: ${error.message}`, true);
        return;
      }
    } else setBusy(false);
    const skipped = rows.length - fresh.length;
    onStatus(`Added ${fresh.length}${skipped ? `, ${skipped} already on the list` : ""}.`, false);
    setName("");
    setEmail("");
    setBulk("");
    setShowBulk(false);
    onChanged();
  }

  async function remove(i: Invitee) {
    if (!(await confirm({ message: `Remove ${i.email} from the invite list?`, danger: true }))) return;
    const { error } = await createClient().from("marketing_invitees").delete().eq("id", i.id);
    if (error) onStatus("Couldn't remove that person.", true);
    else onChanged();
  }

  const parsed = useMemo(() => parseInviteLines(bulk), [bulk]);
  const emailOk = EMAIL_RE.test(email.trim());

  return (
    <div className={CARD}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className={LABEL}>Name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="min-w-[200px] flex-[1.4]">
          <label className={LABEL}>Email</label>
          <input
            className={INPUT}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailOk) add([{ email: email.trim().toLowerCase(), name: name.trim() || null }]);
            }}
            placeholder="jane@example.com"
          />
        </div>
        <button
          type="button"
          disabled={!emailOk || busy}
          onClick={() => add([{ email: email.trim().toLowerCase(), name: name.trim() || null }])}
          className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
        >
          Add
        </button>
        <button type="button" onClick={() => setShowBulk((v) => !v)} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-text-primary">
          {showBulk ? "Hide paste" : "Paste a list"}
        </button>
      </div>

      {showBulk && (
        <div className="mb-4 rounded-xl bg-white/5 p-3">
          <label className={LABEL}>One person per line: &quot;Jane Doe &lt;jane@example.com&gt;&quot;, &quot;jane@example.com, Jane Doe&quot; or just the email. Works with a column pasted from a spreadsheet or contacts export.</label>
          <textarea className={`${INPUT} min-h-[120px] font-mono text-xs`} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" disabled={!parsed.length || busy} onClick={() => add(parsed)} className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40">
              Add {parsed.length || ""}
            </button>
            <span className="text-xs text-text-muted">{parsed.length} email{parsed.length === 1 ? "" : "s"} found</span>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["", "pending", "invited", "joined", "unsubscribed"] as const).map((f) => (
            <button
              key={f || "all"}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs capitalize ${filter === f ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
            >
              {f || "All"} {f ? counts[f] ?? 0 : invitees.length}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!invitees.some(selectable)}
          onClick={() => onCompose([...selected].filter((id) => invitees.some((i) => i.id === id && selectable(i))))}
          className="rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
        >
          {selected.size ? `Write invite to ${selected.size} selected` : "Write invite to everyone not signed up"}
        </button>
      </div>

      {invitees.length === 0 ? (
        <p className="rounded-xl bg-white/5 p-6 text-center text-sm text-text-muted">No one on your invite list yet. Add the people you want as your first members.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last invited</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className="border-t border-white/5">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${i.email}`}
                      disabled={!selectable(i)}
                      checked={selected.has(i.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(i.id);
                          else n.delete(i.id);
                          return n;
                        })
                      }
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="py-2 pr-3 text-text-primary">{i.name || <span className="text-text-muted">—</span>}</td>
                  <td className="py-2 pr-3 text-text-primary">{i.email}</td>
                  <td className={`py-2 pr-3 capitalize ${INVITE_STATUS_STYLE[i.status]}`}>
                    {i.status}
                    {i.invite_count > 1 ? ` (${i.invite_count}x)` : ""}
                  </td>
                  <td className="py-2 pr-3 text-text-muted">{i.invited_at ? new Date(i.invited_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => remove(i)} className="text-xs text-[#ff5c7a] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">
        Invite only people you know. Joined and unsubscribed people are never emailed. Statuses update when someone signs up with the same email.
      </p>
    </div>
  );
}
