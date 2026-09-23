import type { NextConfig } from "next";

// Security headers (security audit 2026-09-23 #4). Applied to every route.
//
// CSP notes:
// - script-src keeps 'unsafe-inline': pages are statically prerendered, and
//   Next.js injects inline bootstrap scripts. A nonce-based CSP would force
//   every page to render dynamically (more Vercel compute, $). The policy
//   still blocks loading scripts from any other host and blocks data
//   exfiltration via connect-src, which is where most of the XSS value is.
// - connect-src: Supabase REST/Auth/Functions (https) + Realtime (wss),
//   plus Plaid Link's own API calls.
// - img-src allows any https host: avatars/institution logos come from
//   user data and Webflow's S3 asset bucket; images can't execute code.
// - media-src data: is required for Abu's base64 MP3 voice replies.
// - frame-ancestors 'none' + X-Frame-Options DENY stop clickjacking.
// - microphone=(self) is kept for Abu's voice input (SpeechRecognition).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gxxjxslnsjgsuonnxxgq.supabase.co";
const supabaseWss = supabaseUrl.replace(/^https:/, "wss:");
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.plaid.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${supabaseWss} https://*.plaid.com`,
  "media-src 'self' data: blob:",
  "frame-src https://cdn.plaid.com https://*.plaid.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Rollout: ship CSP as Report-Only first (logs violations to the browser
// console, blocks nothing), verify every page on production, then flip this
// to true. The other headers below are enforced immediately.
const CSP_ENFORCE = false;

const securityHeaders = [
  { key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
