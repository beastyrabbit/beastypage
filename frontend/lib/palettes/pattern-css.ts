/**
 * CSS background generator for pattern preview swatches on the palette page.
 *
 * Converts PatternDefinition objects into CSS background properties so the
 * frontend can show a visual preview without rendering through the backend.
 */

import type { CSSProperties } from 'react';

import type { PatternDefinition } from './types';

type CSSPatternStyle = {
  background: string;
  backgroundSize?: string;
  backgroundPosition?: string;
};

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function rgba(c: [number, number, number], a: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

/** Solid color as a linear-gradient (used as the bottom layer in multi-layer backgrounds). */
function solidLayer(c: [number, number, number]): string {
  const color = rgb(c);
  return `linear-gradient(${color}, ${color})`;
}

function tartanCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const layers: string[] = [];

  for (const stripe of p.stripes ?? []) {
    const c = rgba(stripe.color, 0.5);
    const off = stripe.offset;
    const end = off + stripe.width;

    layers.push(
      `repeating-linear-gradient(0deg, transparent 0px, transparent ${off}px, ${c} ${off}px, ${c} ${end}px, transparent ${end}px, transparent ${ts}px)`
    );
    layers.push(
      `repeating-linear-gradient(90deg, transparent 0px, transparent ${off}px, ${c} ${off}px, ${c} ${end}px, transparent ${end}px, transparent ${ts}px)`
    );
  }

  layers.push(solidLayer(p.background));

  return {
    background: layers.join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function ginghamCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [255, 255, 255];
  const c = rgba(fg, 0.5);

  return {
    background: [
      `repeating-linear-gradient(0deg, ${c} 0px, ${c} ${ts / 2}px, transparent ${ts / 2}px, transparent ${ts}px)`,
      `repeating-linear-gradient(90deg, ${c} 0px, ${c} ${ts / 2}px, transparent ${ts / 2}px, transparent ${ts}px)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function houndstoothCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const bg = rgb(p.background);
  const fg = rgb(p.foreground ?? [0, 0, 0]);
  const h = ts / 2;
  const q = h / 2;

  // SVG houndstooth: staircase pattern in TL+BR quadrants, inverted in TR+BL
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${bg}"/>` +
    // Top-left quadrant: stepped diagonal
    `<rect x="0" y="0" width="${q}" height="${h}" fill="${fg}"/>` +
    `<rect x="${q}" y="${q}" width="${q}" height="${q}" fill="${fg}"/>` +
    // Bottom-right quadrant: stepped diagonal
    `<rect x="${h}" y="${h}" width="${q}" height="${h}" fill="${fg}"/>` +
    `<rect x="${h + q}" y="${h + q}" width="${q}" height="${q}" fill="${fg}"/>` +
    // Top-right quadrant: inverted (fill then cut)
    `<rect x="${h}" y="0" width="${h}" height="${h}" fill="${fg}"/>` +
    `<rect x="${h}" y="0" width="${q}" height="${h}" fill="${bg}"/>` +
    `<rect x="${h + q}" y="${q}" width="${q}" height="${q}" fill="${bg}"/>` +
    // Bottom-left quadrant: inverted
    `<rect x="0" y="${h}" width="${h}" height="${h}" fill="${fg}"/>` +
    `<rect x="0" y="${h}" width="${q}" height="${h}" fill="${bg}"/>` +
    `<rect x="${q}" y="${h + q}" width="${q}" height="${q}" fill="${bg}"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function pinstripeCss(p: PatternDefinition): CSSPatternStyle {
  const spacing = p.spacing ?? 6;
  const fg = rgb(p.foreground ?? [255, 255, 255]);

  return {
    background: [
      `repeating-linear-gradient(90deg, ${fg} 0px, ${fg} 1px, transparent 1px, transparent ${spacing}px)`,
      solidLayer(p.background),
    ].join(', '),
  };
}

function chevronCss(p: PatternDefinition): CSSPatternStyle {
  const s = p.spacing ?? 4;
  const fg = rgb(p.foreground ?? [255, 255, 255]);

  return {
    background: [
      `linear-gradient(135deg, ${fg} 25%, transparent 25%)`,
      `linear-gradient(225deg, ${fg} 25%, transparent 25%)`,
      `linear-gradient(315deg, ${fg} 25%, transparent 25%)`,
      `linear-gradient(45deg, ${fg} 25%, transparent 25%)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${s * 2}px ${s * 2}px`,
  };
}

function polkadotCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgb(p.foreground ?? [255, 255, 255]);
  const r = Math.round(ts / 3);

  return {
    background: [
      `radial-gradient(circle ${r}px, ${fg} 100%, transparent 100%)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function argyleCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgba(p.foreground ?? [255, 255, 255], 0.7);
  const line = p.stripes?.[0] ? rgba(p.stripes[0].color, 0.4) : 'transparent';

  return {
    background: [
      `repeating-linear-gradient(135deg, ${line} 0px, ${line} 1px, transparent 1px, transparent ${ts}px)`,
      `repeating-linear-gradient(45deg, ${line} 0px, ${line} 1px, transparent 1px, transparent ${ts}px)`,
      `linear-gradient(45deg, ${fg} 25%, transparent 25%, transparent 75%, ${fg} 75%)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function buffaloCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [0, 0, 0];
  const c = rgba(fg, 0.6);

  return {
    background: [
      `repeating-linear-gradient(0deg, ${c} 0px, ${c} ${ts / 2}px, transparent ${ts / 2}px, transparent ${ts}px)`,
      `repeating-linear-gradient(90deg, ${c} 0px, ${c} ${ts / 2}px, transparent ${ts / 2}px, transparent ${ts}px)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function checkerboardCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const half = ts / 2;
  const fg = rgb(p.foreground ?? [0, 0, 0]);

  return {
    background: [
      `linear-gradient(45deg, ${fg} 25%, transparent 25%, transparent 75%, ${fg} 75%)`,
      `linear-gradient(45deg, ${fg} 25%, transparent 25%, transparent 75%, ${fg} 75%)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
    backgroundPosition: `0 0, ${half}px ${half}px, 0 0`,
  };
}

function windowpaneCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgb(p.foreground ?? [150, 150, 150]);

  return {
    background: [
      `repeating-linear-gradient(0deg, ${fg} 0px, ${fg} 1px, transparent 1px, transparent ${ts}px)`,
      `repeating-linear-gradient(90deg, ${fg} 0px, ${fg} 1px, transparent 1px, transparent ${ts}px)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function diagonalCss(p: PatternDefinition): CSSPatternStyle {
  const s = p.spacing ?? 4;
  const fg = rgb(p.foreground ?? [255, 255, 255]);

  return {
    background: [
      `repeating-linear-gradient(135deg, ${fg} 0px, ${fg} ${s}px, transparent ${s}px, transparent ${s * 2}px)`,
      solidLayer(p.background),
    ].join(', '),
  };
}

function basketweaveCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const half = ts / 2;
  const fg = rgba(p.foreground ?? [100, 100, 100], 0.5);

  return {
    background: [
      `repeating-linear-gradient(0deg, ${fg} 0px, ${fg} ${half}px, transparent ${half}px, transparent ${ts}px)`,
      `repeating-linear-gradient(90deg, transparent 0px, transparent ${half}px, ${fg} ${half}px, ${fg} ${ts}px)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function flagCss(p: PatternDefinition): CSSPatternStyle {
  const stripes = p.stripes ?? [];
  if (stripes.length === 0) {
    return { background: rgb(p.background) };
  }

  const total = stripes.reduce((s, st) => s + st.width, 0);
  const stops: string[] = [];
  let pos = 0;
  for (const stripe of stripes) {
    const pct = (stripe.width / total) * 100;
    stops.push(`${rgb(stripe.color)} ${pos}%`);
    pos += pct;
    stops.push(`${rgb(stripe.color)} ${pos}%`);
  }

  return {
    background: `linear-gradient(180deg, ${stops.join(', ')})`,
  };
}

const CSS_GENERATORS: Record<PatternDefinition['type'], (p: PatternDefinition) => CSSPatternStyle> = {
  tartan: tartanCss,
  gingham: ginghamCss,
  houndstooth: houndstoothCss,
  pinstripe: pinstripeCss,
  chevron: chevronCss,
  polkadot: polkadotCss,
  argyle: argyleCss,
  buffalo: buffaloCss,
  checkerboard: checkerboardCss,
  windowpane: windowpaneCss,
  diagonal: diagonalCss,
  basketweave: basketweaveCss,
  flag: flagCss,
};

export function patternToCssBackground(pattern: PatternDefinition): CSSProperties {
  const generator = CSS_GENERATORS[pattern.type];
  if (!generator) {
    console.warn(`[pattern-css] No CSS generator for pattern type "${pattern.type}", falling back to flat color`);
    return { backgroundColor: rgb(pattern.background) };
  }
  const style = generator(pattern);
  return {
    background: style.background,
    backgroundSize: style.backgroundSize,
    backgroundPosition: style.backgroundPosition,
  };
}
