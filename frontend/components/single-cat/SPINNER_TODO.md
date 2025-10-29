# Spinner TODOs

- [x] Double Turbo speed cap so flashy mode reaches 2× current max without shortening the inter-parameter pause (stay ~500 ms).
- [x] Keep shading/reverse parameters out of the animation path, including UI table rows.
- [x] In calm mode, spin accessories, scars, and tortie slots sequentially (slot by slot) with visible delays instead of resolving simultaneously.
- [x] Allow live switching between Flashy and Calm modes mid-run: Flashy→Calm should reveal the current param instantly; Calm→Flashy should pick up animation immediately for the current/next step.
- [x] Prevent rerolls or control tweaks from clearing the already-rendered cat canvas until a new render is ready.
- [x] Original Visual Builder variants: reset between rolls, reveal only after spin finishes, force sprite #8 previews, and disable when extra palettes/tints make previews invalid (show message).
- [x] Builder variant accordion should lazy-load previews only on demand and respect the "one accessory / one scar / one tortie" limit for external builder links.
- [x] Afterlife dropdown: implement force Dark Forest / StarClan behaviour with proper tint pipeline and extra copy button for no-afterlife output.
- [x] Main summary table should omit accessory/scar placeholders (details section covers them).
- [x] Ensure wait time between parameter reveals stays fixed at ~500 ms regardless of speed slider, while keeping faster flip playback.
