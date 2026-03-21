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

// ---------------------------------------------------------------------------
// SVG emblem flag CSS generators
// ---------------------------------------------------------------------------

/** Build a data-URL for an inline SVG pattern (flags and decorative). */
function buildSvgUrl(viewBox: string, ...paths: string[]): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none">` +
    paths.join('') +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function flagCanadaCss(): CSSPatternStyle {
  return {
    background: buildSvgUrl(
      '0 0 640 480',
      '<path fill="#fff" d="M150.1 0h339.7v480H150z"/>',
      '<path fill="#d52b1e" d="M-19.7 0h169.8v480H-19.7zm509.5 0h169.8v480H489.9z' +
      'M201 232l-13.3 4.4 61.4 54c4.7 13.7-1.6 17.8-5.6 25l66.6-8.4-1.6 67 13.9-.3-3.1-66.6 ' +
      '66.7 8c-4.1-8.7-7.8-13.3-4-27.2l61.3-51-10.7-4c-8.8-6.8 3.8-32.6 5.6-48.9 0 0-35.7 ' +
      '12.3-38 5.8l-9.2-17.5-32.6 35.8c-3.5.9-5-.5-5.9-3.5l15-74.8-23.8 13.4q-3.2 1.3-5.2-2.2l' +
      '-23-46-23.6 47.8q-2.8 2.5-5 .7L264 130.8l13.7 74.1c-1.1 3-3.7 3.8-6.7 2.2l-31.2-35.3' +
      'c-4 6.5-6.8 17.1-12.2 19.5s-23.5-4.5-35.6-7c4.2 14.8 17 39.6 9 47.7"/>',
    ),
  };
}

function flagSwitzerlandCss(): CSSPatternStyle {
  return {
    background: buildSvgUrl(
      '0 0 640 480',
      '<path fill="red" d="M0 0h640v480H0z"/>',
      '<path fill="#fff" d="M170 195h300v90H170z"/>',
      '<path fill="#fff" d="M275 90h90v300h-90z"/>',
    ),
  };
}

function flagUkCss(): CSSPatternStyle {
  return {
    background: buildSvgUrl(
      '0 0 512 512',
      '<path fill="#012169" d="M0 0h512v512H0z"/>',
      '<path fill="#FFF" d="M512 0v64L322 256l190 187v69h-67L254 324 68 512H0v-68l186-187L0 74V0h62l192 188L440 0z"/>',
      '<path fill="#C8102E" d="m184 324 11 34L42 512H0v-3zm124-12 54 8 150 147v45zM512 0 320 196l-4-44L466 0zM0 1l193 189-59-8L0 49z"/>',
      '<path fill="#FFF" d="M176 0v512h160V0zM0 176v160h512V176z"/>',
      '<path fill="#C8102E" d="M0 208v96h512v-96zM208 0v512h96V0z"/>',
    ),
  };
}

function flagTurkeyCss(): CSSPatternStyle {
  return {
    background: buildSvgUrl(
      '0 0 640 480',
      '<path fill="#e30a17" d="M0 0h640v480H0z"/>',
      '<path fill="#fff" d="M407 247.5c0 66.2-54.6 119.9-122 119.9s-122-53.7-122-120 54.6-119.8 122-119.8 122 53.7 122 119.9"/>',
      '<path fill="#e30a17" d="M413 247.5c0 53-43.6 95.9-97.5 95.9s-97.6-43-97.6-96 43.7-95.8 97.6-95.8 97.6 42.9 97.6 95.9z"/>',
      '<path fill="#fff" d="m430.7 191.5-1 44.3-41.3 11.2 40.8 14.5-1 40.7 26.5-31.8 40.2 14-23.2-34.1 28.3-33.9-43.5 12-25.8-37z"/>',
    ),
  };
}

function flagIsraelCss(): CSSPatternStyle {
  return {
    background: buildSvgUrl(
      '0 0 640 480',
      '<defs><clipPath id="il-a"><path fill-opacity=".7" d="M-87.6 0H595v512H-87.6z"/></clipPath></defs>',
      '<g fill-rule="evenodd" clip-path="url(#il-a)" transform="translate(82.1)scale(.94)">',
      '<path fill="#fff" d="M619.4 512H-112V0h731.4z"/>',
      '<path fill="#0038b8" d="M619.4 115.2H-112V48h731.4zm0 350.5H-112v-67.2h731.4zm-483-275 110.1 191.6L359 191.6z"/>',
      '<path fill="#fff" d="m225.8 317.8 20.9 35.5 21.4-35.3z"/>',
      '<path fill="#0038b8" d="M136 320.6 246.2 129l112.4 190.8z"/>',
      '<path fill="#fff" d="m225.8 191.6 20.9-35.5 21.4 35.4zM182 271.1l-21.7 36 41-.1-19.3-36zm-21.3-66.5 41.2.3-19.8 36.3zm151.2 67 20.9 35.5-41.7-.5zm20.5-67-41.2.3 19.8 36.3zm-114.3 0L189.7 256l28.8 50.3 52.8 1.2 32-51.5-29.6-52z"/>',
      '</g>',
    ),
  };
}

// ---------------------------------------------------------------------------
// Phase 1: World pattern CSS generators
// ---------------------------------------------------------------------------

function seigaihaCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);

  // Hero Patterns 'endless-clouds' (MIT license)
  return {
    background: buildSvgUrl(
      '0 0 56 28',
      `<rect width="56" height="28" fill="${bgStr}"/>`,
      `<path d="M56 26c-2.813 0-5.456.726-7.752 2H56v-2zm-26 2h4.087C38.707 20.783 46.795 16 56 16v-2c-.672 0-1.339.024-1.999.07L54 14c0-1.105.895-2 2-2v-2c-2.075 0-3.78 1.58-3.98 3.602-.822-1.368-1.757-2.66-2.793-3.862C50.644 7.493 53.147 6 56 6V4c-3.375 0-6.359 1.672-8.17 4.232-.945-.948-1.957-1.828-3.03-2.634C47.355 2.198 51.42 0 56 0h-7.752c-1.998 1.108-3.733 2.632-5.09 4.454-1.126-.726-2.307-1.374-3.536-1.936.63-.896 1.33-1.738 2.095-2.518H39.03c-.46.557-.893 1.137-1.297 1.737-1.294-.48-2.633-.866-4.009-1.152.12-.196.24-.392.364-.585H30l-.001.07C29.339.024 28.672 0 28 0c-.672 0-1.339.024-1.999.07L26 0h-4.087c.124.193.245.389.364.585-1.376.286-2.715.673-4.009 1.152-.404-.6-.837-1.18-1.297-1.737h-2.688c.764.78 1.466 1.622 2.095 2.518-1.23.562-2.41 1.21-3.536 1.936C11.485 2.632 9.75 1.108 7.752 0H0c4.58 0 8.645 2.199 11.2 5.598-1.073.806-2.085 1.686-3.03 2.634C6.359 5.672 3.375 4 0 4v2c2.852 0 5.356 1.493 6.773 3.74-1.036 1.203-1.971 2.494-2.793 3.862C3.78 11.58 2.075 10 0 10v2c1.105 0 2 .895 2 2l-.001.07C1.339 14.024.672 14 0 14v2c9.205 0 17.292 4.783 21.913 12H26c0-1.105.895-2 2-2s2 .895 2 2zM7.752 28C5.456 26.726 2.812 26 0 26v2h7.752zM56 20c-6.832 0-12.936 3.114-16.971 8h2.688c3.63-3.703 8.688-6 14.283-6v-2zm-39.029 8C12.936 23.114 6.831 20 0 20v2c5.595 0 10.653 2.297 14.283 6h2.688zm15.01-.398c.821-1.368 1.756-2.66 2.792-3.862C33.356 21.493 30.853 20 28 20c-2.852 0-5.356 1.493-6.773 3.74 1.036 1.203 1.971 2.494 2.793 3.862C24.22 25.58 25.925 24 28 24s3.78 1.58 3.98 3.602zm14.287-11.865C42.318 9.864 35.61 6 28 6c-7.61 0-14.318 3.864-18.268 9.737-1.294-.48-2.633-.866-4.009-1.152C10.275 7.043 18.548 2 28 2c9.452 0 17.725 5.043 22.277 12.585-1.376.286-2.715.673-4.009 1.152zm-5.426 2.717c1.126-.726 2.307-1.374 3.536-1.936C40.76 11.367 34.773 8 28 8s-12.76 3.367-16.378 8.518c1.23.562 2.41 1.21 3.536 1.936C18.075 14.537 22.741 12 28 12s9.925 2.537 12.842 6.454zm-4.672 3.778c.945-.948 1.957-1.828 3.03-2.634C36.645 16.198 32.58 14 28 14c-4.58 0-8.645 2.199-11.2 5.598 1.073.806 2.085 1.686 3.03 2.634C21.641 19.672 24.625 18 28 18s6.359 1.672 8.17 4.232z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function asanohaCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [255, 255, 255];
  const fgStr = rgb(fg);
  const bgStr = rgb(p.background);
  const sw = Math.max(0.5, ts / 12);
  const h = ts / 2;
  const q = ts / 4;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${bgStr}"/>` +
    `<polygon points="${h},0 ${ts},${h} ${h},${ts} 0,${h}" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${h}" y2="0" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${ts}" y2="${h}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${h}" y2="${ts}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="0" y2="${h}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${q}" y2="${q}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${h + q}" y2="${q}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${q}" y2="${h + q}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<line x1="${h}" y1="${h}" x2="${h + q}" y2="${h + q}" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function shippoCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);

  // Hero Patterns 'intersecting-circles' (MIT license)
  return {
    background: buildSvgUrl(
      '0 0 30 30',
      `<rect width="30" height="30" fill="${bgStr}"/>`,
      `<path d="M15 0C6.716 0 0 6.716 0 15c8.284 0 15-6.716 15-15zM0 15c0 8.284 6.716 15 15 15 0-8.284-6.716-15-15-15zm30 0c0-8.284-6.716-15-15-15 0 8.284 6.716 15 15 15zm0 0c0 8.284-6.716 15-15 15 0-8.284 6.716-15 15-15z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function islamicStarCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);

  // Hero Patterns 'moroccan' (MIT license)
  return {
    background: buildSvgUrl(
      '0 0 80 88',
      `<rect width="80" height="88" fill="${bgStr}"/>`,
      `<path d="M22 21.91V26h-2.001C10.06 26 2 34.059 2 44c0 9.943 8.058 18 17.999 18H22v4.09c8.012.722 14.785 5.738 18 12.73 3.212-6.991 9.983-12.008 18-12.73V62h2.001C69.94 62 78 53.941 78 44c0-9.943-8.058-18-17.999-18H58v-4.09c-8.012-.722-14.785-5.738-18-12.73-3.212 6.991-9.983 12.008-18 12.73zM54 58v4.696c-5.574 1.316-10.455 4.428-14 8.69-3.545-4.262-8.426-7.374-14-8.69V58h-5.993C12.271 58 6 51.734 6 44c0-7.732 6.275-14 14.007-14H26v-4.696c5.574-1.316 10.455-4.428 14-8.69 3.545 4.262 8.426 7.374 14 8.69V30h5.993C67.729 30 74 36.266 74 44c0 7.732-6.275 14-14.007 14H54zM42 88c0-9.941 8.061-18 17.999-18H62v-4.09c8.016-.722 14.787-5.738 18-12.73v7.434c-3.545 4.262-8.426 7.374-14 8.69V74h-5.993C52.275 74 46 80.268 46 88h-4zm-4 0c0-9.943-8.058-18-17.999-18H18v-4.09c-8.012-.722-14.785-5.738-18-12.73v7.434c3.545 4.262 8.426 7.374 14 8.69V74h5.993C27.729 74 34 80.266 34 88h4zm4-88c0 9.943 8.058 18 17.999 18H62v4.09c8.012.722 14.785 5.738 18 12.73v-7.434c-3.545-4.262-8.426-7.374-14-8.69V14h-5.993C52.271 14 46 7.734 46 0h-4zM0 34.82c3.213-6.992 9.984-12.008 18-12.73V18h2.001C29.94 18 38 9.941 38 0h-4c0 7.732-6.275 14-14.007 14H14v4.696c-5.574 1.316-10.455 4.428-14 8.69v7.433z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function fleurDeLisCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);

  // MDI fleur-de-lis icon (Pictogrammers Free License)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<rect width="24" height="24" fill="${bgStr}"/>` +
    `<path fill="${fgStr}" d="M12 2S9 4 9 7 11 12 11 16H10S10 14 9 12` +
    `C7 8 3 10 3 13S5 16 5 16C5 13 8.5 13 8.5 16H7V18H10.5L9 20S10 21` +
    ` 11 20L12 22L13 20C14 21 15 20 15 20L13.5 18H17V16H15.5C15.5 13` +
    ` 19 13 19 16C19 16 21 16 21 13S17 8 15 12C14 14 14 16 14 16H13` +
    `C13 12 15 10 15 7S12 2 12 2Z"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function paisleyCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  const sw = Math.max(0.8, p.tileSize / 10);

  // Spiral boteh paisley in 50x50 viewBox
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">` +
    `<rect width="50" height="50" fill="${bgStr}"/>` +
    `<path d="M25 5 C35 5,45 15,45 28 C45 38,38 45,28 45` +
    ` C20 45,14 40,14 33 C14 26,20 22,25 22` +
    ` C30 22,34 26,34 30 C34 34,31 36,28 36 C25 36,23 34,23 31"` +
    ` fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<circle cx="30" cy="15" r="3" fill="${fgStr}"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function greekKeyCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);

  // Hero Patterns 'temple' (MIT license)
  return {
    background: buildSvgUrl(
      '0 0 152 152',
      `<rect width="152" height="152" fill="${bgStr}"/>`,
      `<path d="M152 150v2H0v-2h28v-8H8v-20H0v-2h8V80h42v20h20v42H30v8h90v-8H80v-42h20V80h42v40h8V30h-8v40h-42V50H80V8h40V0h2v8h20v20h8V0h2v150zm-2 0v-28h-8v20h-20v8h28zM82 30v18h18V30H82zm20 18h20v20h18V30h-20V10H82v18h20v20zm0 2v18h18V50h-18zm20-22h18V10h-18v18zm-54 92v-18H50v18h18zm-20-18H28V82H10v38h20v20h38v-18H48v-20zm0-2V82H30v18h18zm-20 22H10v18h18v-18zm54 0v18h38v-20h20V82h-18v20h-20v20H82zm18-20H82v18h18v-18zm2-2h18V82h-18v18zm20 40v-18h18v18h-18zM30 0h-2v8H8v20H0v2h8v40h42V50h20V8H30V0zm20 48h18V30H50v18zm18-20H48v20H28v20H10V30h20V10h38v18zM30 50h18v18H30V50zm-2-40H10v18h18V10z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function artDecoFanCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [255, 255, 255];
  const fgStr = rgb(fg);
  const bgStr = rgb(p.background);
  const sw = Math.max(0.5, ts / 12);
  const r = ts * 0.45;

  let elements = '';
  const fans: [number, number][] = [
    [ts / 2, ts],
    [0, ts / 2],
    [ts, ts / 2],
  ];

  for (const [fx, fy] of fans) {
    for (let i = 3; i > 0; i--) {
      const ri = (r * i) / 3;
      elements += `<circle cx="${fx}" cy="${fy}" r="${ri}" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>`;
    }
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * j) / 4;
      const x2 = fx + r * Math.cos(angle);
      const y2 = fy - r * Math.sin(angle);
      elements += `<line x1="${fx}" y1="${fy}" x2="${x2}" y2="${y2}" stroke="${fgStr}" stroke-width="${sw}"/>`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<defs><clipPath id="c"><rect width="${ts}" height="${ts}"/></clipPath></defs>` +
    `<g clip-path="url(#c)">` +
    `<rect width="${ts}" height="${ts}" fill="${bgStr}"/>` +
    elements +
    `</g></svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function urokoCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [255, 255, 255];
  const fgStr = rgb(fg);
  const bgStr = rgb(p.background);
  const h = ts / 2;

  // Alternating triangles via SVG
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${bgStr}"/>` +
    // Top-left: up triangle
    `<polygon points="0,${h} ${h / 2},0 ${h},${h}" fill="${fgStr}"/>` +
    // Top-right: down triangle
    `<polygon points="${h},0 ${h + h / 2},${h} ${ts},0" fill="${fgStr}"/>` +
    // Bottom-left: down triangle
    `<polygon points="0,${ts} ${h / 2},${h} ${h},${ts}" fill="${fgStr}"/>` +
    // Bottom-right: up triangle
    `<polygon points="${h},${ts} ${h + h / 2},${h} ${ts},${ts}" fill="${fgStr}"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function eightPointStarCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = p.foreground ?? [255, 255, 255];
  const fgStr = rgb(fg);
  const bgStr = rgb(p.background);
  const c = ts / 2;
  const s = ts * 0.22;
  const d = ts * 0.4;

  // Two overlapping squares: small axis-aligned + larger diamond for visible star points
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${bgStr}"/>` +
    `<rect x="${c - s}" y="${c - s}" width="${2 * s}" height="${2 * s}" fill="${fgStr}"/>` +
    `<polygon points="${c},${c - d} ${c + d},${c} ${c},${c + d} ${c - d},${c}" fill="${fgStr}"/>` +
    `</svg>`;

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${ts}px ${ts}px`,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: East Asian + African + Indian CSS generators
// ---------------------------------------------------------------------------

function kikkoCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  return {
    background: buildSvgUrl('0 0 28 49',
      `<rect width="28" height="49" fill="${bgStr}"/>`,
      `<path d="M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function sayagataCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  // Hero Patterns 'aztec' (MIT license) — matches backend
  return {
    background: buildSvgUrl('0 0 32 64',
      `<rect width="32" height="64" fill="${bgStr}"/>`,
      `<path d="M0 28h20V16h-4v8H4V4h28v28h-4V8H8v12h4v-8h12v20H0v-4zm12 8h20v4H16v24H0v-4h12V36zm16 12h-4v12h8v4H20V44h12v12h-4v-8zM0 36h8v20H0v-4h4V40H0v-4z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function chineseLatticeCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const sw = Math.max(0.5, ts / 12);
  const u = ts / 5;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${rgb(p.background)}"/>` +
    `<g fill="none" stroke="${fgStr}" stroke-width="${sw}">` +
    `<polygon points="${u},0 ${3 * u},0 ${2.5 * u},${2 * u} ${1.5 * u},${1.5 * u}"/>` +
    `<polygon points="${3 * u},0 ${ts},0 ${ts},${1.5 * u} ${3.5 * u},${2 * u}"/>` +
    `<polygon points="0,0 ${u},0 ${1.5 * u},${1.5 * u} 0,${2 * u}"/>` +
    `<polygon points="0,${2 * u} ${1.5 * u},${1.5 * u} ${2.5 * u},${2 * u} ${2 * u},${3.5 * u} 0,${3 * u}"/>` +
    `<polygon points="${2.5 * u},${2 * u} ${3.5 * u},${2 * u} ${ts},${1.5 * u} ${ts},${3.5 * u} ${3 * u},${3.5 * u}"/>` +
    `<polygon points="0,${3 * u} ${2 * u},${3.5 * u} ${1.5 * u},${ts} 0,${ts}"/>` +
    `<polygon points="${2 * u},${3.5 * u} ${3 * u},${3.5 * u} ${3.5 * u},${ts} ${1.5 * u},${ts}"/>` +
    `<polygon points="${3 * u},${3.5 * u} ${ts},${3.5 * u} ${ts},${ts} ${3.5 * u},${ts}"/>` +
    `</g></svg>`;
  return { background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${ts}px ${ts}px` };
}

function chineseCoinCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const c = ts / 2;
  const r = ts * 0.42;
  const h = ts * 0.14;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${rgb(p.background)}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${fgStr}"/>` +
    `<rect x="${c - h}" y="${c - h}" width="${2 * h}" height="${2 * h}" fill="${rgb(p.background)}"/>` +
    `</svg>`;
  return { background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${ts}px ${ts}px` };
}

function ruyiCloudCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  return {
    background: buildSvgUrl('0 0 50 50',
      `<rect width="50" height="50" fill="${bgStr}"/>`,
      `<path d="M25 12 C20 12,16 16,16 20 C16 24,12 24,10 22 C8 20,4 20,4 24 C4 28,8 32,12 32 L38 32 C42 32,46 28,46 24 C46 20,42 20,40 22 C38 24,34 24,34 20 C34 16,30 12,25 12Z" fill="${fgStr}"/>` +
      `<rect x="23" y="32" width="4" height="12" fill="${fgStr}"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function dancheongCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgb(p.foreground ?? [255, 255, 255]);
  const c = ts / 2;
  const rw = Math.max(ts / 6, 1.5);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${rgb(p.background)}"/>` +
    `<rect x="${rw}" y="${rw}" width="${ts - 2 * rw}" height="${ts - 2 * rw}" fill="${fg}"/>` +
    `<rect x="${2 * rw}" y="${2 * rw}" width="${ts - 4 * rw}" height="${ts - 4 * rw}" fill="${rgb(p.background)}"/>` +
    `<rect x="${c - rw / 2}" y="${c - rw / 2}" width="${rw}" height="${rw}" fill="${fg}"/>` +
    `</svg>`;
  return { background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${ts}px ${ts}px` };
}

function batikKawungCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  return {
    background: buildSvgUrl('0 0 32 26',
      `<rect width="32" height="26" fill="${bgStr}"/>`,
      `<path d="M14 0v3.994C14 7.864 10.858 11 7 11c-3.866 0-7-3.138-7-7.006V0h2v4.005C2 6.764 4.239 9 7 9c2.756 0 5-2.236 5-4.995V0h2zm0 26v-5.994C14 16.138 10.866 13 7 13c-3.858 0-7 3.137-7 7.006V26h2v-6.005C2 17.236 4.244 15 7 15c2.761 0 5 2.236 5 4.995V26h2zm2-18.994C16 3.136 19.142 0 23 0c3.866 0 7 3.138 7 7.006v9.988C30 20.864 26.858 24 23 24c-3.866 0-7-3.138-7-7.006V7.006zm2-.01C18 4.235 20.244 2 23 2c2.761 0 5 2.236 5 4.995v10.01C28 19.764 25.756 22 23 22c-2.761 0-5-2.236-5-4.995V6.995z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function batikParangCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  // Hero Patterns 'groovy' (MIT) — parallel S-curves
  return {
    background: buildSvgUrl('0 0 24 40',
      `<rect width="24" height="40" fill="${bgStr}"/>`,
      `<path d="M0 40c5.523 0 10-4.477 10-10V0C4.477 0 0 4.477 0 10v30zm22 0c-5.523 0-10-4.477-10-10V0c5.523 0 10 4.477 10 10v30z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function karakusaCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  return {
    background: buildSvgUrl('0 0 80 40',
      `<rect width="80" height="40" fill="${bgStr}"/>`,
      `<path d="M2.011 39.976c.018-4.594 1.785-9.182 5.301-12.687.475-.474.97-.916 1.483-1.326v9.771L4.54 39.976H2.01zm5.373 0L23.842 23.57c.687 5.351-1.031 10.95-5.154 15.06-.483.483-.987.931-1.508 1.347H7.384zm-7.384 0c.018-5.107 1.982-10.208 5.89-14.104 5.263-5.247 12.718-6.978 19.428-5.192 1.783 6.658.07 14.053-5.137 19.296H.001zm10.806-15.41c3.537-2.116 7.644-2.921 11.614-2.415L10.806 33.73v-9.163zM65.25.75C58.578-1.032 51.164.694 45.93 5.929c-5.235 5.235-6.961 12.649-5.18 19.321 6.673 1.782 14.087.056 19.322-5.179 5.235-5.235 6.961-12.649 5.18-19.321zM43.632 23.783c5.338.683 10.925-1.026 15.025-5.126 4.1-4.1 5.809-9.687 5.126-15.025l-20.151 20.15zm7.186-19.156c3.518-2.112 7.602-2.915 11.55-2.41l-11.55 11.55v-9.14zm-3.475 2.716c-4.1 4.1-5.809 9.687-5.126 15.025l6.601-6.6V6.02c-.51.41-1.002.85-1.475 1.323zM.071 0C.065 1.766.291 3.533.75 5.25 7.422 7.032 14.836 5.306 20.07.071l.07-.071H.072zm17.086 0C13.25 3.125 8.345 4.386 3.632 3.783L7.414 0h9.743zM2.07 0c-.003.791.046 1.582.146 2.368L4.586 0H2.07z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function kolamCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const h = ts / 2;
  const sw = Math.max(0.5, ts / 12);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ts}" height="${ts}">` +
    `<rect width="${ts}" height="${ts}" fill="${rgb(p.background)}"/>` +
    `<path d="M 0,${h} A ${h},${h} 0 0 1 ${h},0" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<path d="M ${h},0 A ${h},${h} 0 0 1 ${ts},${h}" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<path d="M ${ts},${h} A ${h},${h} 0 0 1 ${h},${ts}" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<path d="M ${h},${ts} A ${h},${h} 0 0 1 0,${h}" fill="none" stroke="${fgStr}" stroke-width="${sw}"/>` +
    `<circle cx="${h}" cy="${h}" r="${ts * 0.06}" fill="${fgStr}"/>` +
    `</svg>`;
  return { background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${ts}px ${ts}px` };
}

function kenteCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgba(p.foreground ?? [255, 255, 255], 0.6);
  const h = ts / 2;
  return {
    background: [
      `repeating-linear-gradient(0deg, ${fg} 0px, ${fg} ${h / 3}px, transparent ${h / 3}px, transparent ${(h * 2) / 3}px)`,
      `repeating-linear-gradient(90deg, transparent 0px, transparent ${h}px, ${fg} ${h}px, ${fg} ${ts}px)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${ts}px ${ts}px`,
  };
}

function mudclothCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  // Hero Patterns 'x-equals' (MIT) — X marks + parallel stripes
  return {
    background: buildSvgUrl('0 0 48 48',
      `<rect width="48" height="48" fill="${bgStr}"/>`,
      `<path fill-rule="evenodd" fill="${fgStr}" d="M5 3.59L1.46.05.05 1.46 3.59 5 .05 8.54l1.41 1.41L5 6.41l3.54 3.54 1.41-1.41L6.41 5l3.54-3.54L8.54.05 5 3.59zM17 2h24v2H17V2zm0 4h24v2H17V6zM2 17h2v24H2V17zm4 0h2v24H6V17z"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function adinkraCss(p: PatternDefinition): CSSPatternStyle {
  const fgStr = rgb(p.foreground ?? [255, 255, 255]);
  const bgStr = rgb(p.background);
  return {
    background: buildSvgUrl('0 0 60 60',
      `<rect width="60" height="60" fill="${bgStr}"/>`,
      `<path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z" fill="${fgStr}" fill-rule="evenodd"/>`,
    ),
    backgroundSize: `${p.tileSize}px ${p.tileSize}px`,
  };
}

function shweshweCss(p: PatternDefinition): CSSPatternStyle {
  const ts = p.tileSize;
  const fg = rgb(p.foreground ?? [255, 255, 255]);
  const s = Math.max(ts / 6, 2);
  return {
    background: [
      `radial-gradient(circle ${s * 0.3}px, ${fg} 100%, transparent 100%)`,
      solidLayer(p.background),
    ].join(', '),
    backgroundSize: `${s}px ${s}px`,
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
  flag_canada: flagCanadaCss,
  flag_switzerland: flagSwitzerlandCss,
  flag_uk: flagUkCss,
  flag_turkey: flagTurkeyCss,
  flag_israel: flagIsraelCss,
  flag_scotland: () => ({ background: buildSvgUrl('0 0 512 512', '<path fill="#0065bd" d="M0 0h512v512H0z"/>', '<path stroke="#fff" stroke-width=".6" d="m0 0 5 3M0 3l5-3" transform="scale(102.4 170.66667)"/>') }),
  flag_jamaica: () => ({ background: buildSvgUrl('0 0 512 512', '<g fill-rule="evenodd"><path fill="#000001" d="m0 0 256 256L0 512zm512 0L256 256l256 256z"/><path fill="#090" d="m0 0 256 256L512 0zm0 512 256-256 256 256z"/><path fill="#fc0" d="M512 0h-47.7L0 464.3V512h47.7L512 47.7z"/><path fill="#fc0" d="M0 0v47.7L464.3 512H512v-47.7L47.7 0z"/></g>') }),
  flag_china: () => ({ background: buildSvgUrl('0 0 30 20', '<path fill="#ee1c25" d="M0 0h30v20H0z"/><path fill="#ff0" d="M5 2l1 3.1H9.2L7.1 7l.7 3L5 8.3 2.2 10l.7-3L.8 5.1H4z"/><path fill="#ff0" d="M10 1l.6 1.6h1.7l-1.3 1 .5 1.5L10 4.2l-1.5 1 .5-1.6-1.3-1h1.7z"/><path fill="#ff0" d="M12 4l.6 1.5h1.7l-1.3 1 .5 1.5-1.5-1-1.5 1 .5-1.5-1.3-1h1.7z"/><path fill="#ff0" d="M12 8l.6 1.5h1.7l-1.3 1 .5 1.5-1.5-1-1.5 1 .5-1.5-1.3-1h1.7z"/><path fill="#ff0" d="M10 11l.6 1.5h1.7l-1.3 1 .5 1.5-1.5-1-1.5 1 .5-1.5-1.3-1h1.7z"/>') }),
  flag_australia: () => ({ background: buildSvgUrl('0 0 512 512', '<path fill="#00008B" d="M0 0h512v512H0z"/><path fill="#fff" d="M256 0v32l-95 96 95 93.5V256h-33.5L127 162l-93 94H0v-34l93-93.5L0 37V0h31l96 94 93-94z"/><path fill="red" d="m92 162 5.5 17L21 256H0v-1.5zm62-6 27 4 75 73.5V256zM256 0l-96 98-2-22 75-76zM0 .5 96.5 95 67 91 0 24.5z"/><path fill="#fff" d="M88 0v256h80V0zM0 88v80h256V88z"/><path fill="red" d="M0 104v48h256v-48zM104 0v256h48V0z"/><path fill="#fff" d="m202 402.8-45.8 5.4 4.6 45.9-32.8-32.4-33 32.2 4.9-45.9-45.8-5.8L93 377.4 69 338l43.6 15 15.8-43.4 15.5 43.5 43.7-14.7-24.3 39.2 38.8 25.1Zm222.7 8-20.5 2.6 2.2 20.5-14.8-14.4-14.7 14.5 2-20.5-20.5-2.4 17.3-11.2-10.9-17.5 19.6 6.5 6.9-19.5 7.1 19.4 19.5-6.7-10.7 17.6zM415 293.6l2.7-13-9.8-9 13.2-1.5 5.5-12.1 5.5 12.1 13.2 1.5-9.8 9 2.7 13-11.6-6.6zm-84.1-60-20.3 2.2 1.8 20.3-14.4-14.5-14.8 14.1 2.4-20.3-20.2-2.7 17.3-10.8-10.5-17.5 19.3 6.8 7.2-19.1 6.7 19.3 19.4-6.3-10.9 17.3zm175.8-32.8-20.9 2.7 2.3 20.9-15.1-14.7-15 14.8 2.1-21-20.9-2.4 17.7-11.5-11.1-17.9 20 6.7 7-19.8 7.2 19.8 19.9-6.9-11 18zm-82.1-83.5-20.7 2.3 1.9 20.8-14.7-14.8L376 140l2.4-20.7-20.7-2.8 17.7-11-10.7-17.9 19.7 6.9 7.3-19.5 6.8 19.7 19.8-6.5-11.1 17.6z"/>') }),
  // Phase 1: World patterns
  seigaiha: seigaihaCss,
  asanoha: asanohaCss,
  shippo: shippoCss,
  islamic_star: islamicStarCss,
  fleur_de_lis: fleurDeLisCss,
  paisley: paisleyCss,
  greek_key: greekKeyCss,
  art_deco_fan: artDecoFanCss,
  uroko: urokoCss,
  eight_point_star: eightPointStarCss,
  // Phase 2: East Asian + African + Indian
  kikko: kikkoCss,
  sayagata: sayagataCss,
  chinese_lattice: chineseLatticeCss,
  chinese_coin: chineseCoinCss,
  ruyi_cloud: ruyiCloudCss,
  dancheong: dancheongCss,
  batik_kawung: batikKawungCss,
  batik_parang: batikParangCss,
  karakusa: karakusaCss,
  kolam: kolamCss,
  kente: kenteCss,
  mudcloth: mudclothCss,
  adinkra: adinkraCss,
  shweshwe: shweshweCss,
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
