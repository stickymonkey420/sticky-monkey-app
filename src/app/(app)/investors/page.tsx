"use client";

import { useEffect, useState } from "react";
import YourEquityTable from "@/components/investors/YourEquityTable";
import PoolSummaryCards from "@/components/investors/PoolSummaryCards";
import OwnersTable from "@/components/investors/OwnersTable";
import ManageEntriesTable from "@/components/investors/ManageEntriesTable";
import EntryFormModal from "@/components/investors/EntryFormModal";
import { createClient } from "@/lib/supabase/client";
import {
  addCapTableEntry,
  deleteCapTableEntry,
  fetchAllEntries,
  fetchDirectorEmails,
  fetchMyEntries,
  fetchMyRole,
  fetchProfileOptions,
  updateCapTableEntry,
  type CapTableEntryInput,
  type ProfileOption,
} from "@/lib/investors/queries";
import { computePoolSummary } from "@/lib/investors/calc";
import type { CapTableEntry } from "@/lib/investors/types";

// Port of the live Webflow "Investors" page (page id 6a8c0248de8bad7c888a7fa2).
// No client-side script existed for this page -- built directly from the
// cap_table_entries schema + check_cap_table_limits()/sync_owner_equity()
// triggers (see lib/investors/types.ts for the full research trail).
//
// Visibility split (a deliberate, RLS-faithful design choice, not a gap):
// "Your Equity" is shown to every signed-in user, scoped to their own rows
// by RLS. Pool summary, Owners, and entry management are app_director-only
// -- there is no aggregate view/RPC a non-director could read anyway, since
// cap_table_select_own_or_director only ever returns a non-director's own
// rows.
export default function InvestorsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myEntries, setMyEntries] = useState<CapTableEntry[]>([]);
  const [allEntries, setAllEntries] = useState<CapTableEntry[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [directorEmails, setDirectorEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [editEntry, setEditEntry] = useState<CapTableEntry | null | undefined>(undefined);

  const isDirector = myRole === "app_director";

  function showStatus(text: string, isError: boolean) {
    setStatus({ text, isError });
    setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 4000);
  }

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;
      setUserId(user.id);
      const role = await fetchMyRole(supabase, user.id);
      if (cancelled) return;
      setMyRole(role);
      const mine = await fetchMyEntries(supabase, user.id);
      if (cancelled) return;
      setMyEntries(mine);
      if (role === "app_director") {
        const [all, emails, options] = await Promise.all([
          fetchAllEntries(supabase),
          fetchDirectorEmails(supabase),
          fetchProfileOptions(supabase),
        ]);
        if (cancelled) return;
        setAllEntries(all);
        setDirectorEmails(emails);
        setProfileOptions(options);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveEntry(input: CapTableEntryInput, id: string | null) {
    const supabase = createClient();
    if (!userId) return { error: "Not signed in." };
    const result = id
      ? await updateCapTableEntry(supabase, id, input)
      : await addCapTableEntry(supabase, userId, input);
    if (!result.error) {
      const [all, mine] = await Promise.all([fetchAllEntries(supabase), fetchMyEntries(supabase, userId)]);
      setAllEntries(all);
      setMyEntries(mine);
      showStatus(id ? "Entry updated." : "Entry added.", false);
    }
    return result;
  }

  async function handleDelete(entry: CapTableEntry) {
    if (!window.confirm(`Delete this entry for ${entry.first_name || entry.email}?`)) return;
    const supabase = createClient();
    const { error } = await deleteCapTableEntry(supabase, entry.id);
    if (error) {
      showStatus(error, true);
      return;
    }
    setAllEntries((rows) => rows.filter((r) => r.id !== entry.id));
    if (userId) setMyEntries((rows) => rows.filter((r) => r.id !== entry.id));
    showStatus("Entry deleted.", false);
  }

  const summary = computePoolSummary(allEntries, directorEmails);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Investors</h1>
        <div className="flex items-center gap-3">
          {status && (
            <span className="text-sm" style={{ color: status.isError ? "#e05656" : "#3ddc97" }}>
              {status.text}
            </span>
          )}
          {isDirector && (
            <button
              type="button"
              onClick={() => setEditEntry(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "#4f8cff" }}
            >
              Add Entry
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-6">
          <YourEquityTable entries={myEntries} />

          {isDirector && (
            <>
              <PoolSummaryCards summary={summary} />
              <OwnersTable owners={summary.owners} />
              <ManageEntriesTable entries={allEntries} onEdit={(e) => setEditEntry(e)} onDelete={handleDelete} />
            </>
          )}
        </div>
      )}

      {editEntry !== undefined && (
        <EntryFormModal
          entry={editEntry ?? null}
          profileOptions={profileOptions}
          onClose={() => setEditEntry(undefined)}
          onSave={handleSaveEntry}
        />
      )}
    </>
  );
}
