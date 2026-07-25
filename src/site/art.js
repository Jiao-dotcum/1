/**
 * Procedural 1-bit illustrations, in the dithered-engraving idiom.
 *
 * Each plate is a scalar field sampled on a grid and reduced to pure on/off ink
 * by an 8x8 Bayer threshold, which is what produces the ordered cross-hatch
 * texture rather than the mushy look of error-diffusion at this scale.
 *
 * Each plate is emitted twice, once in the light theme's ink and once in the
 * dark theme's, and the page swaps them with <picture> + prefers-color-scheme.
 * The obvious alternative — one alpha-only plate used as a CSS mask over
 * `var(--blue)` — is prettier in source but silently fails when the page is
 * opened from file://, where Chromium refuses to load mask images. This page
 * has to work from a plain checkout, so it uses two real images.
 *
 * Nothing here is a data visualisation. The chart is the data; these are
 * ornament, and are marked aria-hidden.
 */
import { encodePng } from './png.js';

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Plate aspect ratio (width / height), used to keep radial shapes circular. */
const ASPECT = 620 / 400;

/** Soft edge falloff so plates fade rather than ending on a hard rectangle. */
function vignette(x, y, strength = 1) {
  const e = Math.min(x, 1 - x, y, 1 - y);
  return clamp01(1 - strength * Math.exp(-e * 9));
}

/**
 * A radiant body over a ruled horizon — the celestial-engraving motif.
 * Dense rays near the core, concentric rings, one clean horizon line.
 */
function radiant(x, y) {
  // Fields are sampled in normalised coordinates, so horizontal distance is
  // scaled by the plate's aspect ratio to keep circles circular.
  const dx = (x - 0.5) * ASPECT;
  const dy = y - 0.46;
  const r = Math.hypot(dx, dy);
  const th = Math.atan2(dy, dx);

  const rays = 0.5 + 0.5 * Math.cos(th * 44 + Math.sin(r * 8) * 0.9);
  const rings = 0.5 + 0.5 * Math.cos(r * 88);
  const core = clamp01((0.072 - r) * 34);
  const halo = Math.exp(-r * 3.9);

  let v = core * 1.15 + halo * (0.62 * rays + 0.38 * rings);

  // Horizon band with ruled hatching below it.
  if (y > 0.78) {
    const t = (y - 0.78) / 0.22;
    v = Math.max(v * 0.25, (0.5 + 0.5 * Math.cos(y * 210)) * (0.55 - 0.35 * t));
  }
  return clamp01(v) * vignette(x, y, 0.85);
}

/**
 * Interference strata — scanline hatching modulated by a slow travelling wave.
 */
function strata(x, y) {
  const wave = Math.sin((x * 4.6 + Math.sin(y * 3.4 + x * 2.1) * 1.5) * Math.PI);
  const lines = 0.5 + 0.5 * Math.sin(y * Math.PI * 74);
  const swell = 0.5 + 0.5 * Math.cos((y - 0.5) * 3.4);
  const v = (0.32 + 0.68 * lines) * (0.28 + 0.72 * clamp01(0.5 + 0.5 * wave)) * (0.55 + 0.45 * swell);
  return clamp01(v * 1.25) * vignette(x, y, 0.7);
}

/**
 * A checkerboard plane in perspective, with a burst above the vanishing point.
 */
function lattice(x, y) {
  const horizon = 0.34;
  let v;
  if (y > horizon) {
    const d = (y - horizon) * 1.9 + 0.055;
    const u = (x - 0.5) / d;
    const w = 0.42 / d;
    const cell = (Math.floor(u * 5) + Math.floor(w * 5)) & 1;
    const fade = clamp01((y - horizon) * 2.6);
    v = (cell ? 0.86 : 0.12) * (0.35 + 0.65 * fade);
  } else {
    const dx = x - 0.5;
    const dy = y - horizon;
    const th = Math.atan2(dy, dx);
    const r = Math.hypot(dx, dy * 1.6);
    v = (0.5 + 0.5 * Math.cos(th * 30)) * Math.exp(-r * 4.2) * 1.15;
  }
  return clamp01(v) * vignette(x, y, 0.8);
}

/** The plates, in page order. `caption` is real content, not lorem. */
export const PLATES = [
  {
    name: 'reproducible',
    tag: 'Reproducible',
    title: 'Checkable by hand',
    caption:
      'Five public FRED series, fixed weights, piecewise-linear anchors and rounding specified to the ' +
      'decimal place. Nothing is proprietary and nothing is hidden behind a model.',
    field: radiant,
  },
  {
    name: 'append-only',
    tag: 'Append-only',
    title: 'Never restated',
    caption:
      'A published value is final. The store refuses UPDATE and DELETE outright, so a number that has ' +
      'been cited cannot quietly become a different number later.',
    field: strata,
  },
  {
    name: 'versioned',
    tag: 'Versioned',
    title: 'Changes fork',
    caption:
      'Any change to inputs, weights or anchors creates a new version alongside the old one. ' +
      'Corrections are new observations, never edits, and every version stays live forever.',
    field: lattice,
  },
];

/** Ink colours, matching the page's --blue in each theme. */
export const INKS = { light: [0x1f, 0x1f, 0xe6], dark: [0x7b, 0x7b, 0xff] };

/**
 * Renders one plate to PNG bytes: solid ink where the dithered field is on,
 * fully transparent everywhere else.
 */
export function renderPlate(field, ink = INKS.light, width = 620, height = 400) {
  const [r, g, b] = ink;
  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const v = clamp01(field((px + 0.5) / width, (py + 0.5) / height));
      const threshold = (BAYER8[py & 7][px & 7] + 0.5) / 64;
      if (v > threshold) {
        const i = (py * width + px) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(width, height, rgba);
}
