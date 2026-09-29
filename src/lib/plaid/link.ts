"use client";

import { createClient } from "@/lib/supabase/client";

// Shared Plaid Link plumbing for "Connect Accounts" (new connection) and
// "Reconnect" (update mode -- repairs an existing connection without using
// one of the 10 free Trial slots).
//
// Server guardrails (plaid-create-link-token v12+):
//   409 plaid_item_cap_reached -> all free slots used; new connections blocked.
//   { item_id } in the body     -> update-mode link token for that connection.

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
        onExit: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

export function loadPlaidScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("plaid_sdk_failed"));
    document.head.appendChild(s);
  });
}

export async function callPlaidFunction(
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 401, data: { error: "unauthorized", message: "Please sign in again." } };

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "network", message: "Couldn't reach the server. Please try again." } };
  }
}

export type ReconnectResult = "reconnected" | "cancelled" | { error: string };

// Opens Plaid Link in update mode for an existing connection. Never exchanges
// a public token (the access token is unchanged); it just tells the server the
// connection was repaired so syncing resumes.
export async function reconnectPlaidItem(itemId: string): Promise<ReconnectResult> {
  const [, tokenRes] = await Promise.all([loadPlaidScript(), callPlaidFunction("plaid-create-link-token", { item_id: itemId })]);
  const linkToken = tokenRes.data.link_token as string | undefined;
  if (!tokenRes.ok || !linkToken) {
    return { error: (tokenRes.data.message as string) || "Couldn't start the reconnect. Please try again." };
  }

  return new Promise<ReconnectResult>((resolve) => {
    const handler = window.Plaid!.create({
      token: linkToken,
      onSuccess: async () => {
        const done = await callPlaidFunction("plaid-exchange-public-token", { mode: "update", item_id: itemId });
        resolve(done.ok ? "reconnected" : { error: "Reconnected at the bank, but the app couldn't record it. Refresh and try again." });
      },
      onExit: () => resolve("cancelled"),
    });
    handler.open();
  });
}
