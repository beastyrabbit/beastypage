// Palettes loader (strict trending only; no content fallbacks)

const LOCAL_URL = '/assets/data/palettes.json'; // unused in strict mode (kept for legacy)
const COOLORS_TRENDING = 'https://coolors.co/palettes/trending';
const ALL_ORIGINS = 'https://api.allorigins.win/raw?url=';
const LS_KEY = 'palettes:trending-json';
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let LAST_DEBUG = {
  endpointsTried: [],
  chosenEndpoint: null,
  htmlLength: 0,
  viaLinksCount: 0,
  viaJSONCount: 0,
  viaHexCount: 0,
  parseSource: 'none'
};

// STRICT Coolors trending (kept for reference/testing); generally blocked by CORS in browsers.
export async function loadPalettes() {
  // Strict: Only trending page parse. No content fallbacks.
  console.log('[PalettesLoader] loadPalettes: fetching trending HTML…');
  const html = await fetchTrendingHTML();
  LAST_DEBUG.htmlLength = html ? html.length : 0;
  console.log('[PalettesLoader] loadPalettes: HTML length', LAST_DEBUG.htmlLength);
  const palettes = parseCoolorsTrending(html);
  console.log('[PalettesLoader] loadPalettes: parsed palettes count', palettes.length, 'source', LAST_DEBUG.parseSource, 'counts', { links: LAST_DEBUG.viaLinksCount, json: LAST_DEBUG.viaJSONCount, hex: LAST_DEBUG.viaHexCount });
  if (palettes && palettes.length) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), palettes })); } catch {}
    return palettes;
  }
  throw new Error('No trending palettes found');
}

// Cached-only variant for initial load to avoid network
export async function loadPalettesCachedOnly() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) {
      const { t, palettes } = JSON.parse(s);
      if (Array.isArray(palettes) && Date.now() - t < LS_TTL_MS) return palettes;
    }
  } catch {}
  // Strict: no curated fallback when cached is missing
  return [];
}

export function normalizePalette(p) {
  return (p || []).filter(Boolean).map(x => String(x).trim());
}

// A small fallback set in case local file fails
const FALLBACK = [
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"],
  ["#1F2041", "#4B3F72", "#FFC857", "#119DA4", "#19647E"],
  ["#2B193D", "#3E1F47", "#A49E8D", "#EFD9CE", "#F9F5E3"]
];

export function parseCoolorsTrending(html) {
  if (!html) return [];
  // 1) Prefer extracting from palette links (robust across SSR/CSR)
  const viaLinks = extractPalettesFromLinks(html);
  LAST_DEBUG.viaLinksCount = viaLinks.length;
  if (viaLinks.length) { LAST_DEBUG.parseSource = 'links'; }
  if (viaLinks.length) return viaLinks;

  // 2) Try embedded __NEXT_DATA__ JSON if available (SPA builds)
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (m && m[1]) {
    try {
      const data = JSON.parse(m[1]);
      // Common structure: data.props.pageProps.palettes[] where each p.colors is an array
      const list = data?.props?.pageProps?.palettes || data?.props?.pageProps?.data || [];
      const out = [];
      for (const p of list) {
        const cols = (p?.colors || p?.palette || []).map(normalizeHex);
        const uniq = Array.from(new Set(cols)).filter(Boolean);
        if (uniq.length >= 3) out.push(uniq.slice(0, 5));
        if (out.length >= 120) break;
      }
      LAST_DEBUG.viaJSONCount = out.length;
      if (out.length) { LAST_DEBUG.parseSource = 'json'; }
      if (out.length) return out;
    } catch (e) {
      console.warn('Failed to parse __NEXT_DATA__ JSON:', e);
    }
  }
  // Strict: no heuristics. Return empty when no explicit content found.
  LAST_DEBUG.viaHexCount = 0;
  LAST_DEBUG.parseSource = 'none';
  return [];
}

function normalizeHex(v) {
  if (!v) return null;
  if (typeof v === 'object' && v.hex) v = v.hex;
  v = String(v).trim().replace(/[^0-9a-fA-F]/g, '');
  if (v.length === 3) v = v.split('').map(x => x + x).join('');
  if (v.length !== 6) return null;
  return '#' + v.toUpperCase();
}

async function fetchTrendingHTML() {
  const endpoints = [
    // Try read-only mirrors first (fast)
    'https://r.jina.ai/http://coolors.co/palettes/trending',
    'https://r.jina.ai/http://www.coolors.co/palettes/trending',
    // Additional proxy
    'https://every-origin.vercel.app/raw?url=' + encodeURIComponent(COOLORS_TRENDING),
    ALL_ORIGINS + encodeURIComponent(COOLORS_TRENDING)
  ];
  LAST_DEBUG.endpointsTried = [];
  for (const url of endpoints) {
    try {
      const t0 = performance.now();
      LAST_DEBUG.endpointsTried.push(url);
      console.log('[PalettesLoader] fetchTrendingHTML: trying', url);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const html = await res.text();
      const ok = /<script id="__NEXT_DATA__"/.test(html) || /href=(?:\"|\')(?:https?:\/\/)?(?:www\.)?coolors\.co?\/palette\//.test(html) || /#[0-9a-fA-F]{6}/.test(html);
      console.log('[PalettesLoader] fetchTrendingHTML: got', html.length, 'bytes. Sanity=', ok, 'Duration(ms)=', Math.round(performance.now()-t0));
      if (ok) { LAST_DEBUG.chosenEndpoint = url; return html; }
    } catch (e) {
      console.warn('Trending proxy failed:', url, e);
    }
  }
  throw new Error('All trending proxies failed');
}

function extractPalettesFromLinks(html) {
  const results = [];
  const seen = new Set();
  const patterns = [
    new RegExp('(?:https?:\\/\\/)?(?:www\\.)?coolors\\.co\\/palette\\/([0-9a-fA-F\-]{11,})','gi'),
    new RegExp('\\bas=\\"(?:https?:\\/\\/)?(?:www\\.)?coolors\\.co?\\/palette\\/([0-9a-fA-F\-]{11,})\\"','gi'),
    new RegExp('\\bonclick=\\"[^\\"]*\\/palette\\/([0-9a-fA-F\-]{11,})[^\\"]*\\"','gi'),
    new RegExp('\\bhref=\\"[^\\"]*\\/palette\\/([0-9a-fA-F\-]{11,})[^\\"]*\\"','gi'),
    new RegExp("\\bhref='[^']*\\/palette\\/([0-9a-fA-F\-]{11,})[^']*'",'gi'),
    new RegExp('\\/palette\\/([0-9a-fA-F\-]{11,})','gi'),
    // Generic JSON/JS occurrence of the slug
    new RegExp('\\"palette\\/([0-9a-fA-F\-]{11,})\\"','gi')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      const parts = slug.split('-').map(x => normalizeHex(x)).filter(Boolean);
      if (parts.length >= 5) results.push(parts.slice(0,5));
      if (results.length >= 200) break;
    }
  }
  console.log('[PalettesLoader] extractPalettesFromLinks: slugs', results.length);
  return results;
}

// Fallback: extract sequences like "FF0096-FFFFFF-0073CE-000000-FFD700" anywhere in the HTML
// Strict mode: no dash/cluster heuristics

export function getPalettesDebug() { return LAST_DEBUG; }

// ===================== The Color API palettes (live, CORS-friendly) =====================

const COLOR_API_ENDPOINT = 'https://www.thecolorapi.com/scheme';
// Limit default scheme modes to non-monochrome for more exciting palettes
const COLOR_API_MODES = [
  'analogic', 'complement', 'analogic-complement',
  'triad', 'quad'
];

function randomHexSeed() {
  const n = Math.floor(Math.random() * 0xffffff);
  return n.toString(16).padStart(6, '0');
}

function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

async function fetchColorApiScheme(seedHex, mode, count=5) {
  // sanitize mode per spec (quad instead of tetrad/square)
  if (mode === 'tetrad' || mode === 'square') mode = 'quad';
  const url = `${COLOR_API_ENDPOINT}?hex=${seedHex}&mode=${encodeURIComponent(mode)}&count=${count}`;
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The Color API ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data?.colors) ? data.colors : [];
  const hexes = arr.map(c => c?.hex?.value).filter(Boolean).slice(0, count);
  // console.log('[ColorAPI]', seedHex, mode, '->', hexes);
  return { hexes, ms: Math.round(performance.now()-t0) };
}

export async function loadPalettesFromColorAPI(optsOrLimit=10, maybeCountPer=5) {
  // Overload: loadPalettesFromColorAPI({limit,minCount,maxCount,modes})
  // or loadPalettesFromColorAPI(limit, countPer)
  const defaults = { limit: 10, minCount: 4, maxCount: 12, modes: COLOR_API_MODES };
  const opts = typeof optsOrLimit === 'object'
    ? { ...defaults, ...optsOrLimit }
    : { limit: optsOrLimit, minCount: maybeCountPer ?? 5, maxCount: maybeCountPer ?? 5, modes: COLOR_API_MODES };

  const results = [];
  const maxConcurrent = 4;
  const maxAttempts = Math.max(opts.limit * 4, 16);
  let inFlight = 0;
  let attempts = 0;

  function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function spawn() {
    if (results.length >= opts.limit || attempts >= maxAttempts || inFlight >= maxConcurrent) return;
    attempts++;
    inFlight++;
    const seed = randomHexSeed();
    const mode = pick(opts.modes);
    const count = rndInt(opts.minCount, opts.maxCount);
    fetchColorApiScheme(seed, mode, count)
      .then(({ hexes }) => {
        if (hexes && hexes.length >= 4) results.push(hexes.slice(0, count));
      })
      .catch(() => { /* ignore single failures (e.g., 500) */ })
      .finally(() => { inFlight--; scheduleSpawn(); });
    // Try to keep pipeline full
    if (inFlight < maxConcurrent) scheduleSpawn();
  }

  function scheduleSpawn() {
    // add small jitter to avoid hammering the API
    setTimeout(spawn, rndInt(60, 180));
  }

  // Prime the pipeline
  for (let k = 0; k < maxConcurrent; k++) scheduleSpawn();

  // Wait until done
  await new Promise(resolve => {
    const timer = setInterval(() => {
      if (results.length >= opts.limit || (attempts >= maxAttempts && inFlight === 0)) {
        clearInterval(timer);
        resolve();
      } else {
        // keep spawning if room available
        scheduleSpawn();
      }
    }, 40);
  });
  return results.slice(0, opts.limit);
}

export async function loadPalettesFromColorAPIByModes({ modes = COLOR_API_MODES, each = 3, minCount = 4, maxCount = 12 } = {}) {
  // Returns [{ mode, hexes }]
  const out = [];
  for (const mode of modes) {
    const items = await loadPalettesFromColorAPI({ limit: each, minCount, maxCount, modes: [mode] });
    for (const hexes of items) out.push({ mode, hexes });
  }
  return out;
}
