/**
 * AP Credit Cycle Index (APCCI) — the computation.
 *
 * The index maps five FRED inputs onto a 0-100 scale where 0 is the loosest
 * credit conditions on the reference scale and 100 the tightest, then takes a
 * fixed weighted average. It measures CONDITIONS, not returns; nothing here
 * forecasts or implies performance.
 *
 * Two rules govern this file:
 *   1. Every published value must be reproducible by hand from FRED plus
 *      docs/APCCI_METHODOLOGY.md. So the arithmetic is defined down to the
 *      rounding: subscores round to 2dp, contributions round to 2dp, and the
 *      index is the sum of the rounded contributions. The component table on
 *      the public page adds up exactly to the published number.
 *   2. An incomplete or implausible input set publishes NOTHING. computeIndex
 *      returns {ok:false, reasons} rather than a partial value, and callers
 *      must not coerce that into a number.
 */
import { SERIES, SERIES_BY_KEY } from './series.js';
import { SPEC as SPEC_1_0_0 } from './specs/v1_0_0.js';
import { getSpec as getSpec_1_1_0 } from './specs/v1_1_0.js';

export const TICKER = 'APCCI';

/** The version new observations are published under by default. */
export const INDEX_VERSION = '1.1.0';

/** Every version that has ever existed. Published versions are never removed. */
export const VERSIONS = ['1.0.0', '1.1.0'];

export const BANDS = Object.freeze([
  { name: 'Benign', min: 0, max: 20 },
  { name: 'Normal', min: 20, max: 40 },
  { name: 'Watch', min: 40, max: 60 },
  { name: 'Stress', min: 60, max: 80 },
  { name: 'Crisis', min: 80, max: 100 },
]);

/** Returns the spec for a version. Throws on an unknown version. */
export function getSpec(version = INDEX_VERSION, opts) {
  if (version === '1.0.0') return SPEC_1_0_0;
  if (version === '1.1.0') return getSpec_1_1_0(opts);
  throw new Error(`unknown APCCI version: ${version}`);
}

/** Half-away-from-zero rounding to `dp` decimals, so results do not depend on
 *  the sign convention of Math.round. */
export function round(x, dp) {
  const f = 10 ** dp;
  const scaled = x * f;
  // Nudge past float representation error (e.g. 2.675*100 === 267.49999...).
  const corrected = Number(scaled.toPrecision(15));
  return (corrected < 0 ? -Math.round(-corrected) : Math.round(corrected)) / f;
}

/**
 * Piecewise-linear interpolation through `[reading, subscore]` knots, clamped
 * at both ends. Knots must be sorted ascending by reading.
 */
export function interpolate(anchors, x) {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1];
      if (x1 === x0) return y1;
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * The two anchor knots a reading falls between, or null when the reading is
 * clamped at either end of the table. The public page shows this so a reader
 * can redo the interpolation by hand instead of trusting the subscore.
 */
export function bracketFor(anchors, x) {
  if (x <= anchors[0][0] || x >= anchors[anchors.length - 1][0]) return null;
  for (let i = 1; i < anchors.length; i++) {
    if (x <= anchors[i][0]) return [anchors[i - 1], anchors[i]];
  }
  return null;
}

/** The band a value falls in. The top band includes 100. */
export function bandOf(value) {
  if (!Number.isFinite(value)) return null;
  const v = Math.min(100, Math.max(0, value));
  for (const b of BANDS) {
    if (v >= b.min && (v < b.max || b.max === 100)) return b.name;
  }
  return null;
}

function daysBetween(aIso, bIso) {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Screens one input. Returns a reason string when the input may not be used.
 * A stale, missing, non-finite or out-of-bounds reading is disqualifying —
 * there is no "best effort" path.
 */
function screen(series, input, obsDate) {
  if (input == null) return `${series.id}: missing`;
  const { value, date } = input;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${series.id}: non-numeric value (${JSON.stringify(value)})`;
  }
  const [lo, hi] = series.plausible;
  if (value < lo || value > hi) {
    return `${series.id}: ${value} outside plausible range [${lo}, ${hi}]`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    return `${series.id}: missing or malformed observation date`;
  }
  if (obsDate) {
    const age = daysBetween(date, obsDate);
    if (age < 0) return `${series.id}: observation dated ${date} is after ${obsDate}`;
    if (age > series.maxStaleDays) {
      return `${series.id}: last observation ${date} is ${age}d stale at ${obsDate} (max ${series.maxStaleDays}d)`;
    }
  }
  return null;
}

/**
 * Computes an index value.
 *
 * @param {Record<string, {value:number, date:string}>} inputs keyed by series key
 * @param {{version?:string, obsDate?:string}} opts
 * @returns {{ok:true, ...}|{ok:false, reasons:string[]}}
 */
export function computeIndex(inputs, opts = {}) {
  const version = opts.version ?? INDEX_VERSION;
  const obsDate = opts.obsDate ?? null;
  const spec = getSpec(version);

  if (!spec.anchors) {
    return {
      ok: false,
      version,
      reasons: [`APCCI ${version} is not calibrated: ${spec.note ?? 'no anchors'}`],
    };
  }

  const reasons = [];
  for (const s of SERIES) {
    const r = screen(s, inputs?.[s.key], obsDate);
    if (r) reasons.push(r);
  }
  if (reasons.length) return { ok: false, version, reasons };

  const components = SERIES.map((s) => {
    const { value, date } = inputs[s.key];
    const weight = spec.weights[s.key];
    const subscore = round(interpolate(spec.anchors[s.key], value), 2);
    return {
      key: s.key,
      fred_id: s.id,
      label: s.label,
      unit: s.unit,
      observation: value,
      observation_date: date,
      weight,
      subscore,
      contribution: round(weight * subscore, 2),
    };
  });

  // The published value is the sum of the rounded contributions, so the
  // component table on the public page adds up exactly.
  const value = round(
    components.reduce((acc, c) => acc + c.contribution, 0),
    2,
  );

  return {
    ok: true,
    ticker: TICKER,
    version,
    obs_date: obsDate,
    value,
    band: bandOf(value),
    components,
  };
}

/** Convenience for callers that only have raw numbers and a single date. */
export function inputsFromReadings(readings, date) {
  return Object.fromEntries(
    Object.keys(SERIES_BY_KEY)
      .filter((k) => readings[k] !== undefined)
      .map((k) => [k, { value: readings[k], date }]),
  );
}
