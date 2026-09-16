"use client";

import ChallengeMemberForm from "./ChallengeMemberForm";

// Head-to-head challenges tab (Game-a-Fi page). Used to also list every
// Received/Sent challenge with Accept/Decline/Cancel actions here, but per
// your call that's redundant: Accept/Decline for a received invite lives in
// both the Notifications bell (NotificationsModal.tsx) and the Dashboard's
// Scoreboard card (ScoreboardCard.tsx, formerly "Funny Money"), which also
// covers Cancel for a pending sent invite -- so this tab is just the form.
export default function ChallengesPanel() {
  return <ChallengeMemberForm />;
}
