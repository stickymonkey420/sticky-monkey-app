"use client";

import { useState } from "react";
import type { GigIntegration } from "@/lib/gigs/schema";
import { gigIntegrationAction, type GigIntegrationRow } from "@/lib/gigs/queries";
import { INPUT } from "./gigFormat";

// Connected services for a gig workspace. Secrets (Printful token, Shopify
// signing secret) are sent once to /api/gig/integrations and stored
// server-side only; the browser never reads them back.

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className={`${INPUT} font-mono text-xs`} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* select + copy manually */
          }
        }}
        className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-text-primary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const CARD = "rounded-xl border border-white/10 bg-white/[0.03] p-4";

export default function GigIntegrations({
  businessId,
  integrations,
  rows,
  listings,
  onChanged,
}: {
  businessId: string;
  integrations: GigIntegration[];
  rows: GigIntegrationRow[];
  listings: { id: string; label: string }[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [printfulToken, setPrintfulToken] = useState("");
  const [shopifySecret, setShopifySecret] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [icalListing, setIcalListing] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const row = (p: string) => rows.find((r) => r.provider === p) ?? null;

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setMsg(null);
    const r = await gigIntegrationAction({ businessId, ...body });
    setBusy(null);
    setMsg(r.ok ? { text: r.message || "Done.", error: false } : { text: r.error || "Something went wrong.", error: true });
    if (r.ok) onChanged();
    return r.ok;
  }

  const links = integrations.filter((i): i is Extract<GigIntegration, { kind: "link" }> => i.kind === "link");

  return (
    <div className="flex flex-col gap-3">
      {integrations.map((i) => {
        if (i.kind === "printful") {
          const r = row("printful");
          return (
            <div key="printful" className={CARD}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">Printful</div>
                <span className={`text-xs ${r?.status === "active" ? "text-[#3ddc97]" : "text-text-muted"}`}>{r ? (r.status === "active" ? "Connected" : r.status) : "Not connected"}</span>
              </div>
              <p className="mb-3 text-xs text-text-muted">
                Orders, Printful costs, status and tracking sync into Orders automatically: a webhook updates them as they change, and Sync now pulls your recent orders.
              </p>
              {r ? (
                <>
                  <p className="mb-2 text-xs text-text-muted">
                    Store: <span className="text-text-primary">{String(r.settings.store_name ?? r.settings.store_id ?? "—")}</span> · Last sync {when(r.last_sync_at)} · Last update {when(r.last_event_at)}
                  </p>
                  {r.last_error && <p className="mb-2 text-xs text-[#ff5c7a]">{r.last_error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!!busy} onClick={() => run("pf-sync", { action: "printful_sync" })} className="rounded-md bg-[#f5d020] px-3 py-2 text-xs font-semibold text-[#0f131c] disabled:opacity-50">
                      {busy === "pf-sync" ? "Syncing…" : "Sync now"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => run("pf-off", { action: "disconnect", provider: "printful" })} className="rounded-md bg-white/10 px-3 py-2 text-xs text-text-primary disabled:opacity-50">
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ol className="mb-2 list-decimal pl-5 text-xs leading-relaxed text-text-muted">
                    <li>
                      Open{" "}
                      <a href="https://developers.printful.com/tokens" target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
                        Printful → Developers → Tokens
                      </a>{" "}
                      and create a private token for your store with the Orders (read) and Webhooks scopes.
                    </li>
                    <li>Paste it here. It&apos;s stored on the server only.</li>
                  </ol>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input type="password" autoComplete="off" placeholder="Printful private token" value={printfulToken} onChange={(e) => setPrintfulToken(e.target.value)} className={INPUT} />
                    <button
                      type="button"
                      disabled={!printfulToken.trim() || !!busy}
                      onClick={async () => {
                        if (await run("pf-on", { action: "printful_connect", token: printfulToken.trim() })) setPrintfulToken("");
                      }}
                      className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
                    >
                      {busy === "pf-on" ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        }
        if (i.kind === "shopify_webhook") {
          const r = row("shopify");
          const url = r ? `${origin}/api/webhooks/gig/shopify/${r.webhook_token}` : "";
          return (
            <div key="shopify" className={CARD}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">Shopify orders</div>
                <span className={`text-xs ${r?.status === "active" ? "text-[#3ddc97]" : "text-text-muted"}`}>
                  {r ? (r.status === "active" ? `Receiving · last order ${when(r.last_event_at)}` : "Waiting for signing secret") : "Not set up"}
                </span>
              </div>
              <p className="mb-3 text-xs text-text-muted">New, paid, fulfilled and cancelled Shopify orders land in Orders automatically.</p>
              {!r ? (
                <button type="button" disabled={!!busy} onClick={() => run("sh-on", { action: "shopify_setup" })} className="rounded-md bg-[#f5d020] px-3 py-2 text-xs font-semibold text-[#0f131c] disabled:opacity-50">
                  {busy === "sh-on" ? "Creating…" : "Create my webhook link"}
                </button>
              ) : (
                <>
                  <ol className="mb-2 list-decimal pl-5 text-xs leading-relaxed text-text-muted">
                    <li>In Shopify admin go to Settings → Notifications → Webhooks → Create webhook.</li>
                    <li>Event: Order creation, Format: JSON, URL: the link below. Repeat for Order payment, Order fulfillment and Order cancellation.</li>
                    <li>Copy the signing secret shown under the webhooks list (&quot;Your webhooks will be signed with…&quot;) and save it here.</li>
                  </ol>
                  <CopyField value={url} />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input type="password" autoComplete="off" placeholder={r.status === "active" ? "Signing secret saved (paste to replace)" : "Shopify webhook signing secret"} value={shopifySecret} onChange={(e) => setShopifySecret(e.target.value)} className={INPUT} />
                    <button
                      type="button"
                      disabled={!shopifySecret.trim() || !!busy}
                      onClick={async () => {
                        if (await run("sh-secret", { action: "shopify_setup", secret: shopifySecret.trim() })) setShopifySecret("");
                      }}
                      className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
                    >
                      Save secret
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => run("sh-off", { action: "disconnect", provider: "shopify" })} className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs text-text-primary disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        }
        if (i.kind === "ical") {
          const r = row("ical");
          return (
            <div key="ical" className={CARD}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">{i.label}</div>
                <span className={`text-xs ${r ? "text-[#3ddc97]" : "text-text-muted"}`}>{r ? `Synced ${when(r.last_sync_at)}` : "Not connected"}</span>
              </div>
              <p className="mb-2 text-xs text-text-muted">
                Paste your listing&apos;s calendar export link to pull reservations (dates and confirmation codes). Airbnb: Calendar → Availability → Connect another website → Export calendar. VRBO and Booking.com have the same export.
                Calendars don&apos;t include prices; import the earnings CSV on Reservations to fill amounts.
              </p>
              {r?.last_error && <p className="mb-2 text-xs text-[#ff5c7a]">{r.last_error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="url" placeholder={r ? "Calendar link saved (paste to replace)" : "https://www.airbnb.com/calendar/ical/….ics"} value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} className={INPUT} />
                {listings.length > 0 && (
                  <select value={icalListing} onChange={(e) => setIcalListing(e.target.value)} className={`${INPUT} sm:max-w-[200px]`} aria-label="Listing">
                    <option value="">Listing (optional)</option>
                    {listings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={(!icalUrl.trim() && !r) || !!busy}
                  onClick={async () => {
                    if (await run("ical", { action: "ical_sync", url: icalUrl.trim() || undefined, listingId: icalListing || undefined })) setIcalUrl("");
                  }}
                  className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
                >
                  {busy === "ical" ? "Syncing…" : r && !icalUrl.trim() ? "Sync now" : "Save & sync"}
                </button>
                {r && (
                  <button type="button" disabled={!!busy} onClick={() => run("ical-off", { action: "disconnect", provider: "ical" })} className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs text-text-primary disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        }
        return null;
      })}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title={l.note}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text-primary hover:border-[#4f8cff]/50"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.error ? "text-[#ff5c7a]" : "text-[#3ddc97]"}`}>{msg.text}</p>}
    </div>
  );
}
