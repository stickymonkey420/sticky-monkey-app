import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  collectionFor,
  printfulChannel,
  printfulExternalId,
  printfulOrderData,
  shopifyOrderData,
  upsertExternal,
  verifyShopifyHmac,
  type BizRow,
} from "@/lib/gigs/server";

// Public webhook receiver for gig integrations (no session; listed as a
// public path in the auth middleware). The URL's random token identifies
// the integration; Shopify posts are additionally HMAC-verified with the
// stored signing secret. Unknown tokens get a 404 with no detail.
//   POST /api/webhooks/gig/printful/<token>   Printful order + package events
//   POST /api/webhooks/gig/shopify/<token>    Shopify order webhooks

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const { provider, token } = await params;
  if (!["printful", "shopify"].includes(provider) || !UUID.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const admin = createAdminClient();
  const { data: integ } = await admin.from("gig_integrations").select("id,business_id,provider,settings").eq("webhook_token", token).eq("provider", provider).maybeSingle();
  if (!integ) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: biz } = await admin.from("user_businesses").select("id,user_id,category_name").eq("id", integ.business_id).maybeSingle();
  if (!biz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const col = collectionFor(biz.category_name, "orders");
  if (!col) return NextResponse.json({ ok: true });

  try {
    if (provider === "shopify") {
      const { data: sec } = await admin.from("gig_integration_secrets").select("secret").eq("integration_id", integ.id).maybeSingle();
      if (!sec?.secret) return NextResponse.json({ error: "Signing secret not set" }, { status: 401 });
      if (!verifyShopifyHmac(raw, request.headers.get("x-shopify-hmac-sha256"), sec.secret)) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
      const order = JSON.parse(raw) as { id?: number };
      if (!order?.id) return NextResponse.json({ ok: true });
      const dropship = /dropship/i.test(biz.category_name);
      const { data, strongStatus } = shopifyOrderData(order as Parameters<typeof shopifyOrderData>[0], dropship);
      await upsertExternal(admin, biz as BizRow, col, `ext-${order.id}`, data, "shopify", strongStatus ? [] : ["status"]);
    } else {
      const evt = JSON.parse(raw) as { type?: string; data?: { order?: Parameters<typeof printfulOrderData>[0] } };
      const order = evt?.data?.order;
      if (order?.id) {
        await upsertExternal(
          admin,
          biz as BizRow,
          col,
          printfulExternalId(order),
          printfulOrderData(order, printfulChannel((integ.settings as Record<string, unknown>)?.store_type)),
          "printful",
          ["customer", "order_no", "channel"]
        );
      }
    }
    await admin.from("gig_integrations").update({ last_event_at: new Date().toISOString(), last_error: null }).eq("id", integ.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await admin.from("gig_integrations").update({ last_error: `Webhook: ${(e as Error).message}` }).eq("id", integ.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
