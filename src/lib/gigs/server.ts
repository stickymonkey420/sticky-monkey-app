// SERVER ONLY (imported by API routes; uses the service-role client).
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGigConfig } from "./registry";
import { rowFields, type GigCollection, type RecordData } from "./schema";

// Server-side sync for gig integrations (service-role client only).
// Printful (API token + webhook), Shopify order webhooks, and listing
// calendars (iCal). All write into the business's config collections and
// keep income/expense in step with the config, so Taxes stays right.

export type BizRow = { id: string; user_id: string; category_name: string };

export function collectionFor(categoryName: string, key: string): GigCollection | null {
  return getGigConfig(categoryName)?.collections.find((c) => c.key === key) ?? null;
}

// Insert or merge one record by (business, collection, external_id). Only
// non-empty patch values overwrite; `keep` keys are never overwritten once set.
export async function upsertExternal(
  admin: SupabaseClient,
  biz: BizRow,
  col: GigCollection,
  externalId: string,
  patch: RecordData,
  source: string,
  keep: string[] = []
): Promise<"added" | "updated"> {
  const clean: RecordData = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== null && v !== "") clean[k] = v;
  const { data: existing } = await admin
    .from("gig_records")
    .select("id,data")
    .eq("business_id", biz.id)
    .eq("collection", col.key)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) {
    const prev = (existing.data as RecordData) ?? {};
    const merged: RecordData = { ...prev };
    for (const [k, v] of Object.entries(clean)) {
      if (keep.includes(k) && prev[k] != null && prev[k] !== "") continue;
      merged[k] = v;
    }
    const { error } = await admin
      .from("gig_records")
      .update({ data: merged, ...rowFields(col, merged), updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return "updated";
  }
  const { error } = await admin.from("gig_records").insert({
    user_id: biz.user_id,
    business_id: biz.id,
    collection: col.key,
    data: clean,
    ...rowFields(col, clean),
    external_id: externalId,
    source,
  });
  if (error) throw new Error(error.message);
  return "added";
}

const money = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};
const dayOf = (v: unknown): string | undefined => {
  if (typeof v === "number") return new Date(v * 1000).toISOString().slice(0, 10);
  if (typeof v === "string" && v) {
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? undefined : t.toISOString().slice(0, 10);
  }
  return undefined;
};

// ---------- Printful ----------

const PF = "https://api.printful.com";

export async function printfulFetch(token: string, path: string, init: RequestInit = {}, storeId?: string | number | null) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (storeId) headers["X-PF-Store-Id"] = String(storeId);
  const res = await fetch(`${PF}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { code?: number; result?: unknown; error?: { message?: string }; paging?: { total?: number } } | null;
  if (!res.ok || (j?.code && j.code >= 400)) {
    throw new Error(j?.error?.message || (typeof j?.result === "string" ? j.result : "") || `Printful error ${res.status}`);
  }
  return j;
}

const PF_STATUS: Record<string, string> = {
  draft: "Pending",
  pending: "Pending",
  inreview: "Pending",
  inprocess: "In production",
  onhold: "On hold",
  partial: "Shipped",
  fulfilled: "Shipped",
  archived: "Shipped",
  canceled: "Canceled",
  cancelled: "Canceled",
  failed: "Failed",
};

type PfOrder = {
  id: number;
  external_id?: string | null;
  status?: string;
  created?: number;
  recipient?: { name?: string };
  items?: { name?: string; quantity?: number }[];
  costs?: { subtotal?: string; discount?: string; shipping?: string; tax?: string; vat?: string; total?: string };
  retail_costs?: { subtotal?: string | null; discount?: string | null; shipping?: string | null; total?: string | null };
  shipments?: { tracking_url?: string; ship_date?: string }[];
};

// Same external id for Printful and Shopify copies of one order when the
// Printful order carries the marketplace order id (Shopify/Etsy/WooCommerce
// integrations do), so the two merge into one row.
export function printfulExternalId(o: PfOrder): string {
  return o.external_id ? `ext-${o.external_id}` : `pf-${o.id}`;
}

export function printfulOrderData(o: PfOrder, channel?: string): RecordData {
  const c = o.costs ?? {};
  const rc = o.retail_costs ?? {};
  const itemCost = (money(c.subtotal) ?? 0) - (money(c.discount) ?? 0) + (money(c.tax) ?? 0) + (money(c.vat) ?? 0);
  const ship = (o.shipments ?? []).find((s) => s.tracking_url) ?? (o.shipments ?? [])[0];
  const retailItems = rc.subtotal != null ? (money(rc.subtotal) ?? 0) - (money(rc.discount) ?? 0) : undefined;
  return {
    order_no: o.external_id ? `#${o.external_id}` : `PF-${o.id}`,
    order_date: dayOf(o.created),
    customer: o.recipient?.name,
    product: (o.items ?? []).map((i) => `${i.name ?? "Item"}${(i.quantity ?? 1) > 1 ? ` x${i.quantity}` : ""}`).join(", ").slice(0, 300) || undefined,
    channel,
    sale_total: retailItems,
    shipping_charged: money(rc.shipping),
    item_cost: Math.round(itemCost * 100) / 100,
    shipping_cost: money(c.shipping),
    status: PF_STATUS[(o.status ?? "").toLowerCase()] ?? undefined,
    tracking_url: ship?.tracking_url,
    external_ref: String(o.id),
  };
}

const PF_CHANNEL: Record<string, string> = { shopify: "Shopify", etsy: "Etsy", native: "Printful store", woocommerce: "Website", tiktok: "TikTok Shop" };
export const printfulChannel = (storeType: unknown) => PF_CHANNEL[String(storeType ?? "").toLowerCase()] ?? undefined;

export async function printfulSync(admin: SupabaseClient, biz: BizRow, token: string, storeId: string | number | null, storeType?: string): Promise<{ added: number; updated: number }> {
  const col = collectionFor(biz.category_name, "orders");
  if (!col) throw new Error("This business type has no Orders tab.");
  let added = 0;
  let updated = 0;
  // Newest first; 5 pages x 100 = last 500 orders per manual sync.
  for (let offset = 0; offset < 500; offset += 100) {
    const j = await printfulFetch(token, `/orders?offset=${offset}&limit=100`, {}, storeId);
    const orders = (Array.isArray(j?.result) ? j.result : []) as PfOrder[];
    for (const o of orders) {
      const r = await upsertExternal(admin, biz, col, printfulExternalId(o), printfulOrderData(o, printfulChannel(storeType)), "printful", ["customer", "order_no", "channel"]);
      if (r === "added") added++;
      else updated++;
    }
    if (orders.length < 100) break;
  }
  return { added, updated };
}

export const PRINTFUL_WEBHOOK_TYPES = [
  "order_created",
  "order_updated",
  "order_failed",
  "order_canceled",
  "order_put_hold",
  "order_remove_hold",
  "package_shipped",
  "package_returned",
];

// ---------- Shopify ----------

export function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

type ShopifyOrder = {
  id: number;
  name?: string;
  created_at?: string;
  subtotal_price?: string;
  total_discounts?: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  customer?: { first_name?: string; last_name?: string } | null;
  billing_address?: { name?: string } | null;
  shipping_address?: { name?: string } | null;
  line_items?: { title?: string; quantity?: number }[];
  financial_status?: string | null;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
};

export function shopifyOrderData(o: ShopifyOrder, dropship: boolean): { data: RecordData; strongStatus: boolean } {
  const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.shipping_address?.name || o.billing_address?.name;
  let status: string | undefined;
  let strongStatus = true;
  if (o.cancelled_at) status = "Canceled";
  else if (o.financial_status === "refunded") status = dropship ? "Refunded" : "Returned";
  else if (o.fulfillment_status === "fulfilled") status = "Shipped";
  else {
    status = dropship ? "New" : "Pending";
    strongStatus = false; // don't downgrade a status Printful / the user already set
  }
  return {
    data: {
      order_no: o.name ?? `#${o.id}`,
      order_date: dayOf(o.created_at),
      customer: name || undefined,
      product: (o.line_items ?? []).map((i) => `${i.title ?? "Item"}${(i.quantity ?? 1) > 1 ? ` x${i.quantity}` : ""}`).join(", ").slice(0, 300) || undefined,
      channel: "Shopify",
      sale_total: money(o.subtotal_price),
      shipping_charged: money(o.total_shipping_price_set?.shop_money?.amount),
      status,
    },
    strongStatus,
  };
}

// ---------- iCal (Airbnb / VRBO / Booking.com) ----------

const ICAL_HOSTS = [/(^|\.)airbnb\.[a-z.]+$/i, /(^|\.)vrbo\.com$/i, /(^|\.)homeaway\.[a-z.]+$/i, /(^|\.)booking\.com$/i];

export function validIcalUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return ICAL_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

export type IcalEvent = { uid: string; start: string; end: string; summary: string; description: string };

export function parseIcal(text: string): IcalEvent[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const l of lines) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && unfolded.length) unfolded[unfolded.length - 1] += l.slice(1);
    else unfolded.push(l);
  }
  const out: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;
  const toDay = (v: string) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  };
  for (const l of unfolded) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT") {
      if (cur?.uid && cur.start) out.push({ uid: cur.uid, start: cur.start, end: cur.end ?? cur.start, summary: cur.summary ?? "", description: cur.description ?? "" });
      cur = null;
    } else if (cur) {
      const i = l.indexOf(":");
      if (i < 0) continue;
      const name = l.slice(0, i).split(";")[0].toUpperCase();
      const value = l.slice(i + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";");
      if (name === "UID") cur.uid = value;
      else if (name === "DTSTART") cur.start = toDay(value);
      else if (name === "DTEND") cur.end = toDay(value);
      else if (name === "SUMMARY") cur.summary = value;
      else if (name === "DESCRIPTION") cur.description = value;
    }
  }
  return out;
}

export async function icalSync(admin: SupabaseClient, biz: BizRow, url: URL, listingId?: string | null): Promise<{ added: number; updated: number; canceled: number }> {
  const col = collectionFor(biz.category_name, "reservations");
  if (!col) throw new Error("This business type has no Reservations tab.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let text: string;
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
    text = (await res.text()).slice(0, 2_000_000);
  } finally {
    clearTimeout(timer);
  }
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar (.ics).");
  const platform = /airbnb/i.test(url.hostname) ? "Airbnb" : /booking/i.test(url.hostname) ? "Booking.com" : "VRBO";
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const ev of parseIcal(text)) {
    if (/not available|blocked|closed/i.test(ev.summary)) continue;
    const code = ev.description.match(/details\/([A-Z0-9]{6,})/)?.[1] ?? ev.description.match(/\b(HM[A-Z0-9]{6,})\b/)?.[1] ?? null;
    const externalId = code ? `ref-${code}` : `ical-${ev.uid}`;
    seen.add(externalId);
    const status = ev.end <= today ? "Completed" : ev.start <= today ? "Checked in" : "Booked";
    const guest = /^reserved$/i.test(ev.summary.trim()) || !ev.summary.trim() ? `${platform} guest` : ev.summary.trim();
    const r = await upsertExternal(
      admin,
      biz,
      col,
      externalId,
      { guest, platform, check_in: ev.start, check_out: ev.end, status, external_ref: code ?? undefined, listing: listingId ?? undefined },
      "ical",
      ["guest", "listing"]
    );
    if (r === "added") added++;
    else updated++;
  }
  // Future stays that were synced before but vanished from the calendar were canceled.
  let canceled = 0;
  const { data: future } = await admin
    .from("gig_records")
    .select("id,data,external_id")
    .eq("business_id", biz.id)
    .eq("collection", col.key)
    .eq("source", "ical")
    .gte("record_date", today);
  for (const r of future ?? []) {
    if (!r.external_id || seen.has(r.external_id)) continue;
    const d = r.data as RecordData;
    if (d.status === "Canceled") continue;
    const merged = { ...d, status: "Canceled" };
    await admin.from("gig_records").update({ data: merged, ...rowFields(col, merged), updated_at: new Date().toISOString() }).eq("id", r.id);
    canceled++;
  }
  return { added, updated, canceled };
}
