"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteLeague, updateLeague } from "@/lib/gameAfi/leagueQueries";
import type { LeagueMember, LeagueSummary } from "@/lib/gameAfi/leagueTypes";

const FIELD = "w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";

// Commissioner-only edit/delete. Popup closes by button only (repo rule).
// Roster size and members lock once the first pick is made (server enforces
// the same rule in game_afi_league_update).
export default function LeagueEditModal({
  league,
  members,
  onClose,
  onSaved,
  onDeleted,
}: {
  league: LeagueSummary;
  members: LeagueMember[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const confirm = useConfirm();
  const locked = league.pickCount > 0;
  const originalHandles = [...members]
    .sort((a, b) => a.seed - b.seed)
    .map((m) => m.username ?? "")
    .filter(Boolean)
    .join("\n");
  const [name, setName] = useState(league.name);
  const [rosterSize, setRosterSize] = useState(String(league.rosterSize));
  const [handlesText, setHandlesText] = useState(originalHandles);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setErr("Give the league a name.");
    const handles = handlesText
      .split(/[\n,]/)
      .map((h) => h.trim().replace(/^@/, ""))
      .filter(Boolean);
    const membersChanged = !locked && handles.join("\n") !== originalHandles;
    if (membersChanged && handles.length < 2) return setErr("List at least 2 member handles.");
    setBusy(true);
    setErr(null);
    const res = await updateLeague(createClient(), league.id, {
      name: name.trim(),
      rosterSize: locked ? league.rosterSize : Number(rosterSize) || league.rosterSize,
      handles: membersChanged ? handles : null,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    onSaved();
  }

  async function remove() {
    const ok = await confirm({
      message: `Delete "${league.name}"? All members, ${league.pickCount} pick${league.pickCount === 1 ? "" : "s"} and standings history go with it. This can't be undone.`,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteLeague(createClient(), league.id);
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-text-primary">Edit League</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>

        <label className="mb-3 block text-xs text-text-muted">
          League name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${FIELD} mt-1.5`} />
        </label>

        <label className="mb-3 block text-xs text-text-muted">
          Roster size (4–20)
          <input
            type="number"
            min="4"
            max="20"
            disabled={locked}
            value={rosterSize}
            onChange={(e) => setRosterSize(e.target.value)}
            className={`${FIELD} mt-1.5 disabled:opacity-50`}
          />
        </label>

        <label className="mb-1 block text-xs text-text-muted">
          Members — handles, one per line, in draft order
          <textarea
            rows={6}
            disabled={locked}
            value={handlesText}
            onChange={(e) => setHandlesText(e.target.value)}
            className={`${FIELD} mt-1.5 disabled:opacity-50`}
          />
        </label>
        <p className="mb-4 text-xs text-text-muted">
          {locked
            ? `Roster size and members are locked — ${league.pickCount} pick${league.pickCount === 1 ? " has" : "s have"} been made. Undo picks to change them.`
            : "Changing members re-seeds the draft order and restarts at Round 1, Pick #1."}
        </p>

        {err && <div className="mb-3 text-xs text-[#ff5c7a]">{err}</div>}

        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={busy} onClick={remove} className="text-sm font-semibold text-[#ff5c7a] hover:underline disabled:opacity-50">
            Delete league
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-text-primary">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-xl bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
