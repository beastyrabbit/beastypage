"use client";

import { cn } from "@/lib/utils";
import { centredRows, packSquares } from "./batchLayout";
import { BatchQr, BatchSprite, eliminatedNumbers } from "./batchShared";
import type {
  BatchSceneViewProps,
  BatchShowView,
  BatchViewCat,
} from "./batchView";

const SANS = "var(--obs-font-sans,'Helvetica Neue',Arial,sans-serif)";
const MONO = "var(--obs-font-mono,ui-monospace,monospace)";
const CSS = `
.cw{position:absolute;inset:0;overflow:hidden;background:#12101a;font-family:${MONO};color:#fff}
.cw .cab{position:absolute;inset:0;background:linear-gradient(#ff5fa0,#e4448a);border:30px solid #2a1b3d;box-sizing:border-box;box-shadow:inset 0 0 0 6px #ffd1e6}
.cw .marquee{position:absolute;left:60px;top:40px;width:860px;height:90px;background:#2a1b3d;border-radius:10px;border:4px solid #ffd23f;text-align:center}
.cw .bulbs{position:absolute;left:8px;right:8px;top:-12px;display:flex;justify-content:space-between}
.cw .bulbs i{width:12px;height:12px;border-radius:50%;background:#ffd23f;box-shadow:0 0 10px #ffd23f;animation:cw-bulb 1s steps(2) infinite}
.cw .bulbs i:nth-child(2n){animation-delay:.5s}
.cw .marquee b{display:block;font:900 36px ${SANS};letter-spacing:.18em;color:#ffd23f;margin-top:12px;text-shadow:0 0 20px #ffd23f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 20px}
.cw .marquee span{font:12px ${MONO};letter-spacing:.3em;color:#ffd1e6}
.cw .led{position:absolute;left:950px;top:40px;width:270px;height:90px;background:#120a18;border:4px solid #2a1b3d;border-radius:8px;padding:8px 12px;box-sizing:border-box;color:#ff3b3b;text-shadow:0 0 10px #ff3b3b}
.cw .led b{display:block;font:900 22px ${MONO}}.cw .led span{display:block;font:14px ${MONO};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cw .led em{display:block;font:11px ${MONO};font-style:normal;color:#ff8a8a;margin-top:4px}
.cw .glass{position:absolute;left:60px;top:150px;width:860px;height:740px;background:linear-gradient(170deg,rgba(120,220,255,.16),rgba(60,120,200,.06) 60%,rgba(255,255,255,.04));border:8px solid #2a1b3d;box-sizing:border-box;overflow:hidden}
.cw .glass.wide{width:1160px;height:560px}
.cw .glass .flo{position:absolute;left:0;right:0;bottom:0;height:80px;background:repeating-linear-gradient(45deg,#3b2a5a 0 20px,#2f2148 20px 40px)}
.cw .gantry{position:absolute;left:0;right:0;top:24px;height:14px;background:#5a4a7a;box-shadow:0 4px 0 #2a1b3d}
.cw .claw{position:absolute;width:64px;z-index:5;text-align:center;transition:left 1s ease;top:30px}
.cw .cable{width:4px;background:#ddd;margin:0 auto;transition:height 1s ease}
.cw .head{width:40px;height:34px;background:#c9c9d6;border-radius:8px 8px 4px 4px;margin:0 auto;box-shadow:inset 0 -6px 0 #8a8aa0}
.cw .arm{position:absolute;width:10px;height:48px;background:#c9c9d6;border-radius:0 0 6px 6px;transition:top 1s ease}
.cw .arm.l{left:10px;transform:rotate(25deg)}.cw .arm.r{right:10px;transform:rotate(-25deg)}
.cw .claw span{position:absolute;left:66px;font:700 12px ${MONO};color:#ff3b3b;text-shadow:0 0 8px #ff3b3b;animation:cw-blink 1s steps(2) infinite;white-space:nowrap}
.cw .prize{position:absolute;text-align:center;z-index:1;transition:opacity 1s ease,transform 1s ease}
.cw .prize .sprite{margin:0 auto;filter:drop-shadow(0 8px 8px rgba(0,0,0,.5))}
.cw .tag{position:relative;margin:-14px auto 0;background:#fff;color:#2a1b3d;border-radius:6px;padding:4px 4px 5px;box-shadow:0 3px 0 #b9a6c9}
.cw .tag i{position:absolute;left:50%;margin-left:-4px;top:-8px;width:8px;height:8px;border-radius:50%;background:#2a1b3d}
.cw .tag b{display:block;font:900 22px ${MONO};line-height:1;margin-top:2px}
.cw .tag span{display:block;font:700 10px ${SANS};color:#6a5a7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cw .prize.under .tag{box-shadow:0 0 0 3px #ff3b3b,0 3px 0 #b9a6c9}
.cw .prize.flash .tag{background:#ffd23f;animation:cw-blink .8s steps(2) infinite}
.cw .prize.love .tag::after{content:"♥";position:absolute;right:-6px;top:-10px;color:#e4448a;font-size:20px;text-shadow:0 0 6px #fff}
.cw .prize.dropping{opacity:0;transform:translateY(260px)}
.cw .side{position:absolute;left:950px;top:150px;width:270px;height:740px}
.cw .cam{background:#120a18;border:4px solid #2a1b3d;border-radius:8px;padding:8px;text-align:center;min-height:300px}
.cw .ch{font:700 11px ${MONO};color:#7fe0ff;letter-spacing:.14em;text-align:left;margin-bottom:4px}
.cw .cam .sprite{margin:0 auto;filter:drop-shadow(0 0 14px rgba(127,224,255,.5))}
.cw .cam .nosig{display:flex;align-items:center;justify-content:center;height:230px;font:12px ${MONO};color:#5a4a7a;letter-spacing:.2em}
.cw .cf{display:flex;align-items:center;justify-content:center;gap:8px;font:700 16px ${SANS};margin-top:4px}
.cw .nb{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;font:800 15px ${MONO};background:#ffd23f;color:#2a1b3d;flex:none}
.cw .status{margin-top:14px;background:#120a18;border:4px solid #2a1b3d;border-radius:8px;padding:10px;color:#ffd1e6;font:13px ${MONO};line-height:1.6}
.cw .status b{color:#ffd23f}
.cw .chute{position:absolute;left:60px;top:905px;width:1160px;height:140px;background:#2a1b3d;border-radius:8px;border:4px solid #1a1026;box-sizing:border-box;padding:12px 18px;display:flex;align-items:center;gap:18px}
.cw .chute i{font:700 14px ${MONO};letter-spacing:.3em;color:#ffd1e6}
.cw .chute b{font:700 26px ${MONO};letter-spacing:.18em;color:#8a7a9a;text-decoration:line-through;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cw .chute span{margin-left:auto;font:14px ${MONO};color:#ffd23f;animation:cw-blink 1.2s steps(2) infinite;white-space:nowrap}
.cw .ticket{position:absolute;left:470px;top:740px;width:340px;background:#fff;color:#1a1a1a;padding:14px;text-align:center;transform:rotate(-2deg);box-shadow:0 20px 40px rgba(0,0,0,.6)}
.cw .ticket .qr{display:inline-block;margin:6px auto}
.cw .tt{font:700 13px ${MONO};letter-spacing:.3em}.cw .tb{font:italic 14px Georgia,serif}
@keyframes cw-bulb{50%{opacity:.35}}
@keyframes cw-blink{50%{opacity:.4}}
`;

type Area = { x: number; y: number; w: number; h: number };
type Placed = { index: number; row: number; x: number };

function Claw({
  target,
  area,
  cell,
  label,
}: Readonly<{ target: Placed; area: Area; cell: number; label: string }>) {
  const x = area.x + target.x + cell / 2 - 32;
  const y = area.y + target.row * (cell + 8);
  return (
    <div className="claw" style={{ left: x }}>
      <div className="cable" style={{ height: Math.max(20, y - 40) }} />
      <div className="head" />
      <i className="arm l" style={{ top: y - 6 }} />
      <i className="arm r" style={{ top: y - 6 }} />
      <span style={{ top: y + 16 }}>{`over ${label}`}</span>
    </div>
  );
}

function Prizes({
  cats,
  placed,
  area,
  cell,
  done,
}: Readonly<{
  cats: readonly BatchViewCat[];
  placed: readonly Placed[];
  area: Area;
  cell: number;
  done: boolean;
}>) {
  const sprite = Math.max(44, Math.round(cell * 0.7));
  return (
    <>
      {cats.map((cat, i) => {
        const pos = placed[i];
        if (!pos) return null;
        const stagger = done && i % 2 ? 30 : 0;
        return (
          <div
            key={cat.id}
            className={cn(
              "prize",
              cat.marked && "under",
              cat.potential && "flash",
              cat.favorite && "love",
              cat.fading && "dropping",
            )}
            style={{
              left: area.x + pos.x,
              top: area.y + pos.row * (cell + 8) + stagger,
              width: cell,
            }}
          >
            <BatchSprite cat={cat} size={sprite} className="sprite" />
            <div className="tag" style={{ width: Math.min(100, cell - 20) }}>
              <i />
              <b>{cat.numberLabel}</b>
              <span>{cat.label}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function PrizeCam({ spotlight }: Readonly<{ spotlight: BatchViewCat | null }>) {
  return (
    <div className="cam">
      <div className="ch">PRIZE CAM</div>
      {spotlight ? (
        <>
          <BatchSprite cat={spotlight} size={220} className="sprite" />
          <div className="cf">
            <b className="nb">{spotlight.numberLabel}</b>
            {spotlight.label}
          </div>
        </>
      ) : (
        <div className="nosig">NO SIGNAL</div>
      )}
    </div>
  );
}

function CabinetSide({ view }: Readonly<{ view: BatchShowView }>) {
  return (
    <>
      <div className="side">
        <PrizeCam spotlight={view.spotlight} />
        <div className="status">
          <b>{view.statusLabel}</b>
          <span style={{ display: "block" }}>
            {`drop ${view.cullNumber} of ${view.maxEliminations}`}
          </span>
        </div>
      </div>
      <div className="chute">
        <i>OUT</i>
        <b>
          {view.eliminated.length ? eliminatedNumbers(view.eliminated) : "—"}
        </b>
        {view.phase === "awaitingCull" ? (
          <span>drop one more — call a number</span>
        ) : null}
      </div>
    </>
  );
}

function PrizeTicket({ view }: Readonly<{ view: BatchShowView }>) {
  return (
    <div className="ticket">
      <div className="tt">— PRIZE TICKET —</div>
      {view.qrUrl ? (
        <span className="qr">
          <BatchQr url={view.qrUrl} size={190} fg="#1a1a1a" bg="#ffffff" />
        </span>
      ) : (
        <div className="tb">{view.statusLabel}</div>
      )}
      <div className="tb">{`adopt from this litter · ${view.remaining} kits`}</div>
    </div>
  );
}

/**
 * An arcade claw machine: the pool are plush prizes with paper number tags
 * behind the glass, the claw parks over the marked kit, culls drop down
 * the OUT chute, and the Prize Cam shows the spotlight kit.
 */
export function ClawBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const done = view.phase === "done";
  const prizes = [...view.survivors];
  const area: Area = done
    ? { x: 20, y: 60, w: 1120, h: 440 }
    : { x: 12, y: 60, w: 820, h: 520 };
  const grid = done
    ? { columns: Math.min(prizes.length || 1, 10), cell: 110 }
    : packSquares(prizes.length, area.w, area.h, 8, 160);
  const cell = grid.cell;
  const placed = centredRows(prizes.length, grid.columns, area.w, cell);
  const markedIndex = prizes.findIndex((cat) => cat.marked);
  const clawTarget = done ? null : (placed[markedIndex] ?? null);

  return (
    <div className="cw" style={{ width: 1280, height: 1080 }}>
      <style>{CSS}</style>
      <div className="cab" />
      <div className="marquee" style={done ? { width: 1160 } : undefined}>
        <div className="bulbs">
          {Array.from({ length: 26 }, (_, i) => (
            <i key={`b-${i.toString()}`} />
          ))}
        </div>
        <b>{done ? "WINNERS" : "KIT CATCHER"}</b>
        <span>{view.title}</span>
      </div>
      {done ? null : (
        <div className="led">
          <b>{`ROUND ${String(view.stageNumber).padStart(2, "0")}/${view.stages.length}`}</b>
          <span>{view.stageLabel.toUpperCase()}</span>
          <em>{`${view.remaining} IN · ${view.finalCount} WIN`}</em>
        </div>
      )}
      <div className={cn("glass", done && "wide")}>
        <div className="flo" />
        <div className="gantry" />
        {clawTarget ? (
          <Claw
            target={clawTarget}
            area={area}
            cell={cell}
            label={prizes[markedIndex]?.numberLabel ?? ""}
          />
        ) : null}
        <Prizes
          cats={prizes}
          placed={placed}
          area={area}
          cell={cell}
          done={done}
        />
      </div>
      {done ? <PrizeTicket view={view} /> : <CabinetSide view={view} />}
    </div>
  );
}
