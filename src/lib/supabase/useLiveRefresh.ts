"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Live sync across devices: listens for inserts/updates/deletes on the given
// tables for this member (Supabase Realtime, RLS-filtered) and calls
// onChange, debounced, so a meal logged on the phone shows up on the desktop
// without a refresh. Tables must be in the supabase_realtime publication.
// Free tier: 200 concurrent connections, 2M messages/month — far above our use.
export function useLiveRefresh(tables: string[], userId: string | null, onChange: () => void, delayMs = 600) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  const key = tables.join(",");

  useEffect(() => {
    if (!userId || !key) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), delayMs);
    };
    let channel = supabase.channel(`live:${key}:${userId}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, fire);
    }
    channel.subscribe();
    // Deletes aren't delivered for filtered subscriptions, and a phone app that
    // was in the background can miss events, so also refresh when the app comes
    // back into view.
    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [key, userId, delayMs]);
}
