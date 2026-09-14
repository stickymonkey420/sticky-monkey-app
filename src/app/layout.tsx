import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Sticky Monkey Finance",
  description: "Sticky Monkey Finance member dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
