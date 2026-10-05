// Marketing tool helpers (App Director only page: /marketing).
// Social posting is "compose + one-click launch": $0, no API keys. Each
// platform opens its own composer (prefilled where the platform allows it).

export type SocialPlatform = "x" | "facebook" | "tiktok";
export type Channel = "email" | SocialPlatform;

export type Campaign = {
  id: string;
  channel: Channel;
  subject: string | null;
  body: string;
  link: string | null;
  status: "draft" | "sent" | "launched" | "failed";
  recipients: number;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

export const PLATFORMS: { key: SocialPlatform; label: string; limit: number; color: string; how: string }[] = [
  { key: "x", label: "X (Twitter)", limit: 280, color: "#e7e9ea", how: "Opens X with the post prefilled. Review, attach media, post." },
  {
    key: "facebook",
    label: "Facebook",
    limit: 63206,
    color: "#4f8cff",
    how: "Copies the text, then opens Facebook's share box for your link. Paste the text and post to your Page.",
  },
  {
    key: "tiktok",
    label: "TikTok",
    limit: 2200,
    color: "#ff5c7a",
    how: "Copies the caption and opens TikTok Studio upload. TikTok posts need a video or photos.",
  },
];

// X counts every URL as 23 characters (t.co); everything else by code point.
export function xLength(text: string): number {
  const urlRe = /https?:\/\/\S+/g;
  const urls = text.match(urlRe) ?? [];
  const rest = text.replace(urlRe, "");
  return [...rest].length + urls.length * 23;
}

export function hashtagLine(tags: string): string {
  return tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(" ");
}

// Full post text for a platform: message, link (except where the platform
// takes the link separately), hashtags.
export function composePost(platform: SocialPlatform, message: string, link: string, tags: string): string {
  const parts = [message.trim()];
  if (link.trim() && platform !== "x") parts.push(link.trim());
  const h = hashtagLine(tags);
  if (h) parts.push(h);
  return parts.filter(Boolean).join("\n\n");
}

export function postLength(platform: SocialPlatform, message: string, link: string, tags: string): number {
  const text = composePost(platform, message, link, tags);
  if (platform === "x") return xLength(text) + (link.trim() ? 1 + 23 : 0);
  return [...text].length;
}

export function launchUrl(platform: SocialPlatform, message: string, link: string, tags: string): string {
  const text = composePost(platform, message, link, tags);
  if (platform === "x") {
    const q = new URLSearchParams({ text });
    if (link.trim()) q.set("url", link.trim());
    return `https://x.com/intent/post?${q.toString()}`;
  }
  if (platform === "facebook") {
    return link.trim() ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link.trim())}` : "https://www.facebook.com/";
  }
  return "https://www.tiktok.com/tiktokstudio/upload";
}

export function isValidUrl(s: string): boolean {
  if (!s.trim()) return true;
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
