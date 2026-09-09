import Link from "next/link";
import SignOutButton from "./SignOutButton";

/**
 * Minimal authenticated-app shell for the ported pages: a slim left nav +
 * content area. This is intentionally lightweight for the first
 * proof-of-concept slice (Dashboard only) -- it is NOT a port of the full
 * Webflow sidebar (which has ~40 links). More nav items get added as more
 * pages are ported.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {/* Mobile top bar: below the md breakpoint the desktop sidebar (with
          nav + sign out) is hidden, so this is the only way to navigate or
          sign out on a narrow window/phone. */}
      <header className="flex items-center justify-between border-b border-card-border bg-card-bg px-4 py-3 md:hidden">
        <span className="text-base font-semibold text-text-primary">Sticky Monkey</span>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-primary"
          >
            Dashboard
          </Link>
          <Link
            href="/options"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-primary"
          >
            Options
          </Link>
          <SignOutButton />
        </div>
      </header>
      <aside className="hidden w-56 shrink-0 border-r border-card-border bg-card-bg md:flex md:flex-col">
        <div className="px-5 py-6 text-lg font-semibold text-text-primary">
          Sticky Monkey
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-primary bg-white/5"
          >
            Dashboard
          </Link>
          <Link
            href="/options"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-primary"
          >
            Options
          </Link>
        </nav>
        <div className="flex flex-col gap-1 px-3 pb-4">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
