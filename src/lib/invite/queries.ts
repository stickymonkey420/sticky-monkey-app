// Client-side call for the "Invite Friend or Family" Quick Access button --
// posts to /api/invite (see that route for why this has to be a server
// route: sending a Supabase Auth invite requires the service-role key,
// which can never reach the browser).
export type InviteResult = { error: string | null };

export async function sendFriendInvite(firstName: string, email: string): Promise<InviteResult> {
  try {
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, email }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { error: body.error || "Could not send the invitation." };
    }
    return { error: null };
  } catch {
    return { error: "Could not send the invitation." };
  }
}
