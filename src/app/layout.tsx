import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, VT323, Chakra_Petch } from "next/font/google";
import "./globals.css";
import AbuChatWidget from "@/components/chat/AbuChatWidget";
import ConfirmProvider from "@/components/ui/ConfirmProvider";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Both scoped to a single spot: the Fantasy Finance Head to Head "Arena Jumbotron"
// card (components/gameAfi/HeadToHeadCard.tsx) -- VT323 for the LED-style
// score/clock digits, Chakra Petch for its labels. Loaded here (rather than
// inline) so next/font can self-host and subset them, same as Geist above;
// referenced elsewhere only via the CSS variable, never a raw Google Fonts
// <link>.
const vt323 = VT323({
  weight: "400",
  variable: "--font-vt323",
  subsets: ["latin"],
});

const chakraPetch = Chakra_Petch({
  weight: ["500", "600", "700"],
  variable: "--font-chakra-petch",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sticky Monkey Lifestyle",
  description: "Sticky Monkey Lifestyle member dashboard",
  // PWA: iPhone "Add to Home Screen" opens full-screen with this title/icon.
  applicationName: "Sticky Monkey",
  appleWebApp: { capable: true, title: "Sticky Monkey", statusBarStyle: "black" },
  icons: { apple: [{ url: "/pwa-icons/apple-180.png", sizes: "180x180", type: "image/png" }] },
  formatDetection: { telephone: false },
};

// viewport-fit=cover lets the mobile tab bar sit above the iPhone home
// indicator via env(safe-area-inset-bottom).
export const viewport: Viewport = {
  themeColor: "#0f1420",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${vt323.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ConfirmProvider>
          {children}
          {/* Site-wide, exactly like the Webflow footer script -- renders
              nothing itself and only builds its DOM once a session exists. */}
          <AbuChatWidget />
          <ServiceWorkerRegister />
        </ConfirmProvider>
      </body>
    </html>
  );
}
