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
  src: "../fonts/geist/Geist-Latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Extended", "Geist Fallback"],
  variable: "--font-geist-sans",
});

const geistSansExtended = localFont({
  src: "../fonts/geist/Geist-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Fallback"],
  preload: false,
  declarations: [
    { prop: "font-family", value: "Geist Extended" },
    {
      prop: "unicode-range",
      value:
        "U+100-101,U+103-113,U+116-12B,U+12E-130,U+132-137,U+139-13E,U+141-148,U+14A-14D,U+150-151,U+154-17E,U+18F,U+192,U+1A0-1A1,U+1AF-1B0,U+1CD-1CE,U+1E4-1E9,U+218-21B,U+237,U+259,U+2B9,U+2C7-2C8,U+2D8-2D9,U+2DB,U+2DD,U+302,U+306-307,U+30A-30C,U+312,U+31B,U+326-328,U+335-338,U+39B,U+3A9,U+3BB-3BC,U+3C0,U+3C9,U+400-45F,U+462-463,U+46A-46B,U+472-475,U+490-493,U+496-497,U+49A-49B,U+4A2-4A3,U+4AE-4B3,U+4B6-4B7,U+4BA-4BB,U+4C0,U+4CF,U+4D8-4D9,U+4E2-4E3,U+4E8-4E9,U+4EE-4EF,U+E3F,U+1E20-1E21,U+1E80-1E85,U+1E9E,U+1EA0-1EF9,U+2020-2021,U+2028-2029,U+2030,U+2070,U+2074-2079,U+2080-2089,U+20AA,U+20B1,U+20B4,U+20B9,U+20BD,U+2116-2117,U+2153-2155,U+215B-215E,U+2190,U+2192,U+2194-2199,U+219D,U+21A9-21AA,U+21B0-21B1,U+21B3-21B5,U+21E4-21E5,U+21E7,U+2202,U+2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2236,U+2248,U+2260,U+2264-2265,U+2460-2468,U+24EA,U+24FF,U+25B2-25B3,U+25B6-25B7,U+25BC-25BD,U+25C0-25C1,U+25CA-25CC,U+25CF,U+2639-263A,U+2776-277E,U+3003,U+301C,U+A78B-A78C,U+F8FF,U+FB01-FB02",
    },
  ],
  variable: "--font-geist-sans-extended",
});

const geistMono = localFont({
  src: "../fonts/geistmono/GeistMono-Latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Mono Extended", "Geist Mono Fallback"],
  variable: "--font-geist-mono",
});

const geistMonoExtended = localFont({
  src: "../fonts/geistmono/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Mono Fallback"],
  preload: false,
  declarations: [
    { prop: "font-family", value: "Geist Mono Extended" },
    {
      prop: "unicode-range",
      value:
        "U+100-101,U+103-113,U+116-12B,U+12E-130,U+134-137,U+139-13E,U+141-148,U+14A-14D,U+150-151,U+154-17E,U+18F,U+192,U+1A0-1A1,U+1AF-1B0,U+1CD-1CE,U+1E4-1E9,U+218-21B,U+237,U+259,U+2B9,U+2C7-2C8,U+2D8-2D9,U+2DB,U+2DD,U+302,U+306-307,U+30A-30C,U+312,U+31B,U+326-328,U+335-338,U+39B,U+3A9,U+3BB-3BC,U+3C0,U+400-45F,U+462-463,U+46A-46B,U+472-475,U+490-493,U+496-497,U+49A-49B,U+4A2-4A3,U+4AE-4B3,U+4B6-4B7,U+4BA-4BB,U+4C0,U+4CF,U+4D8-4D9,U+4E2-4E3,U+4E8-4E9,U+4EE-4EF,U+E3F,U+1E20-1E21,U+1E80-1E85,U+1E9E,U+1EA0-1EF9,U+2020-2021,U+2028-2029,U+2030,U+2070,U+2074-2079,U+2080-2089,U+20AA,U+20B1,U+20B4,U+20B9,U+20BD,U+2107,U+2116-2117,U+2153-2155,U+215B-215E,U+2190,U+2192,U+2194-2199,U+219D,U+21A9-21AA,U+21B0-21B1,U+21B3-21B5,U+21E4-21E5,U+21E7,U+2202,U+2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2236,U+2248,U+2260,U+2264-2265,U+2326-2327,U+232B,U+23CE,U+240B-240C,U+2423,U+2460-2468,U+24EA,U+24FF-259F,U+25B2-25B3,U+25B6-25B7,U+25BC-25BD,U+25C0-25C1,U+25CA-25CC,U+25CF,U+2776-277E,U+3003,U+301C,U+A78B-A78C,U+F8FF",
    },
  ],
  variable: "--font-geist-mono-extended",
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
        className={`${geistSans.variable} ${geistMono.variable} ${geistSansExtended.variable} ${geistMonoExtended.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
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
