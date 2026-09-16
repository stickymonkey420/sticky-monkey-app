"use client";

import ChallengeMemberForm from "./ChallengeMemberForm";

// Popup wrapper around ChallengeMemberForm, opened from the Dashboard's
// Quick Access panel (QuickAccessCard.tsx) so a member can send a Head to
// Head challenge from anywhere, not just the Game-a-Fi page. Stays open
// after a successful send (the form shows its own "Challenge sent to
// @handle." success line) -- the member closes it manually, same pattern
// as NotificationsModal.
export default function ChallengeMemberModal({ onClose }: { onClose: () => void }) {
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
        <ChallengeMemberForm />
      </div>
    </div>
  );
}
