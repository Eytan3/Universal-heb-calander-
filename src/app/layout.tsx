import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/ui/theme";

export const metadata: Metadata = {
  title: "עִתִּים · Ittim",
  description: "Calendar-neutral scheduling: Hebrew and Gregorian as first-class calendars.",
  applicationName: "עִתִּים",
  // Home-screen app on iPhone: full screen, own name, the status bar drawn over the app's own top bar.
  appleWebApp: { capable: true, title: "עִתִּים", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
