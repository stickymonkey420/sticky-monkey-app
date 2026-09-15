// Shared display formatting for Game-a-Fi challenge terms -- used by both
// ChallengesPanel (the Head to Head tab) and NotificationsModal (the bell
// popup also surfaces pending invites), so the two stay visually identical.
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatChallengeWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
