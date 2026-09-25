"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { ALL_ROLES, LIMITED_ROLES, ROLE_LABELS, type Profile, type Role } from "@/lib/usersGroups/types";

// Lets the page-level "Save All" button (top-right of the table) trigger
// every row's own save from one click, on top of each row's individual
// Save button -- see UsersGroupsPage's rowRefs/handleSaveAll.
export type UserRowHandle = { save: () => Promise<void> };

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type UserRowProps = {
  profile: Profile;
  isSelf: boolean;
  myRole: Role | null;
  onSave: (id: string, changes: { name?: string; role?: Role; is_demo?: boolean }) => Promise<void>;
  onOpenSurvey: (p: Profile) => void;
  onOpenEdit: (p: Profile) => void;
  onResetPassword: (p: Profile) => void;
  onDelete: (p: Profile) => void;
};

// Ported from the live script's renderRow(): the inline row only exposes
// name/role/is_demo (everything else lives behind Edit/Survey modals).
// Support/Developer see a disabled role <select> limited to paid/free
// (RLS enforces the same restriction server-side); App Director sees and
// can assign every tier, and is the only one who gets a Delete button.
const UserRow = forwardRef<UserRowHandle, UserRowProps>(function UserRow(
  { profile, isSelf, myRole, onSave, onOpenSurvey, onOpenEdit, onResetPassword, onDelete },
  ref
) {
  const confirm = useConfirm();
  const [name, setName] = useState(profile.name ?? "");
  const [role, setRole] = useState<Role>(profile.role);
  const [isDemo, setIsDemo] = useState(profile.is_demo);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDirector = myRole === "app_director";
  const roleOptions = isDirector ? ALL_ROLES : LIMITED_ROLES;
  const surveyDone = !!profile.onboarding_completed_at;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(profile.id, { name, role, is_demo: isDemo });
    } finally {
      // finally, not just after the await -- if onSave ever throws instead
      // of resolving with an {error}, this row was previously left stuck
      // on "Saving..." forever with no way to tell it had failed.
      setSaving(false);
    }
  }

  // Exposes this row's own save to the page-level "Save All" button --
  // same handleSave the row's own Save button calls, just triggerable from
  // outside too.
  useImperativeHandle(ref, () => ({ save: handleSave }));

  async function handleDelete() {
    if (
      !(await confirm({
        message: `Permanently delete ${profile.name || profile.email || profile.id}'s account -- profile, trades, positions, LEAPs, and their ability to sign in? This cannot be undone.`,
        danger: true,
      }))
    ) {
      return;
    }
    setDeleting(true);
    await onDelete(profile);
    setDeleting(false);
  }

  return (
    <tr>
      <td className="min-w-[160px] py-2.5 pr-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-text-primary focus:border-card-border focus:outline-none"
        />
      </td>
      <td className="min-w-[180px] break-all py-2.5 pr-3 text-sm text-text-muted">
        {profile.email}
        {isSelf && <span className="ml-1.5 text-xs text-[#4f8cff]">(you)</span>}
      </td>
      <td className="min-w-[130px] py-2.5 pr-3">
        <select
          value={role}
          disabled={!isDirector}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full rounded-md border border-card-border bg-[#0d0f17] px-2 py-1.5 text-xs text-text-primary disabled:opacity-60"
        >
          {(roleOptions.includes(profile.role) ? roleOptions : [profile.role, ...roleOptions]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-[80px] py-2.5 pr-3">
        <input
          type="checkbox"
          checked={isDemo}
          onChange={(e) => setIsDemo(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
        />
      </td>
      <td className="min-w-[100px] whitespace-nowrap py-2.5 pr-3 text-sm text-text-muted">
        {fmtDate(profile.created_at)}
      </td>
      <td className="py-2.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onOpenSurvey(profile)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-card-border px-2.5 py-1.5 text-xs font-semibold text-text-primary hover:bg-white/10"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: surveyDone ? "#f5d020" : "hsla(224,18%,42%,0.5)" }}
            />
            Survey
          </button>
          <button
            type="button"
            onClick={() => onOpenEdit(profile)}
            className="whitespace-nowrap rounded-md border border-card-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-white/10"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={!profile.email}
            onClick={() => onResetPassword(profile)}
            className="whitespace-nowrap rounded-md border border-card-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-white/10 disabled:opacity-50"
          >
            Reset Pass
          </button>
          {isDirector && (
            <button
              type="button"
              disabled={isSelf || deleting}
              onClick={handleDelete}
              className="whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ borderColor: "#6e2a2a", color: "#ff8080" }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default UserRow;
