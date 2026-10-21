import type { MetadataRoute } from "next";

// Installable PWA ("Add to Home Screen" on iPhone, install prompt on
// Android/desktop Chrome). Same site, same Supabase session -- nothing is
// duplicated, so Health/Medical/etc. stay in sync with desktop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sticky Monkey Lifestyle",
    short_name: "Sticky Monkey",
    description: "Sticky Monkey Lifestyle member dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1420",
    theme_color: "#0f1420",
    icons: [
      { src: "/pwa-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Health", url: "/health" },
      { name: "Portfolio", url: "/invest" },
    ],
  };
}
