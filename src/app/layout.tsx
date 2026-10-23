import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LOG — Lots of Growth", template: "%s · LOG" },
  description: "LOG task management: clients, projects, tasks, reviews and schedules in one place.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#060714", width: "device-width", initialScale: 1 };

// Applies the saved theme before first paint (no flash). Dark is the default.
const themeScript = `try{var t=localStorage.getItem("log-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ style: { background: "var(--elevated)", border: "1px solid var(--line-strong)", color: "var(--fg)", backdropFilter: "blur(16px)" } }}
        />
      </body>
    </html>
  );
}
