/**
 * Procedural 1-bit illustrations: gothic stone, in the dithered-engraving idiom.
 *
 * Each plate is a scene built from signed distance fields — capsules, discs,
 * boxes, blended with a smooth minimum so the joins read as carved stone rather
 * than assembled primitives. The SDF gives both the silhouette and, through its
 * gradient, a surface normal to light from the upper left. The resulting
 * continuous tone is then reduced to pure on/off ink by an 8x8 Bayer threshold,
 * which is what produces the ordered cross-hatch texture rather than the mushy
 * look of error diffusion at this size.
 *
 * The subjects answer the captions: the seated chimera examines, the waterspout
 * is fixed in stone while water passes through it, the twin spires fork from one
 * base. Nothing here is a data visualisation — the chart is the data; these are
 * ornament, and are marked aria-hidden in the page.
 *
 * Each plate is emitted twice, once in the light theme's ink and once in the
 * dark theme's, and the page swaps them with <picture> + prefers-color-scheme.
 * The obvious alternative — one alpha-only plate used as a CSS mask over
 * `var(--blue)` — is prettier in source but silently fails when the page is
 * opened from file://, where Chromium refuses to load mask images. This page
 * has to work from a plain checkout, so it uses two real images.
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

const WIDTH = 620;
const HEIGHT = 400;
const ASPECT = WIDTH / HEIGHT;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * clamp01(t);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- SDF toolkit
// Scenes work in centred coordinates: y spans [-0.5, 0.5], x spans +/-ASPECT/2,
// so one unit is one plate height and shapes stay circular.

const len = (x, y) => Math.hypot(x, y);

function sdDisc(px, py, cx, cy, r) {
  return len(px - cx, py - cy) - r;
}

/** Capsule: a segment of radius r0 at a, tapering to r1 at b. */
function sdCapsule(px, py, ax, ay, bx, by, r0, r1 = r0) {
  const dx = bx - ax;
  const dy = by - ay;
  const dd = dx * dx + dy * dy;
  let t = dd === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / dd;
  t = clamp01(t);
  return len(px - ax - dx * t, py - ay - dy * t) - (r0 + (r1 - r0) * t);
}

function sdBox(px, py, cx, cy, hw, hh, r = 0) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Polynomial smooth minimum — blends shapes into one carved mass. */
function smin(a, b, k) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
}

const un = (a, b) => Math.min(a, b);
const sub = (a, b) => Math.max(a, -b);

function rotX(px, py, cx, cy, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return (px - cx) * c - (py - cy) * s;
}
function rotY(px, py, cx, cy, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return (px - cx) * s + (py - cy) * c;
}

// ------------------------------------------------------------------- scene 1
/**
 * A seated chimera: hunched forward on a parapet, chin resting on its hands,
 * horned, with folded wings rising behind the shoulders.
 */
function chimeraSdf(px, py) {
  // Torso: heavy mass leaning forward.
  let body = sdDisc(px, py, 0.0, 0.1, 0.155);
  body = smin(body, sdDisc(px, py, 0.03, 0.2, 0.14), 0.07);

  // Thighs drawn up, knees to the right.
  body = smin(body, sdCapsule(px, py, -0.01, 0.235, 0.175, 0.225, 0.078, 0.06), 0.05);
  // Shins dropping to the ledge.
  body = smin(body, sdCapsule(px, py, 0.175, 0.235, 0.165, 0.35, 0.055, 0.045), 0.04);

  // Upper arms from shoulder down to elbows resting on the knees.
  body = smin(body, sdCapsule(px, py, 0.02, 0.02, 0.115, 0.2, 0.055, 0.045), 0.05);
  // Forearms rising to the face.
  body = smin(body, sdCapsule(px, py, 0.115, 0.2, 0.105, 0.02, 0.045, 0.04), 0.04);

  // Head, tilted, with a blunt muzzle and a heavy brow.
  let head = sdDisc(px, py, 0.075, -0.13, 0.105);
  head = smin(head, sdCapsule(px, py, 0.05, -0.1, -0.075, -0.05, 0.058, 0.038), 0.04);
  // Hands cupping the jaw.
  head = smin(head, sdDisc(px, py, 0.105, -0.03, 0.052), 0.045);
  head = smin(head, sdDisc(px, py, 0.02, -0.02, 0.045), 0.05);
  // Horns sweeping back.
  head = un(head, sdCapsule(px, py, 0.1, -0.21, 0.185, -0.35, 0.032, 0.006));
  head = un(head, sdCapsule(px, py, 0.03, -0.215, 0.04, -0.34, 0.028, 0.005));
  // Ear.
  head = smin(head, sdCapsule(px, py, 0.13, -0.14, 0.2, -0.175, 0.03, 0.012), 0.02);

  let fig = smin(body, head, 0.045);

  // Folded wings: a long leading spar with a webbed membrane behind it, plus
  // finger spars so the edge reads as feathered rather than as a blade.
  const wingRoot = [-0.02, -0.01];
  let wing = sdCapsule(px, py, wingRoot[0], wingRoot[1], -0.115, -0.44, 0.05, 0.016);
  wing = smin(wing, sdCapsule(px, py, -0.05, -0.07, -0.2, -0.33, 0.032, 0.01), 0.05);
  wing = smin(wing, sdCapsule(px, py, -0.03, -0.05, -0.035, -0.4, 0.03, 0.011), 0.05);
  // Membrane behind the spars.
  let web = sdCapsule(px, py, -0.03, -0.02, -0.115, -0.36, 0.082, 0.032);
  web = smin(web, sdCapsule(px, py, -0.05, -0.08, -0.17, -0.28, 0.065, 0.026), 0.06);
  wing = smin(wing, web, 0.03);

  // Scallop the trailing edge into feather tips.
  const scal = Math.sin((px * 3.1 + py * 8.4) * Math.PI * 2.6) * 0.012;
  wing += scal * smoothstep(-0.02, -0.2, py);

  // A second wing, further back and smaller, on the far shoulder.
  let wing2 = sdCapsule(px, py, 0.06, -0.02, 0.16, -0.38, 0.042, 0.013);
  wing2 = smin(wing2, sdCapsule(px, py, 0.07, -0.04, 0.21, -0.27, 0.048, 0.019), 0.05);

  fig = smin(fig, wing2, 0.035);
  fig = smin(fig, wing, 0.04);

  // Talons over the ledge lip.
  fig = smin(fig, sdCapsule(px, py, 0.155, 0.35, 0.215, 0.385, 0.035, 0.016), 0.03);
  fig = smin(fig, sdCapsule(px, py, -0.05, 0.3, -0.11, 0.375, 0.04, 0.018), 0.035);

  return fig;
}

function chimeraScene(px, py) {
  const ledgeTop = 0.355;
  const ledge = sdBox(px, py, 0, 0.5, 0.9, 0.5 - ledgeTop, 0.004);
  const fig = chimeraSdf(px, py);
  return { fig, ledge, ledgeTop };
}

// ------------------------------------------------------------------- scene 2
/**
 * A waterspout gargoyle cantilevered from a wall: shaggy neck, jaws open around
 * a spout, forelegs gripping the corbel below it.
 */
function spoutSdf(px, py) {
  // Rump and back. Kept short and deep — a long smooth taper reads as a fish,
  // so the masses are separated and the joins are tighter than elsewhere.
  let body = sdDisc(px, py, -0.33, 0.02, 0.145);
  body = smin(body, sdCapsule(px, py, -0.33, -0.015, 0.03, -0.03, 0.115, 0.095), 0.05);
  // Belly sagging between the legs.
  body = smin(body, sdDisc(px, py, -0.12, 0.085, 0.085), 0.06);

  // Shaggy coat: a strong irregular perturbation of the whole body radius.
  const mane =
    Math.sin(px * 30 + py * 6) * 0.015 +
    Math.sin(px * 57 + py * 15) * 0.009 +
    Math.sin(py * 41 - px * 11) * 0.007;
  body += mane * smoothstep(0.12, -0.2, px);

  // Neck, then a distinctly separate skull.
  let head = sdCapsule(px, py, 0.03, -0.03, 0.22, -0.055, 0.09, 0.072);
  head = smin(head, sdDisc(px, py, 0.27, -0.06, 0.082), 0.04);
  // Upper jaw lifted, lower jaw dropped: the gap between them is the mouth.
  head = smin(head, sdCapsule(px, py, 0.29, -0.095, 0.47, -0.115, 0.045, 0.02), 0.02);
  head = smin(head, sdCapsule(px, py, 0.29, 0.025, 0.44, 0.065, 0.04, 0.018), 0.02);
  // Brow, and ears swept back off the skull.
  head = smin(head, sdCapsule(px, py, 0.26, -0.115, 0.19, -0.15, 0.028, 0.015), 0.02);
  head = un(head, sdCapsule(px, py, 0.22, -0.11, 0.13, -0.235, 0.03, 0.007));
  head = un(head, sdCapsule(px, py, 0.28, -0.12, 0.25, -0.25, 0.026, 0.006));

  let fig = smin(body, head, 0.04);

  // Forelegs hanging below the body line and gripping the corbel — these are
  // what stop the silhouette reading as one solid mass.
  fig = smin(fig, sdCapsule(px, py, -0.26, 0.08, -0.29, 0.27, 0.052, 0.033), 0.035);
  fig = un(fig, sdCapsule(px, py, -0.29, 0.28, -0.185, 0.325, 0.033, 0.016));
  fig = smin(fig, sdCapsule(px, py, -0.08, 0.07, -0.115, 0.245, 0.046, 0.029), 0.035);
  fig = un(fig, sdCapsule(px, py, -0.115, 0.25, -0.02, 0.29, 0.029, 0.014));
  // Haunch tucked against the wall.
  fig = smin(fig, sdCapsule(px, py, -0.4, 0.07, -0.43, 0.25, 0.055, 0.036), 0.04);

  // Ridged spine running from the rump to the skull.
  const ridge = sdCapsule(px, py, -0.36, -0.09, 0.16, -0.115, 0.02, 0.013);
  const teeth = Math.abs(Math.sin(px * 46)) * 0.018;
  fig = smin(fig, ridge - teeth * 0.7, 0.018);

  // The lead spout carried in the jaws.
  fig = un(fig, sdCapsule(px, py, 0.44, -0.025, 0.63, -0.005, 0.031, 0.029));

  return fig;
}

function spoutScene(px, py) {
  const wallEdge = -0.44;
  const wall = px - wallEdge; // negative inside the wall
  // Stepped corbel carrying the figure.
  let corbel = sdBox(px, py, -0.53, 0.3, 0.24, 0.075, 0.006);
  corbel = un(corbel, sdBox(px, py, -0.56, 0.4, 0.28, 0.05, 0.006));
  return { fig: spoutSdf(px, py), wall, corbel };
}

// ------------------------------------------------------------------- scene 3
/**
 * Twin spires rising from one base — crocketed edges, lancet openings, a rose
 * window in the block below.
 */
function spire(px, py, ax, baseY, halfW, apexY, crocket) {
  // Tapered body: half-width grows linearly from the apex down to the base.
  const t = clamp01((py - apexY) / (baseY - apexY));
  const w = halfW * t;
  const dx = Math.abs(px - ax) - w;
  const dy = Math.max(apexY - py, py - baseY);
  let d = Math.max(dx, dy);
  // Crockets: regular barbs along both raking edges.
  if (crocket) {
    const step = 0.038;
    const barb = Math.abs(((py - apexY) % step) / step - 0.5) * 2;
    d -= (1 - barb) * 0.011 * smoothstep(0.02, 0.35, t);
  }
  return d;
}

function spiresScene(px, py) {
  // Left spire: taller, nearer.
  let a = spire(px, py, -0.2, 0.5, 0.115, -0.42, true);
  a = un(a, sdCapsule(px, py, -0.2, -0.42, -0.2, -0.49, 0.012, 0.003)); // finial
  // Right spire: shorter, set back.
  let b = spire(px, py, 0.22, 0.5, 0.095, -0.28, true);
  b = un(b, sdCapsule(px, py, 0.22, -0.28, 0.22, -0.35, 0.01, 0.003));

  // Pinnacles clustered at the shoulders.
  let pin = spire(px, py, -0.35, 0.42, 0.032, -0.12, false);
  pin = un(pin, spire(px, py, -0.05, 0.42, 0.03, -0.16, false));
  pin = un(pin, spire(px, py, 0.07, 0.44, 0.026, -0.05, false));
  pin = un(pin, spire(px, py, 0.38, 0.44, 0.028, -0.06, false));
  pin = un(pin, spire(px, py, 0.52, 0.46, 0.024, 0.04, false));
  pin = un(pin, spire(px, py, -0.5, 0.46, 0.026, 0.02, false));

  let mass = un(un(a, b), pin);
  // Block below, tying the towers into one base.
  mass = un(mass, sdBox(px, py, 0, 0.46, 0.62, 0.22, 0.01));

  // Lancet openings: tall slots with pointed heads, cut out of the towers.
  const lancet = (cx, cy, hw, hh) =>
    Math.max(
      sdBox(px, py, cx, cy, hw, hh, 0.004),
      -Math.max(Math.abs(px - cx) - hw * 1.4, py - (cy - hh) + hw * 1.4),
    );
  let holes = lancet(-0.2, 0.13, 0.028, 0.075);
  holes = un(holes, lancet(-0.2, 0.3, 0.03, 0.06));
  holes = un(holes, lancet(0.22, 0.2, 0.024, 0.06));
  holes = un(holes, lancet(0.22, 0.34, 0.026, 0.05));
  holes = un(holes, lancet(-0.42, 0.36, 0.022, 0.05));
  holes = un(holes, lancet(0.44, 0.37, 0.02, 0.045));
  // Rose window.
  holes = un(holes, sdDisc(px, py, 0.01, 0.4, 0.055));

  return { mass: sub(mass, holes), rose: sdDisc(px, py, 0.01, 0.4, 0.055) };
}

// ------------------------------------------------------------------- shading

const LX = -0.55;
const LY = -0.835; // light from the upper left

/** Approximate outward normal from the SDF gradient. */
function normalOf(sdf, px, py) {
  const e = 0.0035;
  const gx = sdf(px + e, py) - sdf(px - e, py);
  const gy = sdf(px, py + e) - sdf(px, py - e);
  const m = len(gx, gy) || 1;
  return [gx / m, gy / m];
}

/**
 * Lit stone: bright where the surface turns toward the light, darker in the
 * turn away, with the edge darkened so the form reads against the ground.
 */
function stoneInk(sdf, px, py, d, { flat = 0.34, ambient = 0.3 } = {}) {
  const [nx, ny] = normalOf(sdf, px, py);
  const lambert = clamp01(0.5 + 0.5 * (nx * LX + ny * LY));
  // Interior flattens out away from the silhouette edge.
  const core = smoothstep(0, flat, -d);
  const lum = mix(mix(0.1, 1.0, lambert), mix(0.26, 0.94, lambert), core);
  // Grain, so large flat areas still carry texture once dithered.
  const grain = Math.sin(px * 190 + py * 70) * 0.014 + Math.sin(py * 240) * 0.012;
  return clamp01(1 - lum + grain);
}

/** Ink for the silhouette edge itself. */
const edgeInk = (d, w = 0.005) => smoothstep(w, 0, Math.abs(d));

function skyInk(px, py) {
  // Faint gradient, lighter toward the horizon, with a hint of cloud banding.
  const base = 0.032 - smoothstep(-0.5, 0.45, py) * 0.022;
  const band = Math.sin(py * 15 + Math.sin(px * 3.4) * 1.6) * 0.012;
  return clamp01(base + band);
}

function masonryInk(px, py, tone) {
  // Ashlar coursing: horizontal joints, staggered verticals.
  const course = 0.085;
  const row = Math.floor((py + 0.5) / course);
  const jy = Math.abs(((py + 0.5) % course) / course - 0.5) * 2;
  const off = row % 2 ? 0.11 : 0;
  const jx = Math.abs((((px + off + 2) % 0.22) / 0.22) - 0.5) * 2;
  const joint = Math.max(smoothstep(0.86, 1, jy), smoothstep(0.94, 1, jx));
  const mottle = Math.sin(px * 51 + row * 9) * 0.018 + Math.sin(py * 83) * 0.014;
  return clamp01(tone + joint * 0.3 + mottle);
}

// -------------------------------------------------------------------- plates

// Each scene is drawn in its own units and then magnified into the frame, so
// the shape constants above stay readable instead of being pre-multiplied.
const CHIMERA = { s: 1.14, dy: 0.01 };

function fieldChimera(rawX, rawY) {
  const px = rawX / CHIMERA.s;
  const py = (rawY - CHIMERA.dy) / CHIMERA.s;
  const sdf = (a, b) => chimeraSdf(a / CHIMERA.s, (b - CHIMERA.dy) / CHIMERA.s);
  const { fig, ledge, ledgeTop } = chimeraScene(px, py);

  let ink;
  if (fig < 0) {
    ink = stoneInk(sdf, rawX, rawY, fig * CHIMERA.s);
  } else if (ledge < 0) {
    // Parapet: flat stone with coursing, darker under the figure.
    ink = masonryInk(px, py, 0.24 + smoothstep(0.5, 0.36, py) * 0.05);
    ink += smoothstep(0.09, 0, fig) * 0.32; // contact shadow
  } else {
    ink = skyInk(px, py);
    ink += smoothstep(0.05, 0, fig) * 0.3; // halo of shadow around the figure
  }
  ink = Math.max(ink, edgeInk(fig * CHIMERA.s, 0.0045));
  if (py > ledgeTop - 0.005 && py < ledgeTop + 0.005) ink = Math.max(ink, 0.85);
  return clamp01(ink);
}

const SPOUT = { s: 1.2, dy: 0.02 };

function fieldSpout(rawX, rawY) {
  const px = rawX / SPOUT.s;
  const py = (rawY - SPOUT.dy) / SPOUT.s;
  const sdf = (a, b) => spoutSdf(a / SPOUT.s, (b - SPOUT.dy) / SPOUT.s);
  const { fig, wall, corbel } = spoutScene(px, py);

  let ink;
  if (fig < 0) {
    ink = stoneInk(sdf, rawX, rawY, fig * SPOUT.s, { flat: 0.22 });
  } else if (corbel < 0) {
    ink = masonryInk(px, py, 0.32);
    ink = Math.max(ink, edgeInk(corbel, 0.004));
  } else if (wall < 0) {
    ink = masonryInk(px, py, 0.09);
  } else {
    // Shade beyond the wall face, so the figure reads as projecting from it.
    ink = 0.22 + Math.sin(py * 22 + px * 4) * 0.012;
    ink += smoothstep(0.07, 0, fig) * 0.22;
  }
  ink = Math.max(ink, edgeInk(fig * SPOUT.s, 0.0045));
  ink = Math.max(ink, edgeInk(wall * SPOUT.s, 0.004) * 0.9);
  return clamp01(ink);
}

const SPIRES = { s: 1.05, dy: 0.04 };

function fieldSpires(rawX, rawY) {
  const px = rawX / SPIRES.s;
  const py = (rawY - SPIRES.dy) / SPIRES.s;
  const sdf = (a, b) => spiresScene(a / SPIRES.s, (b - SPIRES.dy) / SPIRES.s).mass;
  const { mass, rose } = spiresScene(px, py);
  let ink;
  if (mass < 0) {
    ink = stoneInk(sdf, rawX, rawY, mass * SPIRES.s, { flat: 0.06 });
    // Vertical shafts, the dominant texture of a gothic tower.
    ink += (0.5 + 0.5 * Math.sin(px * 260)) * 0.14;
  } else {
    ink = skyInk(px, py) * 0.8;
    if (rose < 0) ink = 0.1; // window openings read as sky
  }
  ink = Math.max(ink, edgeInk(mass * SPIRES.s, 0.004));
  return clamp01(ink);
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
    field: fieldChimera,
  },
  {
    name: 'append-only',
    tag: 'Append-only',
    title: 'Never restated',
    caption:
      'A published value is final. The store refuses UPDATE and DELETE outright, so a number that has ' +
      'been cited cannot quietly become a different number later.',
    field: fieldSpout,
  },
  {
    name: 'versioned',
    tag: 'Versioned',
    title: 'Changes fork',
    caption:
      'Any change to inputs, weights or anchors creates a new version alongside the old one. ' +
      'Corrections are new observations, never edits, and every version stays live forever.',
    field: fieldSpires,
  },
];

/** Ink colours, matching the page's --blue in each theme. */
export const INKS = { light: [0x1f, 0x1f, 0xe6], dark: [0x7b, 0x7b, 0xff] };

/**
 * Deterministic per-pixel noise in [0,1). Used to jitter the dither threshold:
 * a pure Bayer grid is perfectly periodic, and when the browser scales the
 * plate down to its CSS size that period beats against the resample grid and
 * turns the artwork into blotches. Jittering breaks the periodicity while
 * keeping the ordered structure that gives the engraving its texture.
 */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Renders one plate to PNG bytes: solid ink where the dithered field is on,
 * fully transparent everywhere else.
 */
/**
 * Dot size, in pixels. The plate is displayed at roughly half its pixel width,
 * and a one-pixel dither cell at that scale beats against the browser's
 * resample grid into coarse blotches. Dithering in 2x2 blocks halves the
 * pattern's frequency so it survives the downscale — and the chunkier dot is
 * closer to a real halftone plate anyway.
 */
const DOT = 2;

export function renderPlate(field, ink = INKS.light, width = WIDTH, height = HEIGHT) {
  const [r, g, b] = ink;
  const rgba = new Uint8Array(width * height * 4);
  for (let by = 0; by < height; by += DOT) {
    // Sample the tone at the centre of the block, not per pixel, so every
    // pixel in a block agrees and the dot stays solid.
    const py = (by + DOT / 2) / height - 0.5;
    for (let bx = 0; bx < width; bx += DOT) {
      const px = ((bx + DOT / 2) / width - 0.5) * ASPECT;
      const v = clamp01(field(px, py));
      // Jitter scales up where the tone is near the extremes: sparse ordered
      // dither is where a regular lattice aliases worst, so those regions get
      // pushed toward blue noise while midtones keep their ordered cross-hatch.
      const cx = bx / DOT;
      const cy = by / DOT;
      const extreme = 1 - 4 * v * (1 - v);
      const amp = 2 + 22 * extreme * extreme;
      const threshold = (BAYER8[cy & 7][cx & 7] + 0.5 + (hash2(cx, cy) - 0.5) * amp) / 64;
      if (v <= threshold) continue;
      for (let dy = 0; dy < DOT && by + dy < height; dy++) {
        for (let dx = 0; dx < DOT && bx + dx < width; dx++) {
          const i = ((by + dy) * width + bx + dx) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(width, height, rgba);
}
