"use client";

import InviteFriendForm from "./InviteFriendForm";

// Popup wrapper around InviteFriendForm, opened from the Dashboard's Quick
// Access panel (QuickAccessCard.tsx) -- same pattern as
// ChallengeMemberModal. Stays open after a successful send (the form shows
// its own "Invitation sent to ..." success line) so a member can send
// several invites in a row without reopening the modal each time.
export default function InviteFriendModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl">
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <InviteFriendForm />
      </div>
    </div>
  );
}
