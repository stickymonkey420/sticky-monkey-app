"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createLeague } from "@/lib/gameAfi/leagueQueries";

// Commissioner-only: create a new draft league. Handles are typed one per
// line (same idea as a fantasy-football commissioner inviting a roster),
// resolved server-side against profiles.username by
// game_afi_league_create -- the order typed here becomes the snake draft's
// seed order (1st line = seed 1, picks first in odd rounds).
export default function LeagueSetupForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [rosterSize, setRosterSize] = useState("12");
  const [handlesText, setHandlesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const handles = handlesText
      .split(/[\n,]/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setMessage({ text: "Give the league a name.", ok: false });
      return;
    }
    if (handles.length < 2) {
      setMessage({ text: "List at least 2 member handles, one per line.", ok: false });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const supabase = createClient();
    const result = await createLeague(supabase, name.trim(), Number(rosterSize) || 12, handles);
    setSubmitting(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) {
      setName("");
      setHandlesText("");
      onCreated();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Create a League</h3>
      <p className="mb-4 text-xs text-text-muted">
        Snake draft, long or short positions, equal-weight average return decides standings. Handles are drafted in
        the order you list them.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="League name"
          className="flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
        />
        <input
          value={rosterSize}
          onChange={(e) => setRosterSize(e.target.value)}
          type="number"
          min="4"
          max="20"
          placeholder="Roster size"
          className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none sm:w-32"
        />
      </div>
      <textarea
        value={handlesText}
        onChange={(e) => setHandlesText(e.target.value)}
        placeholder={"Member handles, one per line (draft order)\ntannor\nsteve\nmatt"}
        rows={5}
        className="mt-3 w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        {message && (
          <p className={`text-sm ${message.ok ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>{message.text}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="ml-auto shrink-0 rounded-md bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create League
        </button>
      </div>
    </form>
  );
}
