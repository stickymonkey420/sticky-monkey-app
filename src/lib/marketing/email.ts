import { LOGO_HEAD_URL, LOGO_WORDMARK_URL } from "@/lib/brand/logo";

// Builds the marketing email (HTML + plain text). Server-side only use, but
// has no secrets so it is safe to import from the preview UI as well.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Plain text -> paragraphs, with bare https links made clickable.
function bodyHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const html = esc(para)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#f5d020">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#e6e8ee">${html}</p>`;
    })
    .join("");
}

export type EmailParts = {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  name?: string | null;
  unsubscribeUrl: string;
  postalAddress: string;
  audience?: "members" | "invitees"; // footer wording: opted-in member vs personally invited
};

const FOOTER = {
  members: "This email is from Sticky Monkey Finance.",
  invitees: "This email is from Sticky Monkey Finance.",
};

export function renderMarketingEmail(p: EmailParts): { html: string; text: string } {
  const greeting = p.name ? `Hi ${p.name.split(" ")[0]},` : "Hi there,";
  const cta =
    p.ctaUrl && p.ctaLabel
      ? `<p style="margin:8px 0 24px"><a href="${esc(p.ctaUrl)}" style="display:inline-block;background:#f5d020;color:#0f131c;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${esc(p.ctaLabel)}</a></p>`
      : "";
  const html = `<!doctype html><html><body style="margin:0;background:#0f131c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f131c;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161b26;border:1px solid #262d3d;border-radius:16px">
<tr><td align="center" style="padding:28px 28px 12px;border-bottom:1px solid #262d3d">
<img src="${LOGO_HEAD_URL}" alt="" width="56" height="56" style="display:block;margin:0 auto 6px;border:0;height:56px;width:auto">
<img src="${LOGO_WORDMARK_URL}" alt="Sticky Monkey" width="170" style="display:block;margin:0 auto;border:0;width:170px;height:auto">
<div style="margin-top:6px;font-size:11px;font-weight:300;letter-spacing:4px;color:#8a93a6">FINANCE</div>
</td></tr>
<tr><td style="padding:12px 28px 8px">
<p style="margin:0 0 16px;font-size:15px;color:#e6e8ee">${esc(greeting)}</p>
${bodyHtml(p.body)}
${cta}
<p style="margin:0 0 8px;font-size:15px;color:#e6e8ee">Sticky Monkey team</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #262d3d;font-size:12px;line-height:1.6;color:#8a93a6">
${esc(FOOTER[p.audience ?? "members"])} We never sell your data or send third-party ads.<br>
<a href="${esc(p.unsubscribeUrl)}" style="color:#8a93a6">Unsubscribe</a> · ${esc(p.postalAddress)}
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    greeting,
    "",
    p.body.trim(),
    "",
    p.ctaUrl && p.ctaLabel ? `${p.ctaLabel}: ${p.ctaUrl}\n` : "",
    "Sticky Monkey team",
    "",
    "---",
    FOOTER[p.audience ?? "members"],
    `Unsubscribe: ${p.unsubscribeUrl}`,
    p.postalAddress,
  ].join("\n");
  return { html, text };
}
