"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import UserRow, { type UserRowHandle } from "@/components/usersGroups/UserRow";
import EditProfileModal from "@/components/usersGroups/EditProfileModal";
import SurveyModal from "@/components/usersGroups/SurveyModal";
import { createClient } from "@/lib/supabase/client";
import {
  deleteAccount,
  fetchMyRole,
  fetchProfiles,
  saveProfileDetails,
  saveProfileRow,
  saveSurvey,
  sendPasswordReset,
} from "@/lib/usersGroups/queries";
import type { Profile, Role } from "@/lib/usersGroups/types";

// Port of the live Webflow "Users & Groups" admin page (page id
// 6a83f9f879dd9a50c8e75e96) -- full spec taken from the project doc
// claude/users-groups-head-code.html (the page's own head-code script).
// Gate: only App Director / Support / Developer may see this page; RLS
// separately enforces that Support/Developer only ever see paid/free
// accounts, so no client-side role filtering is needed beyond the gate
// itself.
export default function UsersGroupsPage() {
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [surveyProfile, setSurveyProfile] = useState<Profile | null>(null);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // One handle per rendered row, keyed by profile id -- lets the top-right
  // "Save All" button trigger every row's own save from a single click, as
  // a workaround for whatever's stopping the per-row Save buttons from
  // reaching the server (each row's individual Save button is untouched
  // and still there; this is an additional way to trigger the exact same
  // save logic, not a replacement for it).
  const rowRefs = useRef<Record<string, UserRowHandle | null>>({});

  function showStatus(text: string, isError: boolean) {
    setStatus({ text, isError });
    setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 4000);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setLoading(false);
          setDenied(true);
        }
        return;
      }
      if (cancelled) return;
      setUserId(user.id);
      const role = await fetchMyRole(supabase, user.id);
      if (cancelled) return;
      setMyRole(role);
      if (role === "app_director" || role === "support" || role === "developer") {
        const rows = await fetchProfiles(supabase);
        if (cancelled) return;
        setProfiles(rows);
        setDenied(false);
      } else {
        setDenied(true);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveRow(id: string, changes: { name?: string; role?: Role; is_demo?: boolean }) {
    const supabase = createClient();
    const { error } = await saveProfileRow(supabase, id, changes);
    if (error) {
      console.error("[Users & Groups] saveProfileRow failed", error);
      // Include the actual message (not just a generic line) -- this is
      // the only place a failure surfaces, and it's easy to miss since it
      // shows at the top of the page rather than next to the row you're
      // editing, so the more specific it is, the more likely it gets seen
      // and reported back with something diagnosable in it.
      showStatus(`Could not save changes: ${error}`, true);
      return;
    }
    setProfiles((rows) => rows.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    showStatus("Saved.", false);
  }

  async function handleSaveAll() {
    if (savingAll) return;
    setSavingAll(true);
    // Runs every currently-rendered row's own save in parallel -- each one
    // already reports its own success/error via showStatus (handleSaveRow
    // above), so this doesn't duplicate that; it just fires all of them at
    // once instead of requiring a click per row.
    await Promise.all(
      profiles.map((p) => rowRefs.current[p.id]?.save() ?? Promise.resolve())
    );
    setSavingAll(false);
  }

  async function handleDelete(profile: Profile) {
    const { error } = await deleteAccount(profile.id);
    if (error) {
      showStatus(error, true);
      return;
    }
    setProfiles((rows) => rows.filter((p) => p.id !== profile.id));
    showStatus("Account deleted.", false);
  }

  async function handleResetPassword(profile: Profile) {
    if (!profile.email) return;
    if (!(await confirm({ message: `Send a password reset email to ${profile.email}?`, danger: false }))) return;
    const supabase = createClient();
    const { error } = await sendPasswordReset(supabase, profile.email);
    if (error) {
      showStatus("Could not send reset email.", true);
      return;
    }
    showStatus(`Password reset email sent to ${profile.email}.`, false);
  }

  async function handleSaveProfileDetails(id: string, input: Parameters<typeof saveProfileDetails>[2]) {
    const supabase = createClient();
    const result = await saveProfileDetails(supabase, id, input);
    if (!result.error) {
      setProfiles((rows) => rows.map((p) => (p.id === id ? { ...p, ...input } : p)));
      showStatus("Profile updated.", false);
    }
    return result;
  }

  async function handleSaveSurvey(id: string, input: Parameters<typeof saveSurvey>[2]) {
    const supabase = createClient();
    const result = await saveSurvey(supabase, id, input);
    if (!result.error) {
      setProfiles((rows) =>
        rows.map((p) =>
          p.id === id
            ? {
                ...p,
                use_cases: input.use_cases,
                onboarding_survey: input.onboarding_survey,
                onboarding_completed_at: input.retake ? null : p.onboarding_completed_at,
              }
            : p
        )
      );
      showStatus("Survey saved.", false);
    }
    return result;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Users &amp; Groups</h1>
        {status && (
          <span className="text-sm" style={{ color: status.isError ? "#e05656" : "#3ddc97" }}>
            {status.text}
          </span>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : denied ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          Your account doesn&apos;t have access to this page.
        </div>
      ) : (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          {profiles.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-muted">No accounts found.</div>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  disabled={savingAll}
                  onClick={handleSaveAll}
                  className="rounded-md px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#4f8cff" }}
                >
                  {savingAll ? "Saving…" : "Save All"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3">Demo</th>
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {profiles.map((p) => (
                      <UserRow
                        key={p.id}
                        ref={(el) => {
                          rowRefs.current[p.id] = el;
                        }}
                        profile={p}
                        isSelf={p.id === userId}
                        myRole={myRole}
                        onSave={handleSaveRow}
                        onOpenSurvey={setSurveyProfile}
                        onOpenEdit={setEditProfile}
                        onResetPassword={handleResetPassword}
                        onDelete={handleDelete}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {editProfile && (
        <EditProfileModal profile={editProfile} onClose={() => setEditProfile(null)} onSave={handleSaveProfileDetails} />
      )}
      {surveyProfile && (
        <SurveyModal profile={surveyProfile} onClose={() => setSurveyProfile(null)} onSave={handleSaveSurvey} />
      )}
    </>
  );
}
