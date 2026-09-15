import AppShell from "@/components/layout/AppShell";

// Shared layout for every authenticated page (Dashboard, My Wallet, Invest,
// Transactions, etc. -- everything that used to individually wrap its own
// content in <AppShell>). Because this is a real Next.js layout instead of
// each page mounting its own AppShell, AppShell (and everything inside it
// -- the sidebar, TopBar, ProfileSummaryCard) stays mounted across
// client-side navigation between these pages instead of remounting on
// every route change. That remount was the root cause of the profile
// avatar/name flashing back to the placeholder on every page change: each
// mount reset React state to loading/null and re-ran the Supabase fetch
// from scratch. Only `children` (the routed page) swaps now.
export default function AppRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
