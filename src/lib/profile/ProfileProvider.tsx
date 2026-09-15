"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProfileLite = { name: string | null; email: string | null; avatar_url: string | null };

const CACHE_KEY_PREFIX = "sm_profile_cache_";

function readCache(userId: string): ProfileLite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + userId);
    return raw ? (JSON.parse(raw) as ProfileLite) : null;
  } catch {
    return null; // private browsing / storage disabled -- the cache is a nice-to-have, never required
  }
}

function writeCache(userId: string, profile: ProfileLite) {
  try {
    window.localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(profile));
  } catch {
    // same as above -- ignore, a fresh fetch still works fine without the cache
  }
}

function clearCache(userId: string) {
  try {
    window.localStorage.removeItem(CACHE_KEY_PREFIX + userId);
  } catch {
    // ignore
  }
}

type ProfileContextValue = {
  profile: ProfileLite | null;
  loading: boolean;
};

const ProfileContext = createContext<ProfileContextValue>({ profile: null, loading: true });

// Single source of truth for the signed-in user's name/email/avatar_url,
// fetched ONCE per browser session (this provider lives in the (app) route
// group's layout, so it mounts once and survives client-side navigation --
// see that layout for why that matters) instead of every consumer running
// its own independent Supabase query and its own "loading -> placeholder"
// flash on every mount. TopBar and ProfileSummaryCard both read from
// useProfile() now rather than fetching their own copy.
//
// A per-user localStorage cache additionally smooths the very FIRST paint
// after a fresh full-page load (a login redirect, a hard refresh) -- a case
// the persistent layout can't help with, since there's no previous React
// tree to keep alive there. If this browser has a cached profile for the
// signed-in user's id, it's used as the initial render (avatar/name correct
// immediately, no placeholder flash) while a real fetch quietly confirms or
// updates it in the background. The cache is keyed by user id and cleared
// on sign-out so a shared browser never flashes one account's cached
// avatar for a different account signing in afterward.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const cached = readCache(user.id);
      if (cached && !cancelled) {
        setProfile(cached);
        setLoading(false);
      }

      const { data } = await supabase.from("profiles").select("name,email,avatar_url").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        const fresh = data as ProfileLite;
        setProfile(fresh);
        writeCache(user.id, fresh);
      }
      setLoading(false);
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
      } else if (event === "SIGNED_IN" && session?.user) {
        // A different (or the first) sign-in in this tab -- re-run the same
        // cache-then-fetch flow for the newly signed-in user rather than
        // keeping whatever the previous session left in state.
        load();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <ProfileContext.Provider value={{ profile, loading }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

// Exported for SignOutButton so the cache doesn't linger for the next
// person who signs into the same browser.
export function clearProfileCache(userId: string) {
  clearCache(userId);
}
