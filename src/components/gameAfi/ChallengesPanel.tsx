"use client";

import ChallengeMemberForm from "./ChallengeMemberForm";

// Head-to-head challenges tab (Game-a-Fi page). Used to also list every
// Received/Sent challenge with Accept/Decline/Cancel actions here, but per
// your call that's redundant: Accept/Decline for a received invite already
// lives in the Notifications bell (NotificationsModal.tsx, which filters
// fetchChallenges() to direction === "received" && status === "pending"),
// and a status summary of pending invites (sent or received) now lives on
// the Dashboard's "Funny Money" card (PaperBalancesCard.tsx) instead.
// Cancelling an already-sent pending invite lost its dedicated UI along
// with the Sent list -- there's no other surface for that action right now.
export default function ChallengesPanel() {
  return <ChallengeMemberForm />;
}
