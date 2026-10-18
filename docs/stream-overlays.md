# Stream overlays

BeastyPage has separate registries for the three OBS show families:

- Spin themes live in `frontend/components/stream-control/obs/themes/` and are registered in `themes/registry.tsx`.
- Evolution looks live in `frontend/components/stream-control/obs/looks/` and are registered in `looks/registry.tsx`.
- Batch looks live in `frontend/components/stream-control/obs/scenes/batch/` and are registered in `scenes/batch/batchRegistry.tsx`.

The control page generates and stores cat parameters. The OBS page receives params and saved slugs, then renders sprites locally. Do not put rendered image data in `cat_stream_sessions.currentCommand`; the session document has a 1 MiB limit. A patch such as `attachViewSlug` may update the command without incrementing `seq`; the overlay dispatch guard intentionally ignores those patches as a new show.

## Shared timing contract

Batch and evolution playback are clocked schedules rather than independent animation chains. The preview harness and the OBS source evaluate the same elapsed-time functions, so a reload or a second viewer can recover the same beat.

- Batch timing is defined in `scenes/batch/batchBeats.ts` and consumed by `useBatchShow.ts`. Server timestamps anchor windup, deal, hold, cull verdict, departure, and repack. If a stage stamp does not echo, the client uses a bounded local anchor and can later switch to a sufficiently close server stamp.
- Evolution timing is defined by `lib/evolution/rollSchedule.ts` and exposed to looks by `looks/ceremony.ts`. The schedule uses the command timestamp, server offset, hold state, and reveal/skip controls. Candidate frames must remain visible during a roll; the landed frame is not shown before its scheduled landing.
- Reduced motion must shorten or remove the same timeline beats in the engine and the look. CSS-only suppression leaves the control and overlay out of sync.

Batch culls are a server state machine: nominate, arm a verdict, show the countdown, then depart and repack. `cullBatchCat`, `cancelBatchCull`, and the scheduled finalizer in the frontend PostgreSQL job worker own that state. Keep the control board's keyboard actions and the overlay's verdict labels aligned with those states.

Useful local harnesses:

```text
/dev/obs-theme-preview?theme=plate&state=rolling
/dev/obs-look-preview?look=contact&scene=batch&pool=16&phase=awaitingCull
/dev/obs-batch-preview?theme=gathering&state=awaiting&count=25
```

The overlay roots expose `data-batch-beat`, `data-batch-phase`, and `data-lineage-key` attributes for browser checks.
