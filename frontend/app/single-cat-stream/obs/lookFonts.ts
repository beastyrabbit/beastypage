import {
  Caveat,
  Cormorant_Garamond,
  EB_Garamond,
  IBM_Plex_Mono,
  Press_Start_2P,
  Special_Elite,
} from "next/font/google";

/**
 * Web fonts for the show looks (evolution finale + batch show designs).
 * Applied as CSS variables on the overlay page and the dev preview; the
 * looks read them through the stacks in
 * `components/stream-control/obs/looks/fonts.ts`.
 */

const book = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-look-book",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-look-display",
});

const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-look-pixel",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-look-mono",
});

const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-look-hand",
});

const typewriter = Special_Elite({
  subsets: ["latin"],
  weight: "400",
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
