import { ImageResponse } from "next/og";
import { LOGO_HEAD_URL } from "@/lib/brand/logo";

// Home-screen / install icons for the PWA, rendered once at build time
// (static params, no per-request compute) from the same Webflow-hosted
// monkey-head logo the sidebar uses. Served at /pwa-icons/<file>.png, which
// the proxy matcher skips (*.png) so they load before sign-in.
//   apple-180.png    -> iOS home screen (apple-touch-icon)
//   192.png/512.png  -> manifest "any"
//   maskable-512.png -> manifest "maskable" (extra padding for Android crops)
const ICONS: Record<string, { size: number; logoPct: number }> = {
  "apple-180.png": { size: 180, logoPct: 0.72 },
  "192.png": { size: 192, logoPct: 0.72 },
  "512.png": { size: 512, logoPct: 0.72 },
  "maskable-512.png": { size: 512, logoPct: 0.56 },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

const BG = "#0f1420";
const GOLD = "#f5d020";

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_HEAD_URL);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icons/[file]">) {
  const { file } = await ctx.params;
  const spec = ICONS[file];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, logoPct } = spec;
  const logo = await logoDataUrl();
  const inner = Math.round(size * logoPct);

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={inner} height={inner} alt="" style={{ objectFit: "contain" }} />
        ) : (
          // Fallback if the logo host is unreachable at build time.
          <div style={{ display: "flex", color: GOLD, fontSize: Math.round(size * 0.38), fontWeight: 800 }}>SM</div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
