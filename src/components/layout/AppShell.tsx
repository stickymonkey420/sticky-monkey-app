"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Wallet,
  CircleDollarSign,
  TrendingUp,
  Receipt,
  User,
  Search,
  Crown,
  FileText,
  ShieldCheck,
  Wrench,
  Briefcase,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ProfileSummaryCard from "@/components/dashboard/ProfileSummaryCard";
import SignOutButton from "./SignOutButton";
import TopBar from "./TopBar";

// Real Webflow-hosted logo assets (head icon + white script wordmark) --
// hotlinked directly from Webflow's permanent S3 CDN rather than
// downloaded/re-hosted, same pattern used for the Abu chatbot's avatar.
const LOGO_HEAD_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/665f61495d5be52dd1a1e71b_StickyMonkeyHead256.png";
const LOGO_WORDMARK_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/665f61d2c30be1663c636369_white%20StickyMonkey-p-500.png";

// Nested sidebar nav. The live Webflow site nests Stock Screener inside
// Invest, but here Invest is a fully paid-gated group (Portfolio/Taxable/
// Retirement/Vault) and Stock Screener is meant to stay visible to free
// accounts too -- so it's pulled out to its own top-level link instead of
// living inside Invest, since nesting it there would hide it whenever the
// whole group is gated. Everything else follows the live site's real
// nesting (confirmed off its accessibility tree, not a screenshot):
//   - "Income" is a single paid-gated group containing the Income overview
//     page plus a "Trade Options" sub-group (Options/Closed Positions/
//     Simulator) -- there is no separate top-level "Trade Options" entry.
//   - "Utilities" is a dropdown containing Edit Categories (free) and
//     Update API Key (admin) -- ungated at the group level so the free
//     child still shows even though its sibling doesn't.
//   - "Owners" (Webflow calls this page "Investors"; renamed here since
//     it's really about tracking company ownership, not app members) and
//     "Users & Groups" are each a real dropdown with exactly one child on
//     the live site; flattened here to single links since a 1-item
//     accordion adds a click for no benefit.
// "My Wallet" is now also a group: "Overview" is the original wallet
// dashboard, "Card Center" (Webflow slug moneyfarm-webflow-html-website-
// template) is a real credit-card list/add/edit/delete screen over
// manual_accounts (category='credit_card') -- viewing stays free (RLS
// SELECT has no role check, same as Banking), only add/edit/delete
// requires paid, shown inline on that page rather than hidden here.
//
// "Invest" now also has an "Accounts" child (href /invest-accounts,
// distinct from Banking's own /accounts) -- manages the account-level
// record (institution/name/balance) for brokerage, retirement, and
// precious-metal manual accounts, not the positions/vault items inside
// them. It has no separate in-page role check, same as Portfolio/Taxable/
// Retirement/Vault -- the whole Invest group being paid-gated is what
// keeps it from free tier.
//
// "Businesses" is a new group: "Find a Gig" (Webflow's nav label was
// "Search", slug side-gigs) is a searchable directory over gig_categories
// (50 rows, 10 groups) that creates a user_businesses row when you pick
// one; "My Business" (slug my-business) manages that business's Clients,
// a Jobs board (Lead/Scheduled/In Progress/Completed/Cancelled), and a
// Scheduler. Both were confirmed as real, actively-used features (live
// data already in all four tables), not template boilerplate -- and
// unlike almost everything else in this app, none of their RLS policies
// have a paid/app_director check, so this whole group is free-tier.
// My Business's own "Invoices" sub-section (bill clients via "the
// existing invoicing tools") is left out -- it points at the Invoice
// List/Create Invoices Webflow pages, confirmed unused template
// boilerplate, so it's omitted rather than shipped as a dead link.
//
// "Game-a-Fi" (href /game-a-fi) was the live site's "Director test build"
// stub -- restructured per your explicit call into a fantasy-football-
// style weekly standings board (not head-to-head matchups): every
// member's real portfolio return % for the week sets their placement,
// plus a season-long cumulative standings tab. Shipped free-tier, same as
// Stock Screener/Businesses. It reads from the existing net_worth_snapshots
// table (already populated by the daily snapshot-net-worth cron) via new
// SECURITY DEFINER SQL functions (game_afi_weekly_leaderboard /
// game_afi_season_leaderboard / game_afi_available_weeks, migration
// game_afi_leaderboard_phase1) that return only {user_id, display_name,
// pct_return, rank} -- no member's raw dollar balance is ever exposed to
// anyone else, so this replaces (rather than reuses) the old
// app_director-only RLS on game_players/game_watchlist, which are left
// untouched and unused for now. A later Phase 2 (a separate paper-trading
// competition, where $ amounts are fine to show since it's not real
// money) is a bigger, not-yet-built follow-up.
//
// Left out on purpose: "Travel" (Businesses) -- the live site's own link
// is an unwired `#` placeholder; a second, mislabeled "Invoices" dropdown
// under Businesses that's actually a Color/Typography/Iconography/Button
// style guide -- confirmed generic Webflow-template leftover;
// "Authentication" (Sign In/Sign Up) -- redundant with this app's own
// /sign-in flow.
//
// `requires` gates a node by role, derived from the ACTUAL Supabase RLS
// policies rather than guessed -- `transactions`/`custom_transaction_categories`
// have zero role restriction (free), `stock_universe` is explicitly
// readable by any authenticated user (free). `wheel_trades`, `positions`,
// `metal_holdings`, and `recurring_investments` all require role IN
// ('paid','app_director') to write, and the Invest group treats those as
// fully paid-gated (view included, not just write) per your explicit
// call. `manual_accounts` has the same write restriction but is used more
// broadly (Banking, Card Center) where viewing is meant to stay free --
// those pages gate add/edit/delete inline instead of hiding the whole
// nav entry. "admin" means app_director/support/developer -- staff roles that are not
// automatically 'paid' under RLS, so they see the base (free-tier) feature
// set plus the admin tools, not the paid trading features, unless their
// role is separately app_director. "owner" is narrower still: only
// app_director, the small handful of people who actually own the company
// -- support/developer staff do NOT pass this gate even though they do
// pass "admin". A `requires` on a group node gates the whole subtree at
// once (fine when every child needs the same gate, e.g. Income); a group
// left ungated but with individually-gated children (e.g. Utilities) lets
// a free child (Edit Categories) surface even though a sibling in the
// same group is admin-only -- see filterNode below.
type Role = "free" | "paid" | "app_director" | "support" | "developer";
type NavNode = {
  label: string;
  href?: string;
  children?: NavNode[];
  requires?: "paid" | "admin" | "owner";
  icon?: LucideIcon;
};

// Icons match the live Webflow site's convention: only top-level items and
// group headers carry an icon (pulled from the site's actual sidebar
// images -- Dashboard's layout tile, the wallet, the trending-up arrow on
// Invest, the document icon on Transactions, the person icon on Banking,
// etc.), while nested children under a group render as plain text links,
// same as on the live site. Reproduced with lucide-react (MIT, $0/month)
// rather than lifting Webflow's raster PNGs 1:1.
const NAV_TREE: NavNode[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "My Wallet",
    icon: Wallet,
    children: [
      { href: "/wallet", label: "Overview" },
      { href: "/card-center", label: "Card Center" },
    ],
  },
  {
    label: "Invest",
    icon: TrendingUp,
    requires: "paid",
    children: [
      { href: "/invest", label: "Portfolio" },
      { href: "/invest-accounts", label: "Accounts" },
      {
        label: "Taxable",
        children: [
          { href: "/holdings?account=brokerage", label: "Brokerage" },
          { href: "/holdings?account=crypto", label: "Crypto" },
        ],
      },
      {
        label: "Retirement",
        children: [
          { href: "/holdings?account=traditional", label: "Traditional IRA" },
          { href: "/holdings?account=roth", label: "Roth IRA" },
        ],
      },
      { href: "/invest#vault-section", label: "Vault" },
    ],
  },
  {
    label: "Income",
    icon: CircleDollarSign,
    requires: "paid",
    children: [
      { href: "/income", label: "Overview" },
      {
        label: "Trade Options",
        children: [
          { href: "/options", label: "Options" },
          { href: "/closed-positions", label: "Closed Positions" },
          { href: "/simulator", label: "Simulator" },
        ],
      },
    ],
  },
  { href: "/stock-screener", label: "Stock Screener", icon: Search },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/accounts", label: "Banking", icon: User },
  { href: "/smu", label: "SMU", icon: FileText },
  {
    label: "Businesses",
    icon: Briefcase,
    children: [
      { href: "/side-gigs", label: "Find a Gig" },
      { href: "/my-business", label: "My Business" },
    ],
  },
  { href: "/game-a-fi", label: "Game-a-Fi", icon: Trophy },
  { href: "/investors", label: "Owners", requires: "owner", icon: Crown },
  {
    label: "Utilities",
    icon: Wrench,
    children: [
      { href: "/edit-categories", label: "Edit Categories" },
      { href: "/update-api-key", label: "Update API Key", requires: "admin" },
    ],
  },
  { href: "/users-groups", label: "Users & Groups", requires: "admin", icon: ShieldCheck },
];

function passesGate(requires: NavNode["requires"], role: Role | null): boolean {
  if (!requires) return true;
  if (!role) return false; // role not loaded yet -- hide gated items until known, never flash them
  if (requires === "owner") return role === "app_director"; // company ownership, not staff/support access
  if (requires === "admin") return role === "app_director" || role === "support" || role === "developer";
  if (requires === "paid") return role === "paid" || role === "app_director";
  return true;
}

// Recursive: a group with `requires` is dropped whole (no need to also
// check children); an ungated group is kept only if at least one child
// survives filtering.
function filterNode(node: NavNode, role: Role | null): NavNode | null {
  if (!passesGate(node.requires, role)) return null;
  if (node.children) {
    const children = node.children.map((c) => filterNode(c, role)).filter((c): c is NavNode => c !== null);
    if (children.length === 0 && !node.href) return null;
    return { ...node, children };
  }
  return node;
}

// Query strings and hashes are stripped for matching -- the four Holdings
// deep links (?account=brokerage/crypto/traditional/roth) all resolve to
// the same /holdings pathname, and that page scrubs its own query param
// out of the URL right after reading it (see holdings/page.tsx), so exact
// per-link active state isn't preservable across a reload anyway. All four
// share pathname-only matching; harmless, since they only ever show
// "active" together while genuinely on /holdings.
function hrefPath(href: string): string {
  return href.split(/[?#]/)[0];
}

function isLeafActive(href: string, pathname: string): boolean {
  const path = hrefPath(href);
  return pathname === path || pathname.startsWith(`${path}/`);
}

function containsActive(node: NavNode, pathname: string): boolean {
  if (node.href) return isLeafActive(node.href, pathname);
  if (node.children) return node.children.some((c) => containsActive(c, pathname));
  return false;
}

function NavItem({
  node,
  depth,
  pathname,
  onNavigate,
}: {
  node: NavNode;
  depth: number;
  pathname: string;
  onNavigate?: () => void;
}) {
  const hasActiveChild = node.children ? containsActive(node, pathname) : false;
  const [open, setOpen] = useState(hasActiveChild);
  const indent = 12 + depth * 14;
  const Icon = node.icon;

  if (node.children) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between rounded-md py-2 pr-3 text-sm font-medium text-text-primary ${
            hasActiveChild ? "bg-white/5" : ""
          }`}
          style={{ paddingLeft: `${indent}px` }}
        >
          <span className="flex items-center gap-2.5">
            {Icon && <Icon size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />}
            <span>{node.label}</span>
          </span>
          <span
            className="text-[10px] text-text-muted transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
        </button>
        {open && (
          <div className="flex flex-col gap-1">
            {node.children.map((child) => (
              <NavItem
                key={child.label + (child.href ?? "")}
                node={child}
                depth={depth + 1}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const active = isLeafActive(node.href!, pathname);
  return (
    <Link
      href={node.href!}
      onClick={onNavigate}
      // id targeted by the Abu chatbot's card-highlight feature (see
      // components/chat/AbuChatWidget.tsx) -- undefined for every other
      // link, so this never shows up as a stray attribute elsewhere.
      id={node.href === "/income" ? "income-nav-link" : undefined}
      className={`flex items-center gap-2.5 rounded-md py-2 pr-3 text-sm font-medium text-text-primary ${
        active ? "bg-white/5" : "border-l-2 border-transparent"
      }`}
      style={{
        paddingLeft: `${indent}px`,
        borderLeft: active ? "2px solid #4f8cff" : undefined,
      }}
    >
      {Icon && <Icon size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />}
      <span>{node.label}</span>
    </Link>
  );
}

function NavTree({ pathname, role, onNavigate }: { pathname: string; role: Role | null; onNavigate?: () => void }) {
  const visible = NAV_TREE.map((node) => filterNode(node, role)).filter((n): n is NavNode => n !== null);
  return (
    <>
      {visible.map((node) => (
        <NavItem key={node.label + (node.href ?? "")} node={node} depth={0} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Fetched once per page load (AppShell isn't a shared layout -- every
  // page mounts its own instance -- so this is a cheap single-row lookup,
  // same cost profile as the role checks already done independently on
  // Investors/Users & Groups). Starts null so gated items stay hidden
  // rather than flashing before the role is known.
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (data) setRole((data as { role: Role }).role);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden md:flex-row md:gap-4 md:p-4">
      {/* Mobile top bar: below the md breakpoint the desktop sidebar is
          hidden, so a hamburger opens the same nested nav as a full-height
          drawer instead of trying to cram ~15 grouped items into a header
          row. */}
      <header className="flex items-center justify-between border-b border-card-border bg-card-bg px-4 py-3 md:hidden">
        <span className="text-base font-semibold text-text-primary">Sticky Monkey</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-text-primary"
        >
          Menu
        </button>
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-[100] flex md:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-card-bg">
            <div className="flex items-center justify-between px-5 py-6">
              <span className="text-lg font-semibold text-text-primary">Sticky Monkey</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-xl text-text-muted"
              >
                ×
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3">
              <NavTree pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="flex flex-col gap-1 px-3 pb-6">
              <SignOutButton />
            </div>
          </div>
        </div>
      )}

      {/* Sidebar is its own floating card -- same rgb(21,27,40)/30px-radius
          treatment as the Dashboard's right-side profile panel, sticky so
          it stays put (and visibly bounds the content column) at every
          scroll depth instead of scrolling away with the page. */}
      <aside
        className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col gap-4 overflow-y-auto rounded-[30px] p-4 md:flex"
        style={{ backgroundColor: "#151b28" }}
      >
        <div className="flex flex-col items-center gap-1.5 px-2 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_HEAD_URL} alt="" className="h-12 w-12" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_WORDMARK_URL} alt="Sticky Monkey" className="h-6 w-auto" />
          <span className="text-[10px] font-semibold tracking-[0.25em] text-text-muted">FINANCE</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-1">
          <NavTree pathname={pathname} role={role} />
        </nav>

        <div className="flex flex-col gap-1 px-1">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="hidden md:block">
          <TopBar />
        </div>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      {/* Profile panel now lives in the shared shell (like the sidebar)
          instead of being a per-page dashboard card -- so it's present,
          sticky, and height-matched to the sidebar on every page. Only the
          `children` in between changes as you navigate. */}
      <div className="hidden shrink-0 px-4 pb-4 md:block md:px-0 md:pb-0">
        <ProfileSummaryCard />
      </div>
    </div>
  );
}
