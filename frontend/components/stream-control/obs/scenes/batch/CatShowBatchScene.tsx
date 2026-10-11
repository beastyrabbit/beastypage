"use client";

import { cn } from "@/lib/utils";
import { centredRows, packSquares } from "./batchLayout";
import {
  BatchQr,
  BatchSprite,
  eliminatedNumbers,
  floorCats,
} from "./batchShared";
import type {
  BatchSceneViewProps,
  BatchShowView,
  BatchViewCat,
} from "./batchView";

const SANS = "var(--obs-font-sans,'Helvetica Neue',Arial,sans-serif)";
const MONO = "var(--obs-font-mono,ui-monospace,monospace)";
const SERIF = "var(--obs-font-serif,Georgia,serif)";
const CSS = `
.cs{position:absolute;inset:0;overflow:hidden;background:#e9e2cf;font-family:${SANS};color:#2a2622}
.cs .wall{position:absolute;left:0;right:0;top:0;height:560px;background:linear-gradient(#d9e5d8,#c7d6c4)}
.cs .flo{position:absolute;left:0;right:0;top:560px;bottom:0;background:repeating-linear-gradient(90deg,#c9a46a 0 60px,#b9935b 60px 120px);box-shadow:inset 0 30px 40px rgba(0,0,0,.15)}
.cs .bunting{position:absolute;left:0;right:0;top:0;height:30px;display:flex;justify-content:space-between;padding:0 20px}
.cs .bunting i{width:36px;height:30px;clip-path:polygon(0 0,100% 0,50% 100%);background:#e05a7a}
.cs .bunting i:nth-child(2n){background:#ffb84a}.cs .bunting i:nth-child(3n){background:#2f6fde}
.cs .banner{position:absolute;left:60px;top:48px;width:520px;background:#fff;border:3px solid #2a2622;padding:12px 18px;box-shadow:6px 6px 0 #2a2622}
.cs .banner b{display:block;font:900 30px ${SANS};letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs .banner span{display:block;font:700 15px ${SANS};color:#e05a7a;letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
.cs .banner em{display:block;font:italic 14px ${SERIF};color:#6b6459;margin-top:4px}
.cs .ped{position:absolute;text-align:center;transition:opacity 1s ease,transform 1s ease}
.cs .ped .sprite{margin:0 auto;position:relative;z-index:2}
.cs .base{height:22px;margin:-6px 10px 0;background:#f6f1e4;border:2px solid #2a2622;border-radius:4px;box-shadow:0 6px 0 #a89a7c}
.cs .tent{margin:8px 16px 0;background:#fff;border:2px solid #2a2622;border-radius:4px;padding:2px 4px 4px}
.cs .tent b{display:block;font:900 24px ${MONO};line-height:1}
.cs .tent span{display:block;font:700 11px ${SANS};color:#6b6459;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs .ped.judge .tent{border-color:#e0322b;box-shadow:0 0 0 3px #e0322b;animation:cs-pulse 1.1s ease-in-out infinite}
.cs .ped.judge .tent b{color:#e0322b}
.cs .ped.maybe .tent{background:#fff4c2;border-color:#d9a400}
.cs .ros{position:absolute;right:10px;top:-6px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle,#ffd23f 0 30%,#e05a7a 32%);box-shadow:0 0 0 3px #fff;z-index:3}
.cs .ped.excusing{opacity:0;transform:translateY(40px)}
.cs .table{position:absolute;left:920px;top:250px;width:320px;height:420px}
.cs .tcloth{position:absolute;left:0;right:0;top:230px;height:150px;background:#2f6fde;border-radius:6px 6px 0 0;box-shadow:inset 0 -40px 0 #2457b3}
.cs .table .on{position:absolute;left:45px;top:10px;filter:drop-shadow(0 10px 10px rgba(0,0,0,.35))}
.cs .tcard{position:absolute;left:40px;top:260px;width:240px;background:#fff;border:2px solid #2a2622;padding:8px 10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cs .nb{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;font:800 15px ${MONO};background:#2a2622;color:#fff;flex:none}
.cs .tcard span{font:900 18px ${SANS}}
.cs .tcard i{width:100%;font:11px ${MONO};color:#6b6459}
.cs .excused{position:absolute;left:920px;top:700px;width:320px;background:#fff;border:2px dashed #2a2622;padding:8px 12px;font-family:${MONO}}
.cs .excused i{display:block;font:italic 12px ${SERIF};color:#6b6459}
.cs .excused b{font:700 20px ${MONO};letter-spacing:.2em;color:#6b6459;text-decoration:line-through;word-break:break-word}
.cs .ring{position:absolute;left:60px;right:60px;bottom:22px;text-align:center;font:italic 15px ${SERIF};color:#6b6459}
.cs .bigros{position:absolute;left:520px;top:640px;width:240px;text-align:center}
.cs .rosc{width:200px;height:200px;margin:0 auto;border-radius:50%;background:radial-gradient(circle,#fff 0 46%,#e05a7a 47% 60%,#ffd23f 61%);display:flex;align-items:center;justify-content:center}
.cs .rosc .qr{border-radius:50%;overflow:hidden;width:150px;height:150px;display:flex;align-items:center;justify-content:center;background:#fff}
.cs .bigros span{display:block;margin-top:8px;font:900 15px ${SANS}}
@keyframes cs-pulse{50%{box-shadow:0 0 0 6px rgba(224,50,43,.5)}}
`;

type Area = { x: number; y: number; w: number; h: number };

function Pedestals({
  cats,
  area,
  cell,
  columns,
  done,
}: Readonly<{
  cats: readonly BatchViewCat[];
  area: Area;
  cell: number;
  columns: number;
  done: boolean;
}>) {
  const sprite = Math.max(44, Math.round(cell * 0.58));
  const placed = centredRows(cats.length, columns, area.w, cell);
  return (
    <>
      {cats.map((cat, i) => {
        const pos = placed[i];
        if (!pos) return null;
        const stagger = done && i % 2 ? 60 : 0;
        return (
          <div
            key={cat.id}
            className={cn(
              "ped",
              cat.marked && "judge",
              cat.potential && "maybe",
              cat.fading && "excusing",
            )}
            style={{
              left: area.x + pos.x,
              top: area.y + pos.row * (cell + 10) + stagger,
              width: cell,
            }}
          >
            <BatchSprite cat={cat} size={sprite} className="sprite" />
            <div className="base" />
            <div className="tent">
              <b>{cat.numberLabel}</b>
              <span>{cat.label}</span>
            </div>
            {cat.favorite || done ? <i className="ros" /> : null}
          </div>
        );
      })}
    </>
  );
}

function JudgeTable({
  spotlight,
}: Readonly<{ spotlight: BatchViewCat | null }>) {
  return (
    <div className="table">
      <div className="tcloth" />
      {spotlight ? (
        <>
          <BatchSprite cat={spotlight} size={230} className="on" />
          <div className="tcard">
            <b className="nb">{spotlight.numberLabel}</b>
            <span>{spotlight.label}</span>
            <i>on the judge's table</i>
          </div>
        </>
      ) : (
        <div className="tcard">
          <i>the judge's table is empty — show a kit</i>
        </div>
      )}
    </div>
  );
}

function RingSide({ view }: Readonly<{ view: BatchShowView }>) {
  return (
    <>
      <JudgeTable spotlight={view.spotlight} />
      <div className="excused">
        <i>excused</i>
        <b>
          {view.eliminated.length ? eliminatedNumbers(view.eliminated) : "—"}
        </b>
      </div>
      <div className="ring">
        {view.phase === "awaitingCull"
          ? "the judge excuses one after this class — call a number"
          : view.statusLabel}
      </div>
    </>
  );
}

function BestInShowRosette({ view }: Readonly<{ view: BatchShowView }>) {
  return (
    <div className="bigros">
      <div className="rosc">
        <span className="qr">
          {view.qrUrl ? (
            <BatchQr url={view.qrUrl} size={140} fg="#1a1a1a" bg="#ffffff" />
          ) : (
            <b style={{ font: `900 14px ${SANS}` }}>{view.statusLabel}</b>
          )}
        </span>
      </div>
      <span>{view.qrUrl ? "Scan to adopt from this litter" : ""}</span>
    </div>
  );
}

/**
 * A cat show: kits benched on numbered pedestals with tent cards, bunting
 * overhead. The judge handles the spotlight kit on the table, excuses one
 * kit per class, and the finale is Best in Show with the QR in a rosette.
 */
export function CatShowBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const done = view.phase === "done";
  const floor = done
    ? [...view.survivors]
    : floorCats(view.survivors, view.spotlight);
  const area: Area = done
    ? { x: 60, y: 300, w: 1160, h: 300 }
    : { x: 40, y: 220, w: 860, h: 800 };
  const grid = done
    ? {
        columns: Math.max(1, floor.length),
        cell: Math.min(150, 1160 / Math.max(1, floor.length)),
      }
    : packSquares(floor.length, area.w, area.h, 10, 200);

  return (
    <div className="cs" style={{ width: 1280, height: 1080 }}>
      <style>{CSS}</style>
      <div className="wall" />
      <div className="flo" />
      <div className="bunting">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={`b-${i.toString()}`} />
        ))}
      </div>
      <div className="banner">
        <b>{done ? "Best in Show" : view.title}</b>
        <span>
          {done
            ? `${view.title} · ${view.remaining} kits`
            : `Class ${view.stageNumber} of ${view.stages.length} · ${view.stageLabel}`}
        </span>
        {done ? null : (
          <em>{`${view.remaining} benched · ${view.finalCount} go to Best in Show`}</em>
        )}
      </div>
      <Pedestals
        cats={floor}
        area={area}
        cell={grid.cell}
        columns={grid.columns}
        done={done}
      />
      {done ? <BestInShowRosette view={view} /> : <RingSide view={view} />}
    </div>
  );
}
