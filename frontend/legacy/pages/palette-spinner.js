// Palette Spinner logic
// Reuses The Color API loader from /js/mood/palettes.js

import { loadPalettesFromColorAPI } from '/js/mood/palettes.js';

const el = {
  lengthGroup: document.getElementById('lengthGroup'),
  transformGroup: document.getElementById('transformGroup'),
  speedGroup: document.getElementById('speedGroup'),
  modeButtons: document.getElementById('modeButtons'),
  sizeA: document.getElementById('sizeA'),
  sizeB: document.getElementById('sizeB'),
  goButton: document.getElementById('goButton'),
  copyButton: document.getElementById('copyButton'),
  row: document.getElementById('row'),
  hexRow: document.getElementById('hexRow'),
  counter: document.getElementById('counter'),
};

let palettes = [];
let maxSlots = 5; // current maximum visible swatches (used for grid + slots)
let idx = 0;
let timer = null;
let rafId = null;
let currentColors = [];
let activeTarget = null;
const BASE_STEP_MS = 666;   // base step duration (original)
const BASE_MORPH_MS = 600;  // base morph duration (original)

function getSpeedFactor() {
  const v = el.speedGroup?.value || 'normal';
  // Fast = original speed (1x). Normal (middle) = quarter speed (4x slower). Chill (slow) = eighth speed (8x slower).
  if (v === 'fast') return 1;
  if (v === 'slow') return 0.125;
  return 0.25; // normal
}
function getDurations() {
  const f = getSpeedFactor();
  return {
    step: Math.max(16, Math.round(BASE_STEP_MS / f)),
    morph: Math.max(50, Math.round(BASE_MORPH_MS / f)),
  };
}


function parseRange(v) {
  const [a, b] = String(v).split('-').map(n => parseInt(n, 10));
  const min = Math.min(a || 1, b || 1);
  const max = Math.max(a || 1, b || 1);
  return { min, max };
}

function getLengthLimit() {
  const mode = el.lengthGroup?.value || 'normal';
  if (mode === 'quick') return 10;
  if (mode === 'long') return 60;
  return 30; // normal
}

function getSelectedModes() {
  const btns = Array.from(el.modeButtons?.querySelectorAll('.palette-toggle') || []);
  const selected = btns.filter(b => b.classList.contains('active')).map(b => b.getAttribute('data-mode')).filter(Boolean);
  // Fallback default: exciting non-mono modes
  if (!selected.length) return ['analogic','complement','analogic-complement','triad','quad'];
  return selected;
}

function getOptions() {
  const limit = getLengthLimit();
  const a = parseInt(el.sizeA?.value, 10) || 5;
  const b = parseInt(el.sizeB?.value, 10);
  const modes = getSelectedModes();
  if (!b || b <= a) {
    return { limit, mode: 'fixed', minCount: a, maxCount: a, modes };
  }
  return { limit, mode: 'range', minCount: a, maxCount: b, modes };
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHex({ r, g, b }) {
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(Math.max(0, Math.min(255, r)))}${toHex(Math.max(0, Math.min(255, g)))}${toHex(Math.max(0, Math.min(255, b)))}`.toUpperCase();
}
function cssRgbToHex(str) {
  // Accepts rgb(r,g,b) or rgba(r,g,b,a)
  const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(str || '');
  if (!m) return '#000000';
  return rgbToHex({ r: parseInt(m[1],10), g: parseInt(m[2],10), b: parseInt(m[3],10) });
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const lerp = (x, y, p) => x + (y - x) * p;
  return rgbToHex({ r: Math.round(lerp(A.r, B.r, t)), g: Math.round(lerp(A.g, B.g, t)), b: Math.round(lerp(A.b, B.b, t)) });
}
// Sample a discrete palette to exactly K colors by even spacing with interpolation
function normalizePaletteToCount(pal, K) {
  const p = Array.isArray(pal) ? pal.filter(Boolean) : [];
  const L = p.length;
  if (K <= 0) return [];
  if (L <= 0) return Array(K).fill('#000000');
  if (L === 1) return Array(K).fill(p[0]);
  if (L === K) return p.slice(0, K);
  const out = [];
  for (let i = 0; i < K; i++) {
    const pos = (i * (L - 1)) / (K - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(L - 1, Math.ceil(pos));
    const t = pos - lo;
    const c = lo === hi ? p[lo] : mixHex(p[lo], p[hi], t);
    out.push(c);
  }
  return out;
}

function buildSlots(count) {
  maxSlots = count;
  el.row.innerHTML = '';
  el.row.style.gridTemplateColumns = `repeat(${maxSlots}, 1fr)`;
  const { morph } = getDurations();
  for (let i = 0; i < maxSlots; i++) {
    const d = document.createElement('div');
    d.className = 'sw';
    d.style.transition = `background-color ${morph}ms ease-in-out`;
    el.row.appendChild(d);
  }
}

function setSwTransitionEnabled(enabled) {
  const slots = Array.from(el.row.children);
  const { morph } = getDurations();
  const val = enabled ? `background-color ${morph}ms ease-in-out` : 'none';
  for (const sw of slots) sw.style.transition = val;
}

function applyPalette(hexes) {
  const slots = Array.from(el.row.children);
  for (let i = 0; i < maxSlots; i++) {
    const sw = slots[i];
    const hex = hexes[i] || '#000000';
    sw.style.backgroundColor = hex; // color morph handled by CSS when enabled
  }
  // Hex chips show target palette values
  el.hexRow.innerHTML = '';
  hexes.forEach(h => {
    const chip = document.createElement('div');
    chip.className = 'hex-chip';
    chip.textContent = h;
    el.hexRow.appendChild(chip);
  });
}

function padToSlots(hexes) {
  const out = (hexes || []).slice(0, maxSlots);
  while (out.length < maxSlots) out.push(out[out.length - 1] || '#000000');
  return out;
}

function applyPaletteDynamic(hexes) {
  const K = Math.max(1, Math.min(maxSlots, (hexes || []).length));
  el.row.style.gridTemplateColumns = `repeat(${K}, 1fr)`;
  const slots = Array.from(el.row.children);
  for (let i = 0; i < maxSlots; i++) {
    const sw = slots[i];
    if (i < K) {
      sw.style.display = '';
      sw.style.backgroundColor = hexes[i] || '#000000';
    } else {
      sw.style.display = 'none';
    }
  }
}

function getDisplayedHexes() {
  const slots = Array.from(el.row.children);
  const out = [];
  for (let i = 0; i < maxSlots; i++) {
    const sw = slots[i];
    if (sw.style.display === 'none') continue;
    const comp = getComputedStyle(sw).backgroundColor;
    out.push(cssRgbToHex(comp));
  }
  return out.length ? out : padToSlots(currentColors);
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function getTransformMode() { return (el.transformGroup?.value || 'css'); }

function animateBetween(prevHexes, nextHexes, mode, durationMs) {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  const t0 = performance.now();
  const slots = Array.from(el.row.children);

  const K = Math.max(1, Math.min(maxSlots, (nextHexes || []).length));
  el.row.style.gridTemplateColumns = `repeat(${K}, 1fr)`;
  for (let i = 0; i < maxSlots; i++) {
    slots[i].style.display = i < K ? '' : 'none';
  }

  // Precompute color-space representations
  const prev = padToSlots(prevHexes);
  const next = padToSlots(nextHexes);

  // For HSL
  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex); let rr=r/255, gg=g/255, bb=b/255;
    const cmax = Math.max(rr, gg, bb), cmin = Math.min(rr, gg, bb), delta = cmax - cmin;
    let h = 0;
    if (delta !== 0) {
      if (cmax === rr) h = 60 * (((gg - bb) / delta) % 6);
      else if (cmax === gg) h = 60 * (((bb - rr) / delta) + 2);
      else h = 60 * (((rr - gg) / delta) + 4);
    }
    if (h < 0) h += 360;
    const l = (cmax + cmin) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h, s, l };
  }
  function hslToHex(h, s, l) {
    const C = (1 - Math.abs(2 * l - 1)) * s;
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - C / 2;
    let r1=0,g1=0,b1=0;
    if (0 <= h && h < 60) { r1=C; g1=X; b1=0; }
    else if (60 <= h && h < 120) { r1=X; g1=C; b1=0; }
    else if (120 <= h && h < 180) { r1=0; g1=C; b1=X; }
    else if (180 <= h && h < 240) { r1=0; g1=X; b1=C; }
    else if (240 <= h && h < 300) { r1=X; g1=0; b1=C; }
    else { r1=C; g1=0; b1=X; }
    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);
    return rgbToHex({ r, g, b });
  }

  // OKLCH conversions (based on OKLab by Björn Ottosson)
  function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linearToSrgb(c) { return c <= 0.0031308 ? Math.round(255 * (12.92 * c)) : Math.round(255 * (1.055 * Math.pow(c, 1/2.4) - 0.055)); }
  function srgbHexToOklch(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
    const l = 0.4122214708*rl + 0.5363325363*gl + 0.0514459929*bl;
    const m = 0.2119034982*rl + 0.6806995451*gl + 0.1073969566*bl;
    const s = 0.0883024619*rl + 0.2817188376*gl + 0.6299787005*bl;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_;
    const a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_;
    const b2 = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_;
    const C = Math.sqrt(a*a + b2*b2);
    let h = Math.atan2(b2, a) * 180 / Math.PI; if (h < 0) h += 360;
    return { L, C, h };
  }
  function oklchToSrgbHex(L, C, h) {
    const hr = h * Math.PI / 180;
    const a = C * Math.cos(hr);
    const b2 = C * Math.sin(hr);
    const l_ = L + 0.3963377774*a + 0.2158037573*b2;
    const m_ = L - 0.1055613458*a - 0.0638541728*b2;
    const s_ = L - 0.0894841775*a - 1.2914855480*b2;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    let r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s;
    let g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s;
    let b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s;
    r = linearToSrgb(r); g = linearToSrgb(g); b = linearToSrgb(b);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return rgbToHex({ r, g, b });
  }

  // Precompute color space pairs for efficiency
  const prevHSL = mode === 'hsl' ? prev.map(hexToHsl) : null;
  const nextHSL = mode === 'hsl' ? next.map(hexToHsl) : null;
  const prevOK = mode === 'oklch' ? prev.map(srgbHexToOklch) : null;
  const nextOK = mode === 'oklch' ? next.map(srgbHexToOklch) : null;

  // Update chips to target palette immediately
  el.hexRow.innerHTML = '';
  next.forEach(h => { const chip = document.createElement('div'); chip.className='hex-chip'; chip.textContent = h; el.hexRow.appendChild(chip); });

  function step(now) {
    const t = Math.min(1, (now - t0) / durationMs);
    for (let i = 0; i < maxSlots; i++) {
      let outHex = next[i];
      if (mode === 'rgb') {
        outHex = mixHex(prev[i], next[i], t);
      } else if (mode === 'hsl') {
        const a = prevHSL[i], b = nextHSL[i];
        // Lerp s,l; hue shortest path
        const dh = ((((b.h - a.h) % 360) + 540) % 360) - 180;
        const h = a.h + dh * t;
        const s = a.s + (b.s - a.s) * t;
        const l = a.l + (b.l - a.l) * t;
        outHex = hslToHex(((h % 360) + 360) % 360, s, l);
      } else if (mode === 'oklch') {
        const a = prevOK[i], b = nextOK[i];
        const eps = 1e-6;
        const dh = ((((b.h - a.h) % 360) + 540) % 360) - 180;
        const h = (a.h + dh * t + 360) % 360;
        const L = a.L + (b.L - a.L) * t;
        const C = a.C + (b.C - a.C) * t;
        outHex = oklchToSrgbHex(L, C, h);
      }
      slots[i].style.backgroundColor = outHex;
    }
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = null;
    }
  }
  rafId = requestAnimationFrame(step);
}

function tick() {
  if (idx >= palettes.length) {
    stopTimer();
    // reveal final hexes and enable copy
    if (palettes.length) {
      showFinalHexes(palettes[palettes.length - 1]);
      el.copyButton.style.display = '';
      el.counter.textContent = '';
    }
    return;
  }
  const next = palettes[idx];
  const mode = getTransformMode();
  activeTarget = next;

  // Hide hexes and counter until final
  el.hexRow.style.display = 'none';
  el.copyButton.style.display = 'none';
  el.counter.textContent = '';

  if (mode === 'css') {
    setSwTransitionEnabled(true);
    applyPaletteDynamic(next);
  } else {
    setSwTransitionEnabled(false);
    const { morph } = getDurations();
    animateBetween(currentColors.length ? currentColors : palettes[Math.max(0, idx-1)] || next,
                   next,
                   mode,
                   morph);
  }
  currentColors = padToSlots(next.slice());
  // do not show progress counter; only show final
  idx++;
}

function play() {
  if (!palettes.length) return;
  stopTimer();
  const { step } = getDurations();
  timer = setInterval(tick, step);
}

function pause() { stopTimer(); }

function showFinalHexes(hexes) {
  el.hexRow.style.display = '';
  el.hexRow.innerHTML = '';
  hexes.forEach(h => {
    const chip = document.createElement('div');
    chip.className = 'hex-chip';
    chip.textContent = h;
    el.hexRow.appendChild(chip);
  });
}

async function copyFinalPaletteImage(hexes) {
  try {
    const w = (hexes.length || 1) * 100;
    const h = 100;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < hexes.length; i++) {
      ctx.fillStyle = hexes[i];
      ctx.fillRect(i * 100, 0, 100, h);
    }
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (blob && navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied PNG to clipboard');
    } else {
      // Fallback: trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'palette.png'; a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded PNG');
    }
  } catch (e) {
    console.error('Copy PNG failed', e);
    showToast('Copy failed');
  }
}

function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

function restart() {
  idx = 0;
  el.counter.textContent = ``;
  if (palettes.length) {
    setSwTransitionEnabled(false);
    currentColors = palettes[0].slice();
    applyPalette(currentColors);
  }
}

async function loadPalettesUI() {
  try {
    pause();
    idx = 0;
    const opts = getOptions();
    // UI reset
    el.hexRow.style.display = 'none';
    el.copyButton.style.display = 'none';
    el.counter.textContent = ``;

    // Build slots to the upper bound when range so we can vary count per palette without rebuilding nodes
    const slotsTarget = opts.mode === 'fixed' ? opts.minCount : Math.max(opts.minCount, opts.maxCount);
    buildSlots(slotsTarget);

    const t0 = performance.now();
    const list = await loadPalettesFromColorAPI({
      limit: opts.limit,
      minCount: opts.minCount,
      maxCount: opts.maxCount,
      modes: opts.modes,
    });

    // Keep variable-length palettes so each step can randomize size within range
    palettes = list;

    const ms = Math.round(performance.now() - t0);
    if (!palettes.length) {
      el.counter.textContent = ``;
      showToast('No palettes from The Color API');
      return;
    }

    // Initial application
    setSwTransitionEnabled(true);
    applyPaletteDynamic(palettes[0]);
    currentColors = padToSlots(palettes[0]);
    // keep counter hidden until final
    idx = 1; // next on play
    // ready to spin
  } catch (e) {
    console.error('[PaletteSpinner] load error', e);
    showToast(`Error: ${e && e.message ? e.message : e}`);
  }
}

async function startSpin() {
  await loadPalettesUI();
  play();
}

function rescheduleTimerIfRunning() {
  if (!timer) return;
  const { step } = getDurations();
  clearInterval(timer);
  timer = setInterval(tick, step);
}

// Wire UI
el.goButton.addEventListener('click', startSpin);
el.copyButton.addEventListener('click', () => {
  if (palettes.length) copyFinalPaletteImage(palettes[palettes.length - 1]);
});

// Mode toggle behavior
el.modeButtons?.querySelectorAll('.palette-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
});

// Apply speed live: reschedule step timer and restart the current transition to new morph duration
el.speedGroup?.addEventListener('sl-change', () => {
  // Update transitions for CSS mode
  setSwTransitionEnabled(true);
  // Reschedule timer cadence
  rescheduleTimerIfRunning();

  if (!activeTarget) return;
  const mode = getTransformMode();
  const curr = getDisplayedHexes();
  const { morph } = getDurations();

  if (mode === 'css') {
    // Restart CSS transition from current colors to target with new duration
    setSwTransitionEnabled(false);
    applyPaletteDynamic(curr);
    setSwTransitionEnabled(true);
    // next tick to ensure style commit
    setTimeout(() => applyPaletteDynamic(activeTarget), 0);
  } else {
    // Restart JS animation with new duration
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    animateBetween(padToSlots(curr), activeTarget, mode, morph);
  }
});

// Initial build of slots to a default count
buildSlots(parseInt(el.sizeA?.value, 10) || 5);
