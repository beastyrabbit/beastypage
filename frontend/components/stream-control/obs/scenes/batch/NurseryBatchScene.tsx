"use client";

import { cn } from "@/lib/utils";
import { fixedGridColumns } from "./batchLayout";
import { BatchQr, BatchSprite, eliminatedNumbers } from "./batchShared";
import type { BatchSceneViewProps } from "./batchView";

const SANS = "var(--obs-font-sans,'Helvetica Neue',Arial,sans-serif)";
const MONO = "var(--obs-font-mono,ui-monospace,monospace)";
const SERIF = "var(--obs-font-serif,Georgia,serif)";
const CSS = `
.ns{position:absolute;inset:0;overflow:hidden;background:#6b4a2e;font-family:${SANS};color:#2a2622}
.ns .bench{position:absolute;inset:0;background:repeating-linear-gradient(0deg,#7a5635 0 90px,#6b4a2e 90px 180px);box-shadow:inset 0 0 160px rgba(0,0,0,.5)}
.ns .tray{position:absolute;left:50px;top:60px;width:800px;height:800px;background:#1f1c1a;padding:10px;box-sizing:content-box;border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.5),inset 0 0 0 10px #2b2724}
.ns .cell{position:absolute;background:radial-gradient(circle at 50% 70%,#4a3425,#2e2017 70%);border-radius:6px;box-shadow:inset 0 6px 12px rgba(0,0,0,.6);transition:opacity .9s ease}
.ns .cell .sprite{position:absolute;filter:drop-shadow(0 6px 6px rgba(0,0,0,.6));transition:opacity .9s ease,transform .9s ease}
.ns .cell.thinning .sprite{opacity:0;transform:translateY(-40px)}
.ns .label{position:absolute;left:6px;bottom:6px;right:14px;background:#f6f1e4;border-radius:2px 2px 8px 8px;padding:3px 6px;box-shadow:0 2px 4px rgba(0,0,0,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ns .label b{font:900 20px ${MONO};line-height:1;margin-right:6px}
.ns .label span{font:700 10px ${SANS};color:#6b6459}
.ns .label.flat{transform:rotate(-16deg);bottom:40%;left:10%;right:auto;width:60%;opacity:.6}
.ns .label.flat span{text-decoration:line-through}
.ns .cell.pull .label{background:#e0322b;color:#fff;animation:ns-pulse 1.1s ease-in-out infinite}
.ns .cell.pull .label span{color:#ffd1cc}
.ns .cell.maybe .label{background:#ffd23f}
.ns .cell.sun .label::after{content:"✿";position:absolute;right:4px;top:-2px;font-size:18px;color:#ffb84a;text-shadow:0 1px 2px #000}
.ns .col{position:absolute;left:890px;top:50px;width:350px}
.ns .hd b{display:block;font:900 30px ${SANS};color:#f6f1e4;letter-spacing:.04em}
.ns .hd i{display:block;font:italic 17px ${SERIF};color:#e9d8b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ns .hd span{display:block;font:12px ${MONO};color:#e9d8b8;opacity:.8;margin-top:4px}
.ns .pot{position:relative;margin-top:16px;height:280px;text-align:center}
.ns .ph{font:italic 12px ${SERIF};color:#e9d8b8;text-align:left}
.ns .pot .sprite{margin:0 auto;position:relative;z-index:2}
.ns .pb{height:70px;margin:-20px 70px 0;background:linear-gradient(#c9683f,#a85230);clip-path:polygon(0 0,100% 0,88% 100%,12% 100%);box-shadow:inset 0 10px 0 #d9774d}
.ns .pot.empty .pb{margin-top:150px}
.ns .plab{position:absolute;left:60px;bottom:6px;background:#f6f1e4;border-radius:2px 2px 8px 8px;padding:3px 10px;font:900 15px ${SANS};transform:rotate(-6deg);box-shadow:0 2px 4px rgba(0,0,0,.5)}
.ns .plab b{font:900 20px ${MONO};margin-right:8px}
.ns .plab i{display:block;font:italic 11px ${SERIF};color:#8c6a2a;font-weight:400}
.ns .ruler{margin-top:12px;background:#f6f1e4;padding:8px 10px;border-radius:4px;display:flex;flex-wrap:wrap;gap:3px}
.ns .rh{width:100%;font:italic 12px ${SERIF};color:#6b6459;margin-bottom:2px}
.ns .ruler i{font:10px ${SANS};font-style:normal;color:#9a9184;padding:2px 5px;border:1px solid #d9d2c4;border-radius:3px}
.ns .ruler i b{font:700 10px ${MONO};margin-right:3px}
.ns .ruler i.w{color:#2a2622;background:#dcebc8;border-color:#9bbf7a}
.ns .ruler i.c{background:#2a2622;color:#fff;border-color:#2a2622}
.ns .bin{margin-top:12px;background:#2b2724;color:#9a9184;padding:8px 12px;border-radius:4px}
.ns .bin i{display:block;font:italic 12px ${SERIF}}
.ns .bin b{font:700 18px ${MONO};letter-spacing:.18em;text-decoration:line-through;word-break:break-word}
.ns .note{position:absolute;left:50px;bottom:22px;width:820px;text-align:center;font:italic 15px ${SERIF};color:#e9d8b8}
.ns .sill{position:absolute;left:0;right:0;top:470px;height:60px;background:#f1e9d8;box-shadow:0 10px 20px rgba(0,0,0,.4)}
.ns .wpot{position:absolute;top:360px;text-align:center}
.ns .wpot .sprite{margin:0 auto;position:relative;z-index:2}
.ns .wpot .pb{margin:-16px 20px 0;height:50px}
.ns .wpot .plab{left:2px;bottom:-40px;font-size:11px;padding:2px 6px;white-space:nowrap}
.ns .wpot .plab b{font-size:14px;margin-right:4px}
.ns .packet{position:absolute;left:470px;top:620px;width:300px;background:#f6f1e4;padding:14px;text-align:center;transform:rotate(2deg);box-shadow:0 20px 40px rgba(0,0,0,.5)}
.ns .pk{font:700 11px ${MONO};letter-spacing:.3em;color:#6b6459}
.ns .packet b{display:block;font:900 22px ${SANS};margin:4px 0 6px}
.ns .packet .qr{display:inline-block}
.ns .packet span{display:block;margin-top:8px;font:italic 13px ${SERIF}}
.ns .hd.fin{position:absolute;left:50px;top:50px}
@keyframes ns-pulse{50%{box-shadow:0 0 0 4px rgba(224,50,43,.5)}}
`;

/**
 * A seed tray on a potting bench: every pool slot is a cell with a
 * numbered plant label, reveal is growth on the watering ruler, culls are
 * thinned out to compost, and the spotlight kit is potted up on the bench.
 */
export function NurseryBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const done = view.phase === "done";
  const columns = fixedGridColumns(view.poolSize);
  const rows = Math.ceil(view.poolSize / columns);
  const cellW = 800 / columns;
  const cellH = 800 / rows;
  const inner = Math.min(cellW, cellH) - 10;
  const sprite = Math.max(48, Math.round(inner * 0.72));

  if (done) {
    const finalists = view.survivors;
    const step = Math.min(120, 1200 / Math.max(1, finalists.length));
    const x0 = (1280 - step * finalists.length) / 2;
    return (
      <div className="ns" style={{ width: 1280, height: 1080 }}>
        <style>{CSS}</style>
        <div className="bench" />
        <div className="sill" />
        {finalists.map((cat, n) => (
          <div
            key={cat.id}
            className="wpot"
            style={{ left: x0 + n * step, width: step }}
          >
            <BatchSprite
              cat={cat}
              size={Math.min(104, step - 10)}
              className="sprite"
            />
            <div className="pb" />
            <div className="plab">
              <b>{cat.numberLabel}</b>
              {cat.label}
            </div>
          </div>
        ))}
        <div className="packet">
          <div className="pk">SEED PACKET</div>
          <b>{view.title}</b>
          {view.qrUrl ? (
            <span className="qr">
              <BatchQr url={view.qrUrl} size={180} fg="#2a2622" bg="#ffffff" />
            </span>
          ) : null}
          <span>
            {view.qrUrl
              ? `adopt from this litter · ${finalists.length} kits`
              : view.statusLabel}
          </span>
        </div>
        <div className="hd fin">
          <b>The Nursery</b>
          <i>{finalists.length} potted up on the windowsill</i>
        </div>
      </div>
    );
  }

  return (
    <div className="ns" style={{ width: 1280, height: 1080 }}>
      <style>{CSS}</style>
      <div className="bench" />
      <div className="tray">
        {view.cats.map((cat, n) => {
          const gone = cat.eliminated && !cat.fading;
          return (
            <div
              key={cat.id}
              className={cn(
                "cell",
                cat.marked && "pull",
                cat.potential && "maybe",
                cat.favorite && !gone && "sun",
                cat.fading && "thinning",
              )}
              style={{
                left: (n % columns) * cellW + 5,
                top: Math.floor(n / columns) * cellH + 5,
                width: cellW - 10,
                height: cellH - 10,
              }}
            >
              {!gone ? (
                <BatchSprite
                  cat={cat}
                  size={sprite}
                  className="sprite"
                  style={{ left: (cellW - 10 - sprite) / 2, top: 4 }}
                />
              ) : null}
              {gone ? (
                <div className="label flat">
                  <b>{cat.numberLabel}</b>
                  <span>composted</span>
                </div>
              ) : (
                <div className="label">
                  <b>{cat.numberLabel}</b>
                  <span>{cat.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="col">
        <div className="hd">
          <b>The Nursery</b>
          <i>{view.title}</i>
          <span>
            {view.remaining} seedlings · {view.finalCount} get potted up
          </span>
        </div>
        <div className={cn("pot", !view.spotlight && "empty")}>
          <div className="ph">
            {view.spotlight
              ? "potted up for a closer look"
              : "an empty pot — show a kit"}
          </div>
          {view.spotlight ? (
            <BatchSprite cat={view.spotlight} size={190} className="sprite" />
          ) : null}
          <div className="pb" />
          {view.spotlight ? (
            <div className="plab">
              <b>{view.spotlight.numberLabel}</b>
              {view.spotlight.label}
            </div>
          ) : null}
        </div>
        <div className="ruler">
          <i className="rh">
            growth · watering {view.stageNumber} of {view.stages.length}
          </i>
          {view.stages.map((stage, k) => (
            <i
              key={stage.id}
              className={cn(
                k <= view.stageIndex && "w",
                k === view.stageIndex && "c",
              )}
            >
              <b>{k + 1}</b>
              {stage.label}
            </i>
          ))}
        </div>
        <div className="bin">
          <i>compost</i>
          <b>
            {view.eliminated.length ? eliminatedNumbers(view.eliminated) : "—"}
          </b>
        </div>
      </div>
      <div className="note">
        {view.phase === "awaitingCull"
          ? `thin out one seedling after this watering — call its number (${view.cullNumber} of ${view.maxEliminations})`
          : view.statusLabel}
      </div>
    </div>
  );
}
