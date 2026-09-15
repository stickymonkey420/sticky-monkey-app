"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import SignOutButton from "./SignOutButton";

// Fallback avatar -- same Webflow-hosted asset used as the default
// `abu-avatar.jpg` everywhere else a user hasn't set profiles.avatar_url.
const DEFAULT_AVATAR_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a973826f57d905329bc6275_abu-avatar-p-500.jpg";

type ProfileLite = { name: string | null; email: string | null; avatar_url: string | null };

// Global top bar: search, alerts bell (unread investment_alerts count), and
// a profile avatar/name dropdown. Lives in AppShell so it shows on every
// page alongside the sidebar. Per the reference mockup, the search field,
// alerts icon, and profile icon/menu all carry the "featured" green border.
export default function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profileData }, { count }] = await Promise.all([
        supabase.from("profiles").select("name,email,avatar_url").eq("id", user.id).maybeSingle(),
        supabase
          .from("investment_alerts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("dismissed", false),
      ]);

      if (cancelled) return;
      if (profileData) setProfile(profileData as ProfileLite);
      setAlertCount(count || 0);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/stock-screener");
  }

  const displayName = profile?.name || profile?.email || "Account";
  const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR_URL;

  return (
    <header className="flex items-center gap-4 border-b border-card-border bg-card-bg px-4 py-3 md:px-8">
      <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
        <div className="featured-border flex max-w-md items-center gap-2 rounded-full bg-[#0f131c] px-4 py-2">
          <Search size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </form>

      <button
        type="button"
        aria-label="Alerts"
        onClick={() => router.push("/dashboard")}
        className="featured-border relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f131c]"
      >
        <Bell size={18} className="text-text-primary" strokeWidth={1.75} />
        {alertCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: "#ff5c7a" }}
          >
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="featured-border flex items-center gap-2 rounded-full bg-[#0f131c] py-1 pl-1 pr-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
          <span className="hidden max-w-[9rem] truncate text-sm font-medium text-text-primary sm:inline">
            {displayName}
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-xl border border-card-border bg-card-bg p-2 shadow-xl">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium text-text-primary">{profile?.name || "Account"}</div>
              {profile?.email && <div className="truncate text-xs text-text-muted">{profile.email}</div>}
            </div>
            <div className="my-1 border-t border-card-border" />
            <SignOutButton />
          </div>
        )}
      </div>
    </header>
  );
}
