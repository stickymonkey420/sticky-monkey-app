import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGigConfig } from "@/lib/gigs/registry";
import {
  icalSync,
  printfulFetch,
  printfulSync,
  PRINTFUL_WEBHOOK_TYPES,
  validIcalUrl,
  type BizRow,
} from "@/lib/gigs/server";

// Gig workspace integrations (signed-in owner of the business only).
// Secrets go to gig_integration_secrets (RLS on, no policies: service role
// only) and are never returned to the browser.
//   printful_connect { token }       verify token, register webhook, first sync
//   printful_sync                     pull recent orders
//   shopify_setup { secret? }         create webhook link / save signing secret
//   ical_sync { url?, listingId? }    save calendar link and import reservations
//   disconnect { provider }

type Body = { action?: string; businessId?: string; token?: string; secret?: string; url?: string; listingId?: string; provider?: string };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Body;
    if (!body.businessId || !body.action) return bad("Missing businessId or action");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return bad("Not signed in", 401);
    // RLS scopes this to the caller's own businesses.
    const { data: biz } = await supabase.from("user_businesses").select("id,user_id,category_name").eq("id", body.businessId).eq("user_id", user.id).maybeSingle();
    if (!biz) return bad("Business not found", 404);
    const config = getGigConfig(biz.category_name);
    if (!config) return bad("This business type has no integrations.");
    const allowed = new Set((config.integrations ?? []).map((i) => (i.kind === "shopify_webhook" ? "shopify" : i.kind)));

    const admin = createAdminClient();
    const origin = new URL(request.url).origin;
    const getRow = async (provider: string) =>
      (await admin.from("gig_integrations").select("*").eq("business_id", biz.id).eq("provider", provider).maybeSingle()).data as
        | { id: string; webhook_token: string; settings: Record<string, unknown>; status: string }
        | null;
    const ensureRow = async (provider: string) => {
      const existing = await getRow(provider);
      if (existing) return existing;
      const { data, error } = await admin.from("gig_integrations").insert({ user_id: user.id, business_id: biz.id, provider }).select("*").single();
      if (error || !data) throw new Error(error?.message ?? "Couldn't create integration");
      return data as { id: string; webhook_token: string; settings: Record<string, unknown>; status: string };
    };
    const getSecret = async (id: string) => (await admin.from("gig_integration_secrets").select("secret").eq("integration_id", id).maybeSingle()).data?.secret as string | undefined;
    const setSecret = async (id: string, secret: string) => {
      const { error } = await admin.from("gig_integration_secrets").upsert({ integration_id: id, secret, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    };
    const bizRow = biz as BizRow;

    switch (body.action) {
      case "printful_connect": {
        if (!allowed.has("printful")) return bad("Printful isn't available for this business type.");
        const token = (body.token ?? "").trim();
        if (token.length < 20) return bad("That doesn't look like a Printful token.");
        const stores = await printfulFetch(token, "/stores").catch((e: Error) => {
          throw new Error(`Printful rejected the token: ${e.message}`);
        });
        const list = (Array.isArray(stores?.result) ? stores.result : []) as { id: number; name?: string; type?: string }[];
        const store = list[0];
        if (!store) return bad("No Printful store found for that token.");
        const row = await ensureRow("printful");
        await setSecret(row.id, token);
        const hookUrl = `${origin}/api/webhooks/gig/printful/${row.webhook_token}`;
        let hookError: string | null = null;
        try {
          await printfulFetch(token, "/webhooks", { method: "POST", body: JSON.stringify({ url: hookUrl, types: PRINTFUL_WEBHOOK_TYPES }) }, store.id);
        } catch (e) {
          hookError = `Live updates not enabled: ${(e as Error).message}. Give the token the Webhooks scope, or use Sync now.`;
        }
        const settings = { store_id: store.id, store_name: store.name ?? null, store_type: store.type ?? null, stores_available: list.length };
        await admin.from("gig_integrations").update({ settings, status: "active", last_error: hookError }).eq("id", row.id);
        let synced = "";
        try {
          const r = await printfulSync(admin, bizRow, token, store.id, store.type);
          synced = ` Imported ${r.added} new and updated ${r.updated} orders.`;
          await admin.from("gig_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", row.id);
        } catch (e) {
          await admin.from("gig_integrations").update({ last_error: `Sync failed: ${(e as Error).message}` }).eq("id", row.id);
        }
        return NextResponse.json({ ok: true, message: `Connected to ${store.name ?? "your Printful store"}.${synced}` });
      }
      case "printful_sync": {
        const row = await getRow("printful");
        if (!row) return bad("Printful isn't connected.");
        const token = await getSecret(row.id);
        if (!token) return bad("Printful token missing. Disconnect and connect again.");
        try {
          const r = await printfulSync(admin, bizRow, token, (row.settings.store_id as number) ?? null, row.settings.store_type as string | undefined);
          await admin.from("gig_integrations").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "active" }).eq("id", row.id);
          return NextResponse.json({ ok: true, message: `Imported ${r.added} new and updated ${r.updated} orders.` });
        } catch (e) {
          await admin.from("gig_integrations").update({ last_error: `Sync failed: ${(e as Error).message}` }).eq("id", row.id);
          return bad(`Sync failed: ${(e as Error).message}`, 502);
        }
      }
      case "shopify_setup": {
        if (!allowed.has("shopify")) return bad("Shopify isn't available for this business type.");
        const row = await ensureRow("shopify");
        const secret = (body.secret ?? "").trim();
        if (secret) {
          if (secret.length < 16) return bad("That doesn't look like a Shopify signing secret.");
          await setSecret(row.id, secret);
          await admin.from("gig_integrations").update({ status: "active", last_error: null }).eq("id", row.id);
          return NextResponse.json({ ok: true, message: "Signing secret saved. New Shopify orders will appear in Orders." });
        }
        return NextResponse.json({ ok: true, message: "Webhook link created. Add it in Shopify, then save the signing secret." });
      }
      case "ical_sync": {
        if (!allowed.has("ical")) return bad("Calendar sync isn't available for this business type.");
        const existing = await getRow("ical");
        const rawUrl = (body.url ?? "").trim() || (existing ? await getSecret(existing.id) : undefined);
        if (!rawUrl) return bad("Paste your calendar export link.");
        const url = validIcalUrl(rawUrl);
        if (!url) return bad("Use the calendar export link from Airbnb, VRBO or Booking.com.");
        const row = await ensureRow("ical");
        // The export link is a private credential (anyone with it can read your calendar), so it's kept with the secrets.
        if (body.url) await setSecret(row.id, url.toString());
        const listingId = body.listingId || (row.settings.listing_id as string | undefined) || null;
        try {
          const r = await icalSync(admin, bizRow, url, listingId);
          await admin
            .from("gig_integrations")
            .update({ status: "active", last_sync_at: new Date().toISOString(), last_error: null, settings: { ...row.settings, host: url.hostname, listing_id: listingId } })
            .eq("id", row.id);
          return NextResponse.json({ ok: true, message: `Calendar synced: ${r.added} new, ${r.updated} updated${r.canceled ? `, ${r.canceled} marked canceled` : ""}.` });
        } catch (e) {
          await admin.from("gig_integrations").update({ last_error: (e as Error).message }).eq("id", row.id);
          return bad((e as Error).message, 502);
        }
      }
      case "disconnect": {
        const provider = body.provider ?? "";
        const row = await getRow(provider);
        if (!row) return NextResponse.json({ ok: true, message: "Already disconnected." });
        if (provider === "printful") {
          const token = await getSecret(row.id);
          if (token) await printfulFetch(token, "/webhooks", { method: "DELETE" }, (row.settings.store_id as number) ?? null).catch(() => null);
        }
        await admin.from("gig_integrations").delete().eq("id", row.id);
        return NextResponse.json({ ok: true, message: "Disconnected. Records already imported stay." });
      }
      default:
        return bad("Unknown action");
    }
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Unexpected error", 500);
  }
}
