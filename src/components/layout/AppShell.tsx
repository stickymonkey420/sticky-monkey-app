"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Wallet,
  CircleDollarSign,
  TrendingUp,
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
import MarketStrip from "./MarketStrip";
import { ProfileProvider } from "@/lib/profile/ProfileProvider";
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
// Invest, but here "Investments" (Portfolio/Taxable/Retirement/Vault) is
// gated by "investOptIn" (see passesGate) -- paid tier always passes it,
// and free tier passes it only once the user has explicitly ticked at
// least one box under Profile > Account Types, per your call to open
// Investments up to free tier on an opt-in basis rather than keep it
// fully paid-gated -- and Stock Screener is meant to stay visible to free
// accounts unconditionally -- so it lives under the (also free-tier)
// Game-a-Fi group instead of inside Investments, since nesting it there
// would hide it whenever that group's gate fails. Everything else follows
// the live site's real
// nesting (confirmed off its accessibility tree, not a screenshot), except
// where reorganized per your explicit calls (Transactions folded into My
// Wallet, Utilities renamed Settings, Stock Screener moved under Game-a-Fi,
// plus the 2026-09 reorg below):
//   - "Income" was originally a paid-gated group containing the Income
//     overview page plus a "Trade Options" sub-group. Per your call, Trade
//     Options (Options/Closed Positions/Simulator) moved into Investments
//     instead -- new users look for options trading there, not under
//     Income -- so Income is now flattened to a single link (same
//     one-child-accordion-adds-no-value rule Owners/Users & Groups already
//     followed below), keeping its existing paid gate.
//   - "Settings" (Webflow/original label "Utilities") is a dropdown
//     containing Edit Categories (free) and Update API Key (admin) --
//     ungated at the group level so the free child still shows even though
//     its sibling doesn't.
//   - "Owners" (Webflow calls this page "Investors"; renamed here since
//     it's really about tracking company ownership, not app members) and
//     "Users & Groups" are each a real dropdown with exactly one child on
//     the live site; flattened here to single links since a 1-item
//     accordion adds a click for no benefit.
//   - Two plain divider rules (no label -- see the `divider` NavNode kind
//     below) now break the once-uniform 12-item list into three visual
//     bands per your call: money management (Dashboard through
//     Businesses), extras (Game-O-Fi, SMU), then settings/admin (Settings,
//     Owners, Users & Groups). Dividers carry no gate of their own -- they
//     always sit directly above an always-visible node (Game-O-Fi is
//     ungated; Settings always shows at least Edit Categories, which is
//     free) so there's no risk of a dangling divider with nothing after it.
// "My Wallet" is now also a group: "Overview" is the original wallet
// dashboard, "Bank Accounts" (formerly a separate top-level "Banking" link
// -- folded in here per your call, since it's the same "your money in
// accounts" concept as the rest of this group rather than a distinct
// top-level destination) keeps its own "bank" dataGate so it only shows
// once a bank_account row exists, "Card Center" (Webflow slug
// moneyfarm-webflow-html-website-template) is a real credit-card list/add/
// edit/delete screen over manual_accounts (category='credit_card') --
// viewing stays free (RLS SELECT has no role check, same as Bank
// Accounts), only add/edit/delete requires paid, shown inline on that page
// rather than hidden here.
//
// "Investments" now also has an "Accounts" child (href /invest-accounts,
// distinct from Banking's own /accounts) -- manages the account-level
// record (institution/name/balance) for brokerage, retirement, and
// precious-metal manual accounts, not the positions/vault items inside
// them. It has no separate in-page role check. The group's "investOptIn"
// gate on `requires` decides whether "Investments" shows AT ALL (paid
// tier always; free tier only once any Account Type box is ticked), but
// which specific leaves show underneath is a second, separate gate --
// `accountTypeAny` on Taxable's Brokerage/Crypto, Retirement's
// Traditional/Roth, and Vault -- that checks profiles.account_types
// directly and is NEVER bypassed by role. So a paid user who's only
// ticked Brokerage and Crypto sees Portfolio/Accounts/Taxable but not
// Retirement or Vault, exactly like a free user in the same state would;
// paid tier only buys entry into the group, not every leaf inside it.
// The Portfolio page (/invest) mirrors this: it only renders a donut card
// for an account type the user has actually ticked (see invest/page.tsx),
// same account_types-is-the-source-of-truth rule, independent of role.
// "Trade Options" (Options/Closed Positions/Simulator) lives inside this
// group too now (moved from Income per your call) and keeps its own
// `requires: "paid"` so it's still hidden from a free user who opted into
// Investments via account_types alone -- the investOptIn gate only buys
// entry into the group, options trading itself is still a paid feature.
//
// "Businesses" is a group: "Find a Gig" (Webflow's nav label was "Search",
// slug side-gigs) is a searchable directory over gig_categories (50 rows,
// 10 groups) that creates a user_businesses row when you pick one; "My
// Business" (slug my-business) manages that business's Clients, a Jobs
// board (Lead/Scheduled/In Progress/Completed/Cancelled), and a Scheduler.
// Both were confirmed as real, actively-used features (live data already
// in all four tables), not template boilerplate. None of their RLS
// policies have a paid/app_director check (unlike most of this app), but
// the group is nav-gated to paid per your explicit call to pull it from
// free tier -- same view-gated-above-RLS pattern Invest already uses.
// My Business's own "Invoices" sub-section (bill clients via "the
// existing invoicing tools") is left out -- it points at the Invoice
// List/Create Invoices Webflow pages, confirmed unused template
// boilerplate, so it's omitted rather than shipped as a dead link.
//
// "Game-O-Fi" (href /game-a-fi, group label renamed from "Game-a-Fi" per
// your call) was the live site's "Director test build"
// stub -- restructured per your explicit call into a fantasy-football-
// style weekly standings board (not head-to-head matchups): every
// member's real portfolio return % for the week sets their placement,
// plus a season-long cumulative standings tab. Shipped free-tier, same as
// Stock Screener. It reads from the existing net_worth_snapshots table
// (already populated by the daily snapshot-net-worth cron) via new
// SECURITY DEFINER SQL functions (game_afi_weekly_leaderboard /
// game_afi_season_leaderboard / game_afi_available_weeks, migration
// game_afi_leaderboard_phase1) that return only {user_id, display_name,
// pct_return, rank} -- no member's raw dollar balance is ever exposed to
// anyone else, so this replaces (rather than reuses) the old
// app_director-only RLS on game_players/game_watchlist, which are left
// untouched and unused for now. Phase 2 (components/gameAfi/PaperTrading*)
// added a $10,000 paper-trading competition alongside it -- $ amounts are
// fine to show there since nothing real is at risk -- and its "Overview"
// nav leaf (see app/(app)/game-a-fi-overview/page.tsx, merged from the old
// standalone "Holdings" leaf per your call) surfaces that match's positions
// plus Allocation/Industry Concentration donuts on their own page.
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
// ('paid','app_director') to WRITE, but their SELECT policies have no role
// check at all (just auth.uid() = user_id) -- confirmed via
// pg_policies -- which is what makes the "investOptIn" gate on Investments
// safe: a free user who opts in can actually read their own (likely still
// empty) positions/metal_holdings rows, they just can't write to them yet,
// same as every other free-tier page here. `manual_accounts` has the same
// write restriction and is used more broadly (Banking, Card Center) where
// viewing is meant to stay free -- those pages gate add/edit/delete
// inline instead of hiding the whole nav entry. "admin" means
// app_director/support/developer -- staff roles that are not
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
  // "investOptIn" is like "paid" but with an escape hatch: a free-tier user
  // still passes it once they've explicitly ticked at least one box under
  // Profile > Account Types (profiles.account_types) -- see passesGate.
  requires?: "paid" | "admin" | "owner" | "investOptIn";
  // Independent of `requires` and NOT bypassed by paid tier: this leaf (or
  // group) only shows once profiles.account_types includes at least one of
  // these keys -- e.g. the "Brokerage" leaf under Investments > Taxable
  // only shows once the user has actually ticked "Brokerage (Taxable)" in
  // their profile, whether they're free or paid. Ticking a box is what
  // surfaces that specific account type everywhere (nav leaf here, donut
  // card on the Portfolio page) -- role only gates the "Investments" group
  // as a whole, not which account types inside it are visible.
  accountTypeAny?: string[];
  // Hides this node until AppShell confirms there's real DATA behind it --
  // distinct from `requires` (role) and `accountTypeAny` (a profile
  // checkbox): "wallet" hides "My Wallet" until manual_accounts (any
  // category) or plaid_transactions has at least one row for this member;
  // "bank" hides "Banking" until manual_accounts has a "bank_account" row
  // specifically, per your call that a bank account being connected is
  // what should surface that nav item. null (not yet loaded) hides the
  // node, same "hide until known" rule role/accountTypes already use.
  dataGate?: "wallet" | "bank";
  icon?: LucideIcon;
  // A plain unlabeled separator rule rather than a real nav entry -- see
  // the 2026-09 reorg note above. Carries no gate of its own and needs no
  // href/children/icon; NavTree renders it as a divider instead of a
  // NavItem, and filterNode passes it through untouched (all its gate
  // checks are no-ops on a node with none of requires/accountTypeAny/
  // dataGate/children set).
  divider?: true;
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
    dataGate: "wallet",
    children: [
      { href: "/wallet", label: "Overview" },
      { href: "/accounts", label: "Bank Accounts", dataGate: "bank" },
      { href: "/card-center", label: "Card Center" },
      { href: "/transactions", label: "Transactions" },
    ],
  },
  {
    label: "Investments",
    icon: TrendingUp,
    requires: "investOptIn",
    children: [
      { href: "/invest", label: "Portfolio" },
      { href: "/invest-accounts", label: "Accounts" },
      {
        label: "Taxable",
        children: [
          { href: "/holdings?account=brokerage", label: "Brokerage", accountTypeAny: ["brokerage"] },
          { href: "/holdings?account=crypto", label: "Crypto", accountTypeAny: ["crypto"] },
        ],
      },
      {
        label: "Retirement",
        children: [
          { href: "/holdings?account=traditional", label: "Traditional IRA", accountTypeAny: ["traditional"] },
          { href: "/holdings?account=roth", label: "Roth IRA", accountTypeAny: ["roth"] },
        ],
      },
      { href: "/invest#vault-section", label: "Vault", accountTypeAny: ["metals", "sdira"] },
      {
        label: "Trade Options",
        requires: "paid",
        children: [
          { href: "/options", label: "Options" },
          { href: "/closed-positions", label: "Closed Positions" },
          { href: "/simulator", label: "Simulator" },
        ],
      },
    ],
  },
  { href: "/income", label: "Income", icon: CircleDollarSign, requires: "paid" },
  {
    label: "Businesses",
    icon: Briefcase,
    requires: "paid",
    children: [
      { href: "/side-gigs", label: "Find a Gig" },
      { href: "/my-business", label: "My Business" },
    ],
  },
  { label: "", divider: true },
  {
    label: "Game-O-Fi",
    icon: Trophy,
    children: [
      { href: "/game-a-fi-overview", label: "Overview" },
      { href: "/stock-screener", label: "Screener" },
      { href: "/game-a-fi", label: "Standings" },
    ],
  },
  { href: "/smu", label: "SMU", icon: FileText },
  { label: "", divider: true },
  {
    label: "Settings",
    icon: Wrench,
    children: [
      { href: "/edit-categories", label: "Edit Categories" },
      { href: "/update-api-key", label: "Update API Key", requires: "owner" }, // App Director only (2026-09-23)
    ],
  },
  { href: "/investors", label: "Owners", requires: "owner", icon: Crown },
  { href: "/users-groups", label: "Users & Groups", requires: "admin", icon: ShieldCheck },
];

function passesGate(requires: NavNode["requires"], role: Role | null, accountTypes: string[] | null): boolean {
  if (!requires) return true;
  if (requires === "investOptIn") {
    if (role === "paid" || role === "app_director") return true;
    // Free tier: only once the user has explicitly ticked at least one
    // Account Type in their profile -- see MyProfileModal's "Account
    // Types" section. Hidden (not shown-then-yanked) until accountTypes
    // has actually loaded, same "hide until known" rule as role below.
    return !!accountTypes && accountTypes.length > 0;
  }
  if (!role) return false; // role not loaded yet -- hide gated items until known, never flash them
  if (requires === "owner") return role === "app_director"; // company ownership, not staff/support access
  if (requires === "admin") return role === "app_director" || role === "support" || role === "developer";
  if (requires === "paid") return role === "paid" || role === "app_director";
  return true;
}

// Recursive: a group with `requires` is dropped whole (no need to also
// check children); an ungated group is kept only if at least one child
// survives filtering.
// accountTypeAny is a hard requirement, never bypassed by role -- unlike
// `requires`, paid tier does not skip it. Only "not yet loaded" (null)
// counts as unknown/hidden; an empty [] (loaded, nothing ticked) fails it.
function passesAccountTypeGate(accountTypeAny: string[] | undefined, accountTypes: string[] | null): boolean {
  if (!accountTypeAny) return true;
  return !!accountTypes && accountTypeAny.some((t) => accountTypes.includes(t));
}

// hasWalletData/hasBankAccount are null until AppShell's fetch resolves --
// same "hide until known" treatment as role/accountTypes above, so these
// two nodes never flash visible then disappear once the real answer comes
// back.
function passesDataGate(
  dataGate: NavNode["dataGate"],
  hasWalletData: boolean | null,
  hasBankAccount: boolean | null
): boolean {
  if (!dataGate) return true;
  if (dataGate === "wallet") return hasWalletData === true;
  if (dataGate === "bank") return hasBankAccount === true;
  return true;
}

function filterNode(
  node: NavNode,
  role: Role | null,
  accountTypes: string[] | null,
  hasWalletData: boolean | null,
  hasBankAccount: boolean | null
): NavNode | null {
  if (!passesGate(node.requires, role, accountTypes)) return null;
  if (!passesAccountTypeGate(node.accountTypeAny, accountTypes)) return null;
  if (!passesDataGate(node.dataGate, hasWalletData, hasBankAccount)) return null;
  if (node.children) {
    const children = node.children
      .map((c) => filterNode(c, role, accountTypes, hasWalletData, hasBankAccount))
      .filter((c): c is NavNode => c !== null);
    if (children.length === 0 && !node.href) return null;
    return { ...node, children };
  }
  return node;
}

// Hash is stripped for matching; the query string (when the href has one)
// is matched too -- the four Holdings deep links
// (?account=brokerage/crypto/traditional/roth) all resolve to the same
// /holdings pathname, and that param now persists in the URL as real
// filter state (see holdings/page.tsx) instead of being scrubbed, so each
// link's own account= value is compared against the current URL's rather
// than just matching on pathname. A href with no query string (every
// other nav link) still matches on pathname alone.
function hrefPath(href: string): string {
  return href.split(/[?#]/)[0];
}

function hrefQuery(href: string): string | null {
  const match = href.match(/\?([^#]*)/);
  return match ? match[1] : null;
}

function isLeafActive(href: string, pathname: string, search: string): boolean {
  const path = hrefPath(href);
  const pathMatches = pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) return false;
  const query = hrefQuery(href);
  if (!query) return true;
  const hrefParams = new URLSearchParams(query);
  const currentParams = new URLSearchParams(search);
  for (const [key, value] of hrefParams) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

function containsActive(node: NavNode, pathname: string, search: string): boolean {
  if (node.href) return isLeafActive(node.href, pathname, search);
  if (node.children) return node.children.some((c) => containsActive(c, pathname, search));
  return false;
}

// Every leaf nav link gets a stable, derivable DOM id -- "nav-" plus the
// href with "/", "?", "#", "=" collapsed to "-" (e.g. "/holdings?account=
// brokerage" -> "nav-holdings-account-brokerage"). This is what lets the
// Abu chatbot (components/chat/AbuChatWidget.tsx) highlight ANY sidebar
// menu item the user asks about, not just a hand-picked few: the abu-chat
// Edge Function's NAV_REGISTRY uses this exact same derivation for its
// highlight keys (kept in sync by convention, documented there), and
// AbuChatWidget's highlightCards() falls back to a plain
// document.getElementById(key) for any key that isn't one of its own
// page-specific card ids -- so a "nav-*" key just resolves straight to
// this id with no extra per-item wiring needed on this end. Replaces the
// old one-off `id={node.href === "/income" ? "income-nav-link" : ...}`
// special case.
function navLinkId(href: string): string {
  return "nav-" + href.replace(/^\//, "").replace(/[/?#=]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

function NavItem({
  node,
  depth,
  pathname,
  search,
  onNavigate,
}: {
  node: NavNode;
  depth: number;
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const hasActiveChild = node.children ? containsActive(node, pathname, search) : false;
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
                search={search}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const active = isLeafActive(node.href!, pathname, search);
  return (
    <Link
      href={node.href!}
      onClick={onNavigate}
      // Targeted by the Abu chatbot's highlight feature -- see navLinkId
      // above and components/chat/AbuChatWidget.tsx.
      id={navLinkId(node.href!)}
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

function NavTree({
  pathname,
  search,
  role,
  accountTypes,
  hasWalletData,
  hasBankAccount,
  onNavigate,
}: {
  pathname: string;
  search: string;
  role: Role | null;
  accountTypes: string[] | null;
  hasWalletData: boolean | null;
  hasBankAccount: boolean | null;
  onNavigate?: () => void;
}) {
  const visible = NAV_TREE.map((node) => filterNode(node, role, accountTypes, hasWalletData, hasBankAccount)).filter(
    (n): n is NavNode => n !== null
  );
  return (
    <>
      {visible.map((node, i) =>
        node.divider ? (
          // Plain unlabeled section break -- see the 2026-09 nav reorg note
          // above NAV_TREE. Never gated itself; both dividers are placed
          // directly above an always-visible node so there's no dangling
          // rule with nothing below it.
          <div key={`divider-${i}`} className="my-1 border-t border-white/10" />
        ) : (
          <NavItem
            key={node.label + (node.href ?? "")}
            node={node}
            depth={0}
            pathname={pathname}
            search={search}
            onNavigate={onNavigate}
          />
        )
      )}
    </>
  );
}

// useSearchParams() is what makes nav-active-highlighting reactive to
// account= changes on /holdings (see isLeafActive/hrefQuery above) --
// clicking Brokerage after Crypto needs the sidebar to re-evaluate which
// link matches even though the pathname itself doesn't change. It
// requires a Suspense boundary for production builds, so the real work
// lives in AppShellInner and the exported AppShell just wraps it (same
// pattern as holdings/page.tsx).
function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Fetched once per page load (AppShell isn't a shared layout -- every
  // page mounts its own instance -- so this is a cheap single-row lookup,
  // same cost profile as the role checks already done independently on
  // Investors/Users & Groups). Starts null so gated items stay hidden
  // rather than flashing before the role is known.
  const [role, setRole] = useState<Role | null>(null);
  // account_types drives the "investOptIn" nav gate above -- null (not yet
  // loaded) is deliberately distinct from [] (loaded, nothing ticked) so
  // passesGate hides Investments until we actually know, not just while
  // this fetch is in flight.
  const [accountTypes, setAccountTypes] = useState<string[] | null>(null);
  // Backs the "My Wallet"/"Banking" dataGate nodes above -- null until this
  // fetch resolves (hides both), then real answers: hasWalletData is true
  // once manual_accounts (any category) or plaid_transactions has a row;
  // hasBankAccount specifically needs a manual_accounts row categorized
  // "bank_account".
  const [hasWalletData, setHasWalletData] = useState<boolean | null>(null);
  const [hasBankAccount, setHasBankAccount] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data }, { data: accountRows }, { count: txCount }] = await Promise.all([
        supabase.from("profiles").select("role,account_types").eq("id", user.id).maybeSingle(),
        supabase.from("manual_accounts").select("category").eq("user_id", user.id),
        supabase.from("plaid_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (data) {
        const row = data as { role: Role; account_types: string[] | null };
        setRole(row.role);
        setAccountTypes(row.account_types ?? []);
      }
      const accounts = (accountRows ?? []) as { category: string }[];
      setHasBankAccount(accounts.some((a) => a.category === "bank_account"));
      setHasWalletData(accounts.length > 0 || (txCount ?? 0) > 0);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProfileProvider>
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
              <NavTree
                pathname={pathname}
                search={search}
                role={role}
                accountTypes={accountTypes}
                hasWalletData={hasWalletData}
                hasBankAccount={hasBankAccount}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <div className="flex flex-col gap-1 px-3 pb-6">
              <SignOutButton />
            </div>
          </div>
        </div>
      )}

      {/* Matches the live Webflow sidebar: the logo sits directly on the
          page background (no card behind it), and the dark rgb(21,27,40)/
          30px-radius card starts below it, containing only the nav +
          sign-out. The wrapper is at least one screen tall and grows with
          its content (no inner scrollbar, nothing hidden); both side panels
          stretch to the page height so they still match. */}
      <div className="hidden min-h-[calc(100vh-2rem)] w-64 shrink-0 flex-col gap-10 md:flex">
        {/* Sizes/spacing pulled via getComputedStyle off the live site's
            .logo-wrapper: 64px-tall head icon, 188px-wide wordmark, a
            25px/1px divider rule, then the FINANCE label at 13px/300
            weight/0.35em tracking -- not the placeholder sizes this used
            before. */}
        <div className="flex shrink-0 flex-col items-center px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_HEAD_URL} alt="" className="mb-0.5 h-16 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_WORDMARK_URL} alt="Sticky Monkey" className="h-auto w-[188px]" />
          <div className="mb-2 h-px w-[25px]" style={{ backgroundColor: "rgba(255,255,255,0.25)" }} />
          <span className="text-[13px] font-light tracking-[0.35em] text-text-muted">FINANCE</span>
        </div>

        <aside
          className="flex flex-1 flex-col gap-4 rounded-[30px] p-4"
          style={{ backgroundColor: "#151b28" }}
        >
          <nav className="flex flex-1 flex-col gap-1 px-1">
            <NavTree
              pathname={pathname}
              search={search}
              role={role}
              accountTypes={accountTypes}
              hasWalletData={hasWalletData}
              hasBankAccount={hasBankAccount}
            />
          </nav>

          <div className="flex flex-col gap-1 px-1">
            <SignOutButton />
          </div>
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="hidden md:block">
          <TopBar />
        </div>
        <main className="relative flex-1 px-4 pb-6 pt-6 md:px-8 md:pt-5">
          <MarketStrip />
          {children}
        </main>
      </div>

      {/* Profile panel now lives in the shared shell (like the sidebar)
          instead of being a per-page dashboard card -- so it's present,
          sticky, and height-matched to the sidebar on every page. Only the
          `children` in between changes as you navigate. */}
      <div className="hidden shrink-0 px-4 pb-4 md:flex md:px-0 md:pb-0">
        <ProfileSummaryCard />
      </div>
    </div>
    </ProfileProvider>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-text-muted">Loading…</div>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
