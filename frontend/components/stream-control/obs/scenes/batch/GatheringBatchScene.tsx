"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { scatter } from "../../looks/motion";
import { centredRows, packSquares } from "./batchLayout";
import { BatchQr, BatchSprite, floorCats } from "./batchShared";
import type {
  BatchSceneViewProps,
  BatchShowView,
  BatchViewCat,
} from "./batchView";

const CSS = `
.gb{position:absolute;inset:0;overflow:hidden;background:#050812;color:#c9d3e6;font-family:var(--obs-font-serif,Georgia,serif)}
.gb .sky{position:absolute;inset:0;background:linear-gradient(#03050d,#0b1430 55%,#15284a 80%)}
.gb .moon{position:absolute;right:430px;top:70px;width:100px;height:100px;border-radius:50%;background:#f4f0dc;box-shadow:0 0 60px 20px rgba(244,240,220,.35),0 0 200px 80px rgba(200,220,255,.12);transition:top 1.2s ease,right 1.2s ease}
.gb .moon.high{top:60px;right:560px}
.gb .tree{position:absolute;bottom:260px;width:260px;height:900px;background:#040710;border-radius:40% 40% 0 0/14% 14% 0 0;box-shadow:0 0 80px rgba(0,0,0,.8)}
.gb .t1{left:-120px;width:230px}.gb .t2{left:150px;height:760px;width:170px;bottom:300px}.gb .t3{right:150px;height:800px;width:170px;bottom:300px}.gb .t4{right:-120px;width:230px}
.gb .floor{position:absolute;left:0;right:0;bottom:0;height:600px;background:radial-gradient(ellipse at 50% 20%,#1d3a3a,#0f2027 50%,#07111a 80%)}
.gb .rock{position:absolute;left:400px;top:320px;width:440px;height:220px;background:linear-gradient(#36405a,#1a2133);border-radius:46% 54% 10% 10%/60% 60% 10% 10%;box-shadow:0 30px 60px rgba(0,0,0,.7);transition:all 1.2s ease}
.gb .rock.big{left:140px;top:520px;width:1000px;height:260px}
.gb .rt{position:absolute;left:30px;right:30px;top:0;height:40px;border-radius:50%;background:rgba(244,240,220,.12)}
.gb .nb{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;font:800 16px var(--obs-font-mono,ui-monospace,monospace);background:#f4f0dc;color:#0b1430;box-shadow:0 0 12px rgba(244,240,220,.5);flex:none}
.gb .onrock{position:absolute;left:560px;top:112px;width:220px;text-align:center}
.gb .onrock .nb{position:absolute;left:-10px;top:120px;width:44px;height:44px;font-size:22px}
.gb .onrock span{display:block;font:italic 24px var(--obs-font-serif,Georgia,serif);letter-spacing:.1em;color:#f4f0dc;text-shadow:0 2px 10px #000}
.gb .onrock .sprite{margin:0 auto;filter:drop-shadow(0 0 18px rgba(244,240,220,.45))}
.gb .empty{position:absolute;left:580px;top:250px;width:280px;text-align:center;font:italic 15px var(--obs-font-serif,Georgia,serif);color:#5b6a8a}
.gb .cat{position:absolute;text-align:center;transition:opacity 1.5s ease,transform 1.5s ease}
.gb .cat .nb{position:absolute;left:0;top:18px;z-index:2}
.gb .cat .sprite{margin:0 auto;filter:brightness(.85) saturate(.9) drop-shadow(0 6px 10px rgba(0,0,0,.8));animation:gb-bob 2.6s ease-in-out var(--gb-bob-delay,0s) infinite}
.gb .cat .sprite.obs-batch-landed{animation:gb-bob 2.6s ease-in-out var(--gb-bob-delay,0s) infinite,obs-batch-land 300ms ease-out}
.gb .cat span{display:block;font:italic 14px var(--obs-font-serif,Georgia,serif);color:#c9d3e6;margin-top:-4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gb .cat.gaze .sprite{filter:brightness(1.15) drop-shadow(0 0 22px rgba(244,240,220,.8))}
.gb .cat.gaze span{color:#fff;font-weight:700}
.gb .cat.gaze::before{content:"";position:absolute;left:-30%;right:-30%;top:-10px;bottom:10px;border-radius:50%;background:radial-gradient(ellipse,rgba(244,240,220,.3),transparent 65%);animation:gb-gaze 1.6s ease-in-out infinite}
.gb .cat.gaze::after{content:"the leader's gaze";position:absolute;left:0;right:0;bottom:-16px;font:italic 11px var(--obs-font-serif,Georgia,serif);color:#f2d27a}
.gb .cat.fire .fly{position:absolute;left:10%;top:10%;width:6px;height:6px;border-radius:50%;background:#ffe27a;box-shadow:70px 20px 0 #ffe27a,30px -16px 0 #ffd24a,80px -8px 0 #fff2a8,-6px 40px 0 #ffe27a;animation:gb-fly 2.2s ease-in-out infinite}
.gb .cat.star span::before{content:"✦ ";color:#f2d27a}
.gb .cat.leaving{opacity:0;transform:translateX(-160px) scale(.8)}
.gb .hd{position:absolute;left:60px;top:36px}
.gb .hd b{display:block;font:400 13px var(--obs-font-serif,Georgia,serif);letter-spacing:.5em;text-transform:uppercase;color:#9fb0cc}
.gb .hd i{display:block;font:italic 38px var(--obs-font-serif,Georgia,serif);color:#f4f0dc;margin-top:2px}
.gb .path{position:relative;height:62px;width:380px;margin-top:12px}
.gb .path b{position:absolute;width:9px;height:9px;border-radius:50%;background:#2a3858;box-shadow:0 0 0 1px #3c4e76}
.gb .path b.p{background:#9fb0cc}.gb .path b.m{background:#f4f0dc;width:16px;height:16px;margin:-4px;box-shadow:0 0 18px #f4f0dc}
.gb .st{font:700 14px var(--obs-font-sans,sans-serif);letter-spacing:.2em;color:#f4f0dc}
.gb .ct{font:italic 15px var(--obs-font-serif,Georgia,serif);color:#9fb0cc;margin-top:4px}
.gb .plq{width:560px;height:120px;margin-top:10px;--obs-plaque-ink:#f4f0dc;--obs-plaque-muted:#9fb0cc;--obs-plaque-accent:#f2d27a;--obs-plaque-font-serif:var(--obs-font-serif,Georgia,serif)}
.gb .home{position:absolute;right:48px;top:40px;width:300px;background:rgba(5,8,18,.55);padding:12px 16px;border:1px solid rgba(159,176,204,.25)}
.gb .home .rh{font:700 12px var(--obs-font-sans,sans-serif);letter-spacing:.3em;text-transform:uppercase;color:#9fb0cc;margin-bottom:6px}
.gb .home .row{display:flex;flex-wrap:wrap;gap:6px}
.gb .home .nb{width:30px;height:30px;font-size:14px;background:#2a3858;color:#9fb0cc;box-shadow:none}
.gb .home .none{font:italic 13px var(--obs-font-serif,Georgia,serif);color:#5b6a8a}
.gb .moonstone{position:absolute;left:520px;top:800px;width:240px;text-align:center;font:italic 14px var(--obs-font-serif,Georgia,serif);color:#9fb0cc}
.gb .moonstone span{display:block}
.gb .moonstone .qr{display:inline-block;margin:0 auto 8px;box-shadow:0 0 50px rgba(200,220,255,.35);border-radius:6px;overflow:hidden}
@keyframes gb-gaze{50%{opacity:.5}}
@keyframes gb-fly{50%{transform:translate(6px,-8px)}}
@keyframes gb-bob{0%,100%{translate:0 0}50%{translate:0 -6px}}
`;

type Area = { x: number; y: number; w: number; h: number };

/** Negative delay so each kit bobs at its own phase (deterministic per index). */
function bobPhase(index: number): CSSProperties {
  return {
    "--gb-bob-delay": `${(-scatter(index + 1) * 2.6).toFixed(2)}s`,
  } as CSSProperties;
}

function MoonPath({
  view,
  stageCount,
}: Readonly<{ view: BatchShowView; stageCount: number }>) {
  const span = Math.max(1, stageCount - 1);
  return (
    <div className="path">
      {view.stages.map((stage, k) => (
        <b
          key={stage.id}
          className={cn(
            k < view.stageIndex && "p",
            k === view.stageIndex && "m",
          )}
          style={{
            left: k * (360 / span),
            top: 48 - 40 * Math.sin((Math.PI * k) / span),
          }}
        />
      ))}
    </div>
  );
}

function GatheringHeader({
  view,
  done,
}: Readonly<{ view: BatchShowView; done: boolean }>) {
  const stageCount = view.stages.length;
  return (
    <div className="hd">
      <b>The Gathering</b>
      <i>{view.title}</i>
      {done ? null : <MoonPath view={view} stageCount={stageCount} />}
      <div className="st">
        {done
          ? "THE GATHERING ENDS"
          : `moon ${view.stageNumber} of ${stageCount}`}
      </div>
      <div className="ct">
        {done
          ? `${view.remaining} kits stand on the Great Rock`
          : `${view.remaining} in the clearing · ${view.finalCount} will climb the rock`}
      </div>
      {/* The wrapper's plaque (trait · status · tally) sits under the moon path. */}
      <div data-plaque-slot="" className="plq" />
    </div>
  );
}

function WentHome({ cats }: Readonly<{ cats: readonly BatchViewCat[] }>) {
  return (
    <div className="home">
      <div className="rh">Went home</div>
      <div className="row">
        {cats.length === 0 ? (
          <span className="none">no one yet</span>
        ) : (
          cats.map((cat) => (
            <b key={cat.id} className="nb">
              {cat.numberLabel}
            </b>
          ))
        )}
      </div>
    </div>
  );
}

function OnTheRock({
  spotlight,
}: Readonly<{ spotlight: BatchViewCat | null }>) {
  if (!spotlight) {
    return (
      <div className="empty">the Great Rock waits for a kit to be shown</div>
    );
  }
  return (
    <div className="onrock">
      <b className="nb">{spotlight.numberLabel}</b>
      <BatchSprite cat={spotlight} size={220} className="sprite" />
      <span>{spotlight.label}</span>
    </div>
  );
}

function FloorKits({
  cats,
  area,
  cell,
  columns,
}: Readonly<{
  cats: readonly BatchViewCat[];
  area: Area;
  cell: number;
  columns: number;
}>) {
  const sprite = Math.max(48, cell - 40);
  const placed = centredRows(cats.length, columns, area.w, cell);
  return (
    <>
      {cats.map((cat, i) => {
        const pos = placed[i];
        if (!pos) return null;
        return (
          <div
            key={cat.id}
            className={cn(
              "cat",
              cat.marked && "gaze",
              cat.potential && "fire",
              cat.favorite && "star",
              cat.fading && "leaving",
            )}
            style={{
              left: area.x + pos.x,
              top: area.y + pos.row * (cell + 14),
              width: cell,
            }}
          >
            <b className="nb">{cat.numberLabel}</b>
            {cat.potential ? <i className="fly" /> : null}
            <BatchSprite
              cat={cat}
              size={sprite}
              flip={i % 2 === 1}
              className="sprite"
              style={bobPhase(i)}
            />
            <span>{cat.label}</span>
          </div>
        );
      })}
    </>
  );
}

/**
 * A moonlit clearing at Fourtrees: kits sit below the Great Rock, the moon's
 * path across the top is the stage progress, the spotlight kit stands on
 * the rock, and culled kits "go home" into the trees.
 */
export function GatheringBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const done = view.phase === "done";
  const floor = done
    ? [...view.survivors]
    : floorCats(view.survivors, view.spotlight);
  // Clearing: x 60–1220, y 545–1060 (done: above the big rock, y 270–520).
  const area: Area = done
    ? { x: 160, y: 270, w: 960, h: 250 }
    : { x: 60, y: 545, w: 1160, h: 500 };
  const grid = packSquares(floor.length, area.w, area.h, 14, done ? 150 : 170);

  return (
    <div className="gb" style={{ width: 1280, height: 1080 }}>
      <style>{CSS}</style>
      <div className="sky" />
      <div className={cn("moon", done && "high")} />
      <div className="tree t1" />
      <div className="tree t2" />
      <div className="tree t3" />
      <div className="tree t4" />
      <div className="floor" />
      <div className={cn("rock", done && "big")}>
        <div className="rt" />
      </div>
      {done ? null : <OnTheRock spotlight={view.spotlight} />}
      <GatheringHeader view={view} done={done} />
      {done ? null : <WentHome cats={view.eliminated} />}
      <FloorKits
        cats={floor}
        area={area}
        cell={grid.cell}
        columns={grid.columns}
      />
      {done && view.qrUrl ? (
        <div className="moonstone">
          <span className="qr">
            <BatchQr url={view.qrUrl} size={190} fg="#dfe9ff" bg="#0b1428" />
          </span>
          <span>Scan the Moonstone · adopt from this litter</span>
        </div>
      ) : null}
    </div>
  );
}
