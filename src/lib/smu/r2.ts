import { AwsClient } from "aws4fetch";

// Cloudflare R2 (S3-compatible) for SMU lesson videos. The bucket is
// private: members get short-lived signed GET links, the App Director gets
// signed PUT links to upload straight from the browser (files never pass
// through Vercel). R2 has no egress fees, so playback costs $0.
//
// Env (Vercel): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
const PLAY_TTL = 60 * 60 * 3; // 3 h
const UPLOAD_TTL = 60 * 15; // 15 min

function cfg() {
  // Accept the bare account ID or a pasted endpoint URL
  // (https://<id>.r2.cloudflarestorage.com or <id>.eu.r2.cloudflarestorage.com).
  const rawId = (process.env.R2_ACCOUNT_ID || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const host = rawId.includes(".") ? rawId : rawId ? `${rawId}.r2.cloudflarestorage.com` : "";
  const accountId = host;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    base: `https://${host}/${bucket.trim()}`,
  };
}

export const r2Configured = () => cfg() !== null;

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function presign(method: "GET" | "PUT", key: string, ttl: number, contentType?: string): Promise<string> {
  const c = cfg();
  if (!c) throw new Error("Video storage isn't set up yet.");
  const url = new URL(objectUrl(c.base, key));
  url.searchParams.set("X-Amz-Expires", String(ttl));
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  const signed = await c.client.sign(url.toString(), { method, headers, aws: { signQuery: true } });
  return signed.url;
}

export const signedPlayUrl = (key: string) => presign("GET", key, PLAY_TTL);
export const signedUploadUrl = (key: string, contentType: string) => presign("PUT", key, UPLOAD_TTL, contentType);

export async function deleteObject(key: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error("Video storage isn't set up yet.");
  const res = await c.client.fetch(objectUrl(c.base, key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status}).`);
}
