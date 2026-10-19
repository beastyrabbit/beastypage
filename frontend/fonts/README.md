These WOFF2 files are served by `next/font/local`. Builds and browsers do not
fetch fonts from Google. Keeping the files here avoids another package dependency
and makes clean builds independent of Google Fonts availability.

The source is google/fonts at commit
`47d54ca1ebb14fd864695f1d39dc734f39017c33`. `sources.json` records the original
TTF URLs and SHA-256 hashes of both formats. The TTFs were compressed losslessly
with FontTools 4.67.0 (`TTFont`, `font.flavor = "woff2"`, `font.save(...)`).
The full fonts retain their outlines, names, axes, and character maps. Geist and
Geist Mono omit the `prep` hinting table, matching Google's WOFF2 delivery and preserving
browser text widths. Their glyphs contain no hinting instructions.

The full character maps retain Latin and the other scripts previously available
from Google's CSS. The old `subsets: ["latin"]` selected preloads, not the
available glyphs. Geist and Geist Mono preload small Latin subsets and load the
full fonts as fallback faces only when additional glyphs are needed. The full faces
have stable CSS family names so they can follow the Latin face in each stack.
The original Arial fallback and its metrics remain last in the stack. This keeps
Latin page loads small while retaining the other scripts. The six look fonts
preload their full character maps on the overlay and its preview. Geist and Geist
Mono retain the 100–900 variable range. The other variable fonts declare ranges
covering their previous weights: EB Garamond 400–600, Cormorant Garamond 500–700,
and Caveat 500–600. Normal/italic styles remain as before, with `display: "swap"`
and the same CSS variables. `fallbacks.css` preserves the Google loader's fallback families
and metric overrides. Local automatic fallback calculation is disabled to avoid
changing those metrics.

The Latin files were generated with `fontTools.subset.Subsetter` using the
225-codepoint character maps from Google's Latin WOFF2 files, recorded in
`sources.json`. Subsetting keeps all layout features and name IDs
1, 2, 3, 4, 5, 6, 13, 14, and 25, including the license. The extended faces'
`unicode-range` values contain the full character maps minus those Latin maps,
so missing system glyphs do not trigger a full-font download. Only the two Latin
files are preloaded, about 68 KB together instead of 141 KB for the full fonts.

Each family directory contains its upstream license. Geist, Geist Mono,
EB Garamond, Cormorant Garamond, Press Start 2P, IBM Plex Mono, and Caveat use
SIL Open Font License 1.1. Special Elite uses Apache License 2.0.
