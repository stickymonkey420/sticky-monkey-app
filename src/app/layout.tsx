import type { Metadata } from "next";
import { Geist, Geist_Mono, VT323, Chakra_Petch } from "next/font/google";
import "./globals.css";
import AbuChatWidget from "@/components/chat/AbuChatWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Both scoped to a single spot: the Game-a-Fi Head to Head "Arena Jumbotron"
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
  title: "Sticky Monkey Finance",
  description: "Sticky Monkey Finance member dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${vt323.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        {/* Site-wide, exactly like the Webflow footer script -- renders
            nothing itself and only builds its DOM once a session exists. */}
        <AbuChatWidget />
      </body>
    </html>
  );
}
