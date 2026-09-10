"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SignOutButton from "./SignOutButton";

// Nested sidebar nav, ported to match the live Webflow site's real grouped
// structure (confirmed via Webflow's page list + a fetch of the live
// rendered sidebar HTML, not guessed from the screenshot alone). Left out
// on purpose:
//   - "Card Center" (My Wallet), "Accounts" (Invest), "Search"/"My
//     Business" (Businesses) -- these are real, non-draft Webflow pages
//     that just haven't been ported to this app yet. Add their Link once
//     each one is built, following the same page-by-page pattern as
//     everything else in this app.
//   - "Travel" (Businesses) -- the live site's own link is an unwired `#`
//     placeholder, not a real destination yet.
//   - "Game-a-Fi" -- its own SEO description calls it a "Director test
//     build," so it's held back pending a decision on whether it's meant
//     for every user or just admins.
//   - "Invoice List"/"Create Invoices" (confirmed unused template
//     boilerplate), and the generic Webflow template pages (Setting, FAQ,
//     404, 401, Changelog, License) -- none of these have real content.
type NavNode = { label: string; href?: string; children?: NavNode[] };

const NAV_TREE: NavNode[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/wallet", label: "My Wallet" },
  { href: "/income", label: "Income" },
  {
    label: "Trade Options",
    children: [
      { href: "/options", label: "Options" },
      { href: "/closed-positions", label: "Closed Positions" },
      { href: "/simulator", label: "Simulator" },
    ],
  },
  {
    label: "Invest",
    children: [
      { href: "/invest", label: "Portfolio" },
      { href: "/stock-screener", label: "Stock Screener" },
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
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Banking" },
  {
    label: "Utilities",
    children: [
      { href: "/edit-categories", label: "Edit Categories" },
      { href: "/update-api-key", label: "Update API Key" },
    ],
  },
  { href: "/investors", label: "Investors" },
  { href: "/users-groups", label: "Users & Groups" },
  { href: "/smu", label: "SMU" },
];

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
          <span>{node.label}</span>
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
      className={`block rounded-md py-2 pr-3 text-sm font-medium text-text-primary ${active ? "bg-white/5" : ""}`}
      style={{ paddingLeft: `${indent}px` }}
    >
      {node.label}
    </Link>
  );
}

function NavTree({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_TREE.map((node) => (
        <NavItem key={node.label + (node.href ?? "")} node={node} depth={0} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
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
              <NavTree pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="flex flex-col gap-1 px-3 pb-6">
              <SignOutButton />
            </div>
          </div>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 border-r border-card-border bg-card-bg md:flex md:flex-col">
        <div className="px-5 py-6 text-lg font-semibold text-text-primary">Sticky Monkey</div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
          <NavTree pathname={pathname} />
        </nav>
        <div className="flex flex-col gap-1 px-3 pb-4">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
