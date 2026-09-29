"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reconnectPlaidItem } from "@/lib/plaid/link";

// Lists the signed-in user's Plaid connections whose bank login has expired
// (plaid_items.needs_relink, set by the sync jobs on ITEM_LOGIN_REQUIRED) and
// offers "Reconnect" for each. Reconnect uses Plaid Link UPDATE MODE, which
// repairs the existing connection -- it does NOT create a new one, so it never
// uses one of the 10 free Trial slots. Never use "Connect Accounts" to fix a
// broken bank; that burns a slot.
//
// Data comes from the my_plaid_connections_needing_relink() RPC (security
// definer, scoped to auth.uid(), returns no tokens). Renders nothing when
// every connection is healthy.

type Connection = { item_id: string; institution_name: string | null; account_names: string[] | null };

async function fetchNeedingRelink(): Promise<Connection[] | null> {
  const { data, error } = await createClient().rpc("my_plaid_connections_needing_relink");
  if (error) {
    console.error("[PlaidRelinkBanner] status lookup failed", error);
    return null;
  }
  return (data as Connection[]) ?? [];
}

export default function PlaidRelinkBanner() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNeedingRelink().then((rows) => {
      if (!cancelled && rows) setConnections(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function reconnect(c: Connection) {
    if (busyId) return;
    setBusyId(c.item_id);
    setMessage(null);
    try {
      const result = await reconnectPlaidItem(c.item_id);
      if (result === "reconnected") {
        setMessage(`${c.institution_name ?? "Connection"} reconnected. Balances refresh on the next sync.`);
        setReloadKey((k) => k + 1);
      } else if (result !== "cancelled") {
        setMessage(result.error);
      }
    } catch (err) {
      console.error("[PlaidRelinkBanner] reconnect failed", err);
      setMessage("Couldn't start the reconnect. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!connections.length && !message) return null;

  return (
    <div className="rounded-2xl border border-[#f5d020]/30 bg-[#f5d020]/[0.06] p-4">
      {connections.length > 0 && (
        <>
          <div className="mb-1 text-sm font-semibold text-text-primary">
            {connections.length === 1 ? "1 bank connection needs you to sign in again" : `${connections.length} bank connections need you to sign in again`}
          </div>
          <div className="mb-3 text-xs text-text-muted">
            These have stopped syncing. Reconnect repairs the existing connection and doesn&apos;t use a free connection slot.
          </div>
          <ul className="flex flex-col gap-2">
            {connections.map((c) => (
              <li key={c.item_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-text-primary">{c.institution_name ?? "Bank connection"}</div>
                  {c.account_names && c.account_names.length > 0 && (
                    <div className="truncate text-xs text-text-muted">{c.account_names.join(", ")}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => reconnect(c)}
                  className="rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {busyId === c.item_id ? "Opening…" : "Reconnect"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {message && <div className={`${connections.length ? "mt-3 " : ""}text-xs text-text-primary`}>{message}</div>}
    </div>
  );
}
