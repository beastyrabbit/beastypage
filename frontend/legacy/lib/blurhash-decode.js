// Minimal BlurHash decoder for browser (RGBA Uint8ClampedArray output)
// Based on https://github.com/woltapp/blurhash (MIT)

function sRGBToLinear(value) {
  value /= 255;
  if (value <= 0.04045) return value / 12.92;
  return Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearTosRGB(value) {
  value = Math.max(0, Math.min(1, value));
  if (value <= 0.0031308) return Math.round(value * 12.92 * 255 + 0.5);
  return Math.round((1.055 * Math.pow(value, 1 / 2.4) - 0.055) * 255 + 0.5);
}

function signPow(val, exp) {
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

function decode83(str) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
  let value = 0;
  for (let i = 0; i < str.length; i++) value = value * 83 + chars.indexOf(str[i]);
  return value;
}

function decodeDC(value) {
  const r = decode83(value) >> 16;
  const g = (decode83(value) >> 8) & 255;
  const b = decode83(value) & 255;
  return [sRGBToLinear(r), sRGBToLinear(g), sRGBToLinear(b)];
}

function decodeAC(value, maximumValue) {
  const v = decode83(value);
  const r = Math.floor(v / (19 * 19));
  const g = Math.floor(v / 19) % 19;
  const b = v % 19;
  return [
    signPow((r - 9) / 9, 2.0) * maximumValue,
    signPow((g - 9) / 9, 2.0) * maximumValue,
    signPow((b - 9) / 9, 2.0) * maximumValue,
  ];
}

export function decode(blurHash, width = 32, height = 32, punch = 1.0) {
  if (!blurHash || blurHash.length < 6) throw new Error('Invalid blurhash');
  const sizeFlag = decode83(blurHash[0]);
  const numY = Math.floor(sizeFlag / 9) + 1;
  const numX = (sizeFlag % 9) + 1;

  const quantisedMaximumValue = decode83(blurHash[1]);
  const maximumValue = (quantisedMaximumValue + 1) / 166;

  const colors = [];
  // DC component
  colors.push(decodeDC(blurHash.substring(2, 6)));
  // AC components
  let pos = 6;
  for (let y = 0; y < numY; y++) {
    for (let x = 0; x < numX; x++) {
      if (x === 0 && y === 0) continue;
      colors.push(decodeAC(blurHash.substring(pos, pos + 2), maximumValue * punch));
      pos += 2;
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const color = colors[i + j * numX];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const idx = 4 * (x + y * width);
      pixels[idx + 0] = linearTosRGB(r);
      pixels[idx + 1] = linearTosRGB(g);
      pixels[idx + 2] = linearTosRGB(b);
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}
