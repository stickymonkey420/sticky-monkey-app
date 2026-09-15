"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile/ProfileProvider";
import MyProfileModal from "@/components/profile/MyProfileModal";
import SignOutButton from "./SignOutButton";

// Fallback avatar -- same Webflow-hosted asset used as the default
// `abu-avatar.jpg` everywhere else a user hasn't set profiles.avatar_url.
const DEFAULT_AVATAR_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a973826f57d905329bc6275_abu-avatar-p-500.jpg";

// Global top bar: search, alerts bell (unread investment_alerts count), and
// a profile avatar/dropdown. Lives in AppShell so it shows on every page
// alongside the sidebar. Styled flat/borderless to match the live Webflow
// site exactly (plain icon + placeholder text on the page background, a
// 36px avatar, a small red count badge on the bell) -- the earlier pass's
// green "featured" borders were reference pointers on the mockup, not a
// literal border the live design uses.
export default function TopBar() {
  const router = useRouter();
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from("investment_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("dismissed", false);

      if (cancelled) return;
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
    <header className="flex items-center justify-end gap-6 px-4 py-6 md:px-8">
      <form onSubmit={handleSearchSubmit} className="mr-auto min-w-0 max-w-xs flex-1">
        <div className="flex items-center gap-2.5">
          <Search size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search here ..."
            aria-label="Search"
            className="w-full min-w-0 bg-transparent text-sm text-text-muted outline-none placeholder:text-text-muted"
          />
        </div>
      </form>

      <button type="button" aria-label="Alerts" onClick={() => router.push("/dashboard")} className="relative flex shrink-0 items-center">
        <Bell size={18} className="text-text-primary" strokeWidth={1.75} />
        {alertCount > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: "#eb5757" }}
          >
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt={displayName} className="h-9 w-9 rounded-full object-cover" />
          <ChevronDown size={14} className="text-text-muted" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-xl border border-card-border bg-card-bg p-2 shadow-xl">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium text-text-primary">{profile?.name || "Account"}</div>
              {profile?.email && <div className="truncate text-xs text-text-muted">{profile.email}</div>}
            </div>
            <div className="my-1 border-t border-card-border" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setProfileModalOpen(true);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-white/5"
            >
              Edit Profile
            </button>
            <div className="my-1 border-t border-card-border" />
            <SignOutButton />
          </div>
        )}
      </div>

      {profileModalOpen && <MyProfileModal onClose={() => setProfileModalOpen(false)} />}
    </header>
  );
}
