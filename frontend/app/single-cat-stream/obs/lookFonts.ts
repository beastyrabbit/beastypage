import localFont from "next/font/local";

/**
 * Web fonts for the show looks (evolution finale + batch show designs).
 * Applied as CSS variables on the overlay page and the dev preview; the
 * looks read them through the stacks in
 * `components/stream-control/obs/looks/fonts.ts`.
 */

const book = localFont({
  src: [
    {
      path: "../../../fonts/ebgaramond/EBGaramond-Variable.woff2",
      weight: "400 600",
      style: "normal",
    },
    {
      path: "../../../fonts/ebgaramond/EBGaramond-Italic-Variable.woff2",
      weight: "400 600",
      style: "italic",
    },
  ],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["EB Garamond Fallback"],
  variable: "--font-look-book",
});

const display = localFont({
  src: [
    {
      path: "../../../fonts/cormorantgaramond/CormorantGaramond-Variable.woff2",
      weight: "500 700",
      style: "normal",
    },
    {
      path: "../../../fonts/cormorantgaramond/CormorantGaramond-Italic-Variable.woff2",
      weight: "500 700",
      style: "italic",
    },
  ],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Cormorant Garamond Fallback"],
  variable: "--font-look-display",
});

const pixel = localFont({
  src: "../../../fonts/pressstart2p/PressStart2P-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["'Press Start 2P Fallback'"],
  variable: "--font-look-pixel",
});

const mono = localFont({
  src: [
    {
      path: "../../../fonts/ibmplexmono/IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../fonts/ibmplexmono/IBMPlexMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["IBM Plex Mono Fallback"],
  variable: "--font-look-mono",
});

const hand = localFont({
  src: "../../../fonts/caveat/Caveat-Variable.woff2",
  weight: "500 600",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Caveat Fallback"],
  variable: "--font-look-hand",
});

const typewriter = localFont({
  src: "../../../fonts/specialelite/SpecialElite-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Special Elite Fallback"],
  variable: "--font-look-type",
});

/** Put this class on an ancestor of the overlay root. */
export const lookFontsClassName = [
  book.variable,
  display.variable,
  pixel.variable,
  mono.variable,
  hand.variable,
  typewriter.variable,
].join(" ");
