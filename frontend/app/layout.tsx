import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { MaintenanceBanner } from "@/components/common/MaintenanceBanner";
import { AppProviders } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isMaintenanceMode } from "@/server/maintenance";
import "./globals.css";
import "../fonts/fallbacks.css";

// Maintenance mode is read from the runtime environment.
export const dynamic = "force-dynamic";

const geistSans = localFont({
  src: "../fonts/geist/Geist-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Fallback"],
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../fonts/geistmono/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Mono Fallback"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "BeastyRabbit",
  description: "Generate, collect, and share custom pixel cats.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const maintenanceMode = isMaintenanceMode();

  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <AppProviders>
          <div className="relative flex min-h-screen flex-col">
            <MaintenanceBanner enabled={maintenanceMode} />
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
          <Toaster richColors position="bottom-right" />
        </AppProviders>
      </body>
    </html>
  );
}
