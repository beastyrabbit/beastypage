// Independent RNG utilities for Mood Board (no reuse of cat RNG)

export const ANIMALS = [
  'elephant', 'cat', 'red panda', 'panda', 'fox', 'otter', 'koala', 'hedgehog',
  'capybara', 'rabbit', 'penguin', 'seal', 'alpaca', 'hedgehog baby',
  'lion', 'tiger', 'bear', 'wolf', 'owl', 'lynx', 'snow leopard', 'cheetah',
  'dolphin', 'whale', 'horse', 'giraffe', 'flamingo', 'hummingbird',
  'meerkat', 'lemur', 'polar bear', 'gorilla', 'zebra', 'hippo'
];

export const LOCATIONS = [
  'forest', 'city', 'desert', 'mountains', 'beach', 'jungle', 'arctic', 'savannah',
  'river', 'temple', 'meadow', 'waterfall', 'lake', 'night sky', 'canyon', 'volcano',
  'floating islands', 'ancient ruins', 'coral reef', 'cloud forest', 'space station'
];

export const POSES = [
  'sleeping', 'running', 'jumping', 'flying', 'eating', 'meditating', 'fighting',
  'swimming', 'playing', 'curled up', 'dancing', 'stretching', 'balancing',
  'prowling', 'hovering'
];

export const MOODS = [
  'happy', 'angry', 'sad', 'peaceful', 'mischievous', 'dreamy', 'scared', 'proud',
  'chaotic', 'curious', 'serene', 'whimsical', 'determined', 'melancholic', 'sassy'
];

export const WEATHER = [
  'rain', 'snow', 'fog', 'sunny', 'storm', 'rainbow', 'starry night', 'aurora',
  'sunset', 'misty morning', 'thunderstorm', 'blizzard', 'sun shower',
  'twilight', 'hurricane skies'
];

export const LIGHTING = [
  'golden hour', 'silhouette', 'neon lights', 'moonlight', 'firelight',
  'bioluminescence', 'candlelit', 'lantern glow', 'backlit', 'spotlight',
  'color gel', 'studio strobe'
];

export const STYLES = [
  'cyberpunk', 'fantasy', 'steampunk', 'watercolor', 'ink sketch', 'kawaii',
  'gothic', 'abstract', 'traditional', 'pixel art', 'claymation', 'low poly',
  'retro anime', 'oil painting', 'storybook', 'line art'
];

export const ACCESSORIES = [
  'umbrella', 'lantern', 'book', 'mask', 'crown', 'sword', 'backpack', 'headphones',
  'flower', 'balloons', 'scarf', 'glasses', 'tea cup', 'camera', 'magic staff',
  'compass', 'armor'
];

export const COMPOSITIONS = [
  'rule of thirds', 'leading lines', 'negative space', 'framing elements',
  'dynamic angle', 'bird\'s-eye view', 'worm\'s-eye view', 'close crop',
  'golden spiral', 'triadic balance', 'central focus', 'diagonal flow',
  'mirrored symmetry', 'layered depth', 'asymmetrical balance'
];

export const FLORA = [
  'cherry blossoms', 'ancient bonsai', 'glowing mushrooms', 'succulent garden',
  'lotus pond', 'bamboo grove', 'wildflower meadow', 'carnivorous plants',
  'giant sunflowers', 'driftwood forest', 'mossy glen', 'bioluminescent ferns'
];

export const ELEMENTS = [
  'ember sparks', 'tidal wave', 'earth pillars', 'whirlwind', 'crystal shard storm',
  'stardust veil', 'aurora ribbon', 'shadow mist', 'lightning arc', 'frozen prism',
  'molten glow', 'nebula cloud'
];

export const TEXTURES = [
  'weathered stone', 'brushed metal', 'velvet drape', 'glazed ceramic',
  'woven tapestry', 'water ripples', 'charcoal strokes', 'cracked earth',
  'frosted glass', 'ink wash', 'patina bronze', 'clouded pigment'
];

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

export function seededRandom(seed) {
  // Mulberry32
  let t = seed + 0x6D2B79F5;
  return function() {
    t |= 0; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function pickWithSeed(arr, seed) {
  const rnd = seededRandom(seed)();
  return arr[Math.floor(rnd * arr.length)];
}

export function buildQuery(animal, location) {
  // Bias Unsplash toward the subject (animal) and add wildlife context
  return `${animal} animal wildlife ${location || ''}`.trim();
}

// Map an array of hex swatches to a rough Unsplash color category
// Unsplash accepts one of: black_and_white, black, white, yellow, orange, red, purple, magenta, green, teal, blue
export function paletteToUnsplashColor(palette) {
  if (!palette || !palette.length) return undefined;
  const toRgb = (hex) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0,2), 16);
    const g = parseInt(h.substring(2,4), 16);
    const b = parseInt(h.substring(4,6), 16);
    return { r, g, b };
  };
  const rgb = palette.map(toRgb);
  const avg = rgb.reduce((a,c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), {r:0,g:0,b:0});
  avg.r/=rgb.length; avg.g/=rgb.length; avg.b/=rgb.length;
  // Convert to HSV for hue
  const max = Math.max(avg.r, avg.g, avg.b), min = Math.min(avg.r, avg.g, avg.b);
  const v = max/255; const s = max===0?0:(max-min)/max;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch(max){
      case avg.r: h = (avg.g-avg.b)/d + (avg.g < avg.b ? 6 : 0); break;
      case avg.g: h = (avg.b-avg.r)/d + 2; break;
      case avg.b: h = (avg.r-avg.g)/d + 4; break;
    }
    h /= 6;
  }
  if (v < 0.25) return 'black';
  if (s < 0.08 && v > 0.9) return 'white';
  const deg = h * 360;
  if (deg >= 0 && deg < 20) return 'red';
  if (deg < 45) return 'orange';
  if (deg < 70) return 'yellow';
  if (deg < 160) return 'green';
  if (deg < 190) return 'teal';
  if (deg < 260) return 'blue';
  if (deg < 310) return 'purple';
  return 'magenta';
}
