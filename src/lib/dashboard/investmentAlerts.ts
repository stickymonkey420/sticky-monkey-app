import type { InvestmentAlert } from "@/lib/types/dashboard";

// Ported 1:1 from the live Webflow Dashboard page's Investment Alert widget
// (head-code script, "ia-*" elements).

export function titleLine(a: InvestmentAlert): string {
  if (a.title) return a.title;
  const parts: string[] = [];
  if (a.ticker) parts.push(a.ticker);
  if (a.action) parts.push(a.action);
  if (parts.length) return parts.join(" ");
  return "Alert received";
}

export function descLine(a: InvestmentAlert): string {
  return a.description || a.message || "";
}

export function relTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  return days + "d ago";
}

export function formatPrice(price: number | string | null): string {
  if (price === null || price === undefined || price === "") return "";
  const n = Number(price);
  if (Number.isNaN(n)) return "";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
