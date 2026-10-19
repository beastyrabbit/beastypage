These WOFF2 files are served by `next/font/local`. Builds and browsers do not
fetch fonts from Google. Keeping the files here avoids another package dependency
and makes clean builds independent of Google Fonts availability.

The source is google/fonts at commit
`47d54ca1ebb14fd864695f1d39dc734f39017c33`. `sources.json` records the original
TTF URLs and SHA-256 hashes of both formats. The TTFs were compressed losslessly
with FontTools 4.67.0 (`TTFont`, `font.flavor = "woff2"`, `font.save(...)`).
No outlines, names, axes, or character maps were changed. Geist and Geist Mono
omit the `prep` hinting table, matching Google's WOFF2 delivery and preserving
browser text widths. Their glyphs contain no hinting instructions.

The full character maps retain Latin and the other scripts previously available
from Google's CSS. The old `subsets: ["latin"]` selected preloads, not the
available glyphs. Local files preload the full character maps. Geist and Geist
Mono retain the 100–900 variable range. The other families expose the same
weights and normal/italic styles as before, with `display: "swap"` and the same
CSS variables. `fallbacks.css` preserves the Google loader's fallback families
and metric overrides. Local automatic fallback calculation is disabled to avoid
changing those metrics.

Each family directory contains its upstream license. Geist, Geist Mono,
EB Garamond, Cormorant Garamond, Press Start 2P, IBM Plex Mono, and Caveat use
SIL Open Font License 1.1. Special Elite uses Apache License 2.0.
