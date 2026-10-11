"use client";

import { cn } from "@/lib/utils";
import { fixedGridColumns } from "./batchLayout";
import { BatchQr, BatchSprite } from "./batchShared";
import type { BatchSceneViewProps } from "./batchView";

const SANS = "var(--obs-font-sans,'Helvetica Neue',Arial,sans-serif)";
const CSS = `
.ab{position:absolute;inset:0;background:#2b2140;font-family:${SANS};overflow:hidden}
.ab .page{position:absolute;top:30px;bottom:30px;background:#fbf7ee;box-shadow:0 20px 60px rgba(0,0,0,.6);background-image:radial-gradient(circle at 20% 10%,rgba(255,180,220,.25),transparent 40%),radial-gradient(circle at 80% 90%,rgba(140,220,255,.25),transparent 40%)}
.ab .l{left:30px;width:340px;border-radius:14px 2px 2px 14px}
.ab .r{left:384px;width:866px;border-radius:2px 14px 14px 2px}
.ab .l.wide{width:780px}.ab .r.order{left:830px;width:420px;text-align:center}
.ab .r.order .qr{display:inline-block;margin:40px auto 0;border-radius:10px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.2)}
.ab .of{font:700 18px ${SANS};color:#1b2a4a;margin-top:16px}
.ab .hdr{padding:20px 24px 8px;border-bottom:4px dotted #ffb84a}
.ab .hdr b{display:block;font:900 30px ${SANS};color:#1b2a4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab .hdr span{font:700 12px ${SANS};color:#8c6a2a;text-transform:uppercase;letter-spacing:.12em}
.ab .slots{display:grid;grid-template-columns:repeat(2,130px);gap:10px 18px;padding:18px 24px 0}
.ab .slots.big{padding:28px;gap:16px}
.ab .slot{height:78px;border:3px dashed #c8c0b0;border-radius:12px;position:relative;background:rgba(255,255,255,.5)}
.ab .slot em{position:absolute;left:8px;top:5px;font:900 15px ${SANS};color:#c8c0b0;font-style:normal}
.ab .slot .need{position:absolute;left:0;right:0;top:34%;text-align:center;font:900 14px ${SANS};color:#e05a7a;transform:rotate(-12deg);letter-spacing:.2em;opacity:.65;border:2px solid #e05a7a;margin:0 24px;border-radius:4px}
.ab .slot.full{border-style:solid;border-color:#ffb84a;background:#fff}
.ab .slot.full .stk{position:absolute;left:3px;top:3px}
.ab .slot.full .nb{position:absolute;left:-6px;top:-6px}
.ab .slot.full .nm{position:absolute;bottom:6px;left:0;right:0;text-align:center;font:900 13px ${SANS};color:#1b2a4a}
.ab .foot{position:absolute;bottom:18px;left:24px;right:24px;font:700 15px ${SANS};color:#8c6a2a}
.ab .foot b{color:#e0322b}
.ab .sheet{position:absolute;left:24px;top:110px;width:790px;height:840px;background:#fff;border-radius:6px;box-shadow:inset 0 0 0 1px #e6e0d4}
.ab .cell{position:absolute;transition:opacity .9s ease,transform .9s ease}
.ab .stk{position:relative;border-radius:50% 50% 46% 46%/44% 44% 56% 56%;background:#ffe8b0;box-shadow:0 2px 0 #fff,0 3px 6px rgba(0,0,0,.25);overflow:hidden;border:3px solid #fff;margin:0 auto}
.ab .stk .sprite{position:absolute;left:0;top:0}
.ab .nb{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;font:800 16px var(--obs-font-mono,ui-monospace,monospace);background:#ffb84a;color:#1b2a4a;box-shadow:0 2px 0 #c98a2a;flex:none}
.ab .cell .nb{position:absolute;left:2px;top:0;z-index:2}
.ab .foil{position:absolute;inset:0;background:repeating-linear-gradient(135deg,#d9d9df 0 4px,#a9a9b3 4px 8px,#eeeef2 8px 12px);opacity:.95;transition:clip-path .8s ease}
.ab .stk.gone{background:#fff;border:3px dashed #d9d2c4;box-shadow:none}
.ab .stk.gone span{position:absolute;left:0;right:0;top:40%;text-align:center;font:900 13px ${SANS};color:#2f6fde;letter-spacing:.14em;transform:rotate(-14deg);border:2px solid #2f6fde;margin:0 14%;opacity:.7}
.ab .cell.peeled .nb{background:#e6e0d4;color:#9a9184;box-shadow:none}
.ab .cell .nm{position:absolute;left:0;right:0;text-align:center;font:800 13px ${SANS};color:#4a443c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab .cell.peeled .nm{color:#b8b0a2;text-decoration:line-through}
.ab .cell.lifting{opacity:0;transform:translateY(-60px) rotate(-12deg)}
.ab .tab{position:absolute;top:-4px;right:-2px;font:900 12px ${SANS};padding:4px 7px;border-radius:4px;transform:rotate(12deg);font-style:normal;box-shadow:0 2px 4px rgba(0,0,0,.3);z-index:3}
.ab .tab.red{background:#e0322b;color:#fff;animation:ab-pulse 1.1s ease-in-out infinite}
.ab .tab.yel{background:#ffd23f;color:#5a4300;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:18px;padding:0}
.ab .holostar{position:absolute;right:2px;top:-6px;font-size:28px;font-style:normal;z-index:3;background:linear-gradient(45deg,#ff9fd6,#ffe37a,#8df0ff,#c89cff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
.ab .cell.swap .stk{box-shadow:0 0 0 4px #e0322b,0 3px 6px rgba(0,0,0,.25)}
.ab .cell.maybe .stk{box-shadow:0 0 0 4px #ffd23f,0 3px 6px rgba(0,0,0,.25)}
.ab .pack{position:absolute;right:18px;top:12px;width:110px;background:#ff5a8a;color:#fff;padding:10px;border-radius:10px;transform:rotate(6deg);text-align:center;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.ab .pack b{display:block;font:900 18px ${SANS}}.ab .pack span{display:block;font:700 10px ${SANS};letter-spacing:.12em}
.ab .swapped{position:absolute;left:24px;right:24px;top:560px;color:#1b2a4a}
.ab .swapped .rh{font:700 12px ${SANS};letter-spacing:.3em;text-transform:uppercase;opacity:.7;margin-bottom:6px}
.ab .swapped .row{display:flex;flex-wrap:wrap;gap:6px}
.ab .swapped .nb{width:28px;height:28px;font-size:13px;background:#e6e0d4;color:#9a9184;box-shadow:none}
.ab .swapped .none{font:italic 13px Georgia,serif;color:#8c6a2a}
.ab .lift{position:absolute;left:50px;top:790px;width:230px;height:230px;border-radius:50% 50% 46% 46%/44% 44% 56% 56%;background:#ffe8b0;border:8px solid #fff;box-shadow:0 30px 50px rgba(0,0,0,.5);transform:rotate(-7deg);overflow:hidden}
.ab .lift .sprite{position:absolute;left:28px;top:0}
.ab .lift .nb{position:absolute;left:22px;top:22px;width:40px;height:40px;font-size:20px}
.ab .lift span{position:absolute;left:0;right:0;bottom:22px;text-align:center;font:900 18px ${SANS};color:#1b2a4a}
.ab .lift.empty{background:rgba(255,255,255,.5);border:4px dashed #c8c0b0;box-shadow:none}
.ab .lift.empty span{font:italic 14px Georgia,serif;color:#8c6a2a;bottom:100px}
.ab .done{position:absolute;left:0;right:0;bottom:40px;text-align:center;font:900 54px ${SANS};color:#ffb84a;-webkit-text-stroke:2px #1b2a4a;letter-spacing:.06em;transform:rotate(-4deg)}
.ab .ttl{position:absolute;left:0;right:0;bottom:8px;text-align:center;font:700 11px ${SANS};color:#8a7fa8;letter-spacing:.3em;text-transform:uppercase}
@keyframes ab-pulse{50%{transform:rotate(12deg) scale(1.12)}}
`;

/** Foil still covering a sticker: shrinks from the bottom-right as stages pass. */
function foilClip(progress: number): string {
  // progress 0 → full foil, 1 → none. Jagged edge sweeping towards the corner.
  const p = Math.min(1, Math.max(0, progress));
  const a = 100 - 100 * p; // where the foil starts (x/y %)
  if (p >= 1) return "polygon(100% 100%,100% 100%,100% 100%)";
  return `polygon(100% 100%,${a}% 100%,${a + 8}% ${84 + (100 - 84) * p}%,${Math.max(0, a - 6)}% ${70 + 30 * p}%,${a + 14}% ${56 + 44 * p}%,${a + 22}% ${40 + 60 * p}%,100% ${36 + 64 * p}%)`;
}

/**
 * A collector's album spread: the left page has one empty NEED slot per
 * finalist (the goal, as an object) and the lifted sticker; the right page
 * is the numbered sticker sheet under scratch-off foil. Culls are swapped
 * away and leave their numbered backing.
 */
export function AlbumBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const done = view.phase === "done";
  const columns = fixedGridColumns(view.poolSize);
  const rows = Math.ceil(view.poolSize / columns);
  const cellW = 790 / columns;
  const cellH = 840 / rows;
  const sticker = Math.max(60, Math.floor(Math.min(cellW, cellH) - 34));
  const sprite = sticker - 8;
  // Half a stage of foil comes off while the current stage is still rolling.
  const stageStep = view.phase === "revealing" ? 0.5 : 1;
  const progress = view.stages.length
    ? (view.stageIndex + stageStep) / view.stages.length
    : 1;
  const foil = foilClip(progress);
  const spot = view.spotlight;

  if (done) {
    const finalists = view.survivors;
    const slotCols = Math.min(5, Math.max(1, finalists.length));
    const slotW = Math.floor((780 - 56 - (slotCols - 1) * 16) / slotCols);
    return (
      <div className="ab" style={{ width: 1280, height: 1080 }}>
        <style>{CSS}</style>
        <div className="page l wide">
          <div className="hdr">
            <b>{view.title}</b>
            <span>Album page 1 · {finalists.length} stickers</span>
          </div>
          <div
            className="slots big"
            style={{ gridTemplateColumns: `repeat(${slotCols}, ${slotW}px)` }}
          >
            {finalists.map((cat) => (
              <div
                key={cat.id}
                className="slot full"
                style={{ height: slotW + 40 }}
              >
                <div
                  className="stk"
                  style={{ width: slotW - 6, height: slotW - 6 }}
                >
                  <BatchSprite cat={cat} size={slotW - 12} className="sprite" />
                </div>
                <b className="nb">{cat.numberLabel}</b>
                <span className="nm">{cat.label}</span>
              </div>
            ))}
          </div>
          <div className="done">COMPLETE!</div>
        </div>
        <div className="page r order">
          <div className="hdr">
            <b>Order form</b>
            <span>
              {view.qrUrl ? "missing none · litter ready" : view.statusLabel}
            </span>
          </div>
          {view.qrUrl ? (
            <>
              <span className="qr">
                <BatchQr
                  url={view.qrUrl}
                  size={240}
                  fg="#1b2a4a"
                  bg="#ffffff"
                />
              </span>
              <div className="of">Scan to adopt from this litter</div>
            </>
          ) : null}
        </div>
        <div className="ttl">{view.title}</div>
      </div>
    );
  }

  return (
    <div className="ab" style={{ width: 1280, height: 1080 }}>
      <style>{CSS}</style>
      <div className="page l">
        <div className="hdr">
          <b>{view.title}</b>
          <span>{view.finalCount} to fill</span>
        </div>
        <div className="slots">
          {Array.from({ length: view.finalCount }, (_, n) => (
            <div key={`slot-${n.toString()}`} className="slot">
              <em>{String(n + 1).padStart(2, "0")}</em>
              <span className="need">NEED</span>
            </div>
          ))}
        </div>
        <div className="swapped">
          <div className="rh">Swapped away</div>
          <div className="row">
            {view.eliminated.length === 0 ? (
              <span className="none">none yet</span>
            ) : (
              view.eliminated.map((cat) => (
                <b key={cat.id} className="nb">
                  {cat.numberLabel}
                </b>
              ))
            )}
          </div>
        </div>
        {spot ? (
          <div className="lift">
            <BatchSprite cat={spot} size={190} className="sprite" />
            <i className="foil" style={{ clipPath: foil }} />
            <b className="nb">{spot.numberLabel}</b>
            <span>{spot.label}</span>
          </div>
        ) : (
          <div className="lift empty">
            <span>lift a sticker to look closer</span>
          </div>
        )}
      </div>

      <div className="page r">
        <div className="hdr">
          <b>Sticker sheet</b>
          <span>
            {view.remaining} left of {view.poolSize} · scratch{" "}
            {view.stageNumber}/{view.stages.length} · {view.stageLabel}
          </span>
        </div>
        <div className="pack">
          <b>PACK {view.stageNumber}</b>
          <span>{view.stageLabel.toUpperCase()}</span>
        </div>
        <div className="sheet">
          {view.cats.map((cat, n) => {
            const x = (n % columns) * cellW;
            const y = Math.floor(n / columns) * cellH;
            const gone = cat.eliminated && !cat.fading;
            return (
              <div
                key={cat.id}
                className={cn(
                  "cell",
                  gone && "peeled",
                  cat.marked && "swap",
                  cat.potential && "maybe",
                  cat.fading && "lifting",
                )}
                style={{ left: x, top: y, width: cellW, height: cellH }}
              >
                {gone ? (
                  <div
                    className="stk gone"
                    style={{ width: sticker, height: sticker, marginTop: 2 }}
                  >
                    <span>SWAPPED</span>
                  </div>
                ) : (
                  <div
                    className="stk"
                    style={{ width: sticker, height: sticker, marginTop: 2 }}
                  >
                    <BatchSprite
                      cat={cat}
                      size={sprite}
                      className="sprite"
                      style={{ left: 1, top: 0 }}
                    />
                    <i className="foil" style={{ clipPath: foil }} />
                  </div>
                )}
                <b className="nb">{cat.numberLabel}</b>
                {cat.marked ? <i className="tab red">SWAP?</i> : null}
                {cat.potential ? <i className="tab yel">?</i> : null}
                {cat.favorite && !gone ? <i className="holostar">★</i> : null}
                <span className="nm" style={{ top: sticker + 6 }}>
                  {cat.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="foot">
          {view.phase === "awaitingCull" ? (
            <>
              {"pick one to "}
              <b>SWAP</b>
              {` away — ${view.cullNumber} of ${view.maxEliminations} · say its number`}
            </>
          ) : (
            view.statusLabel
          )}
        </div>
      </div>
      <div className="ttl">{view.title}</div>
    </div>
  );
}
