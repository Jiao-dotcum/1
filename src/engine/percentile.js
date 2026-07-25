/**
 * Percentile estimation used by the v1.1.0 calibration.
 *
 * Type 7 (the R and NumPy default): with the sample sorted ascending and
 * n observations, the p-th percentile sits at index h = (n-1) * p/100, linearly
 * interpolated between the two neighbouring order statistics. Documented in
 * docs/APCCI_METHODOLOGY.md §5 so a third party can reproduce the anchors
 * exactly rather than approximately.
 */

/** @param {number[]} sorted ascending, non-empty @param {number} p in [0,100] */
export function quantileType7(sorted, p) {
  const n = sorted.length;
  if (n === 0) throw new Error('quantileType7: empty sample');
  if (n === 1) return sorted[0];
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h);
  const frac = h - lo;
  if (lo >= n - 1) return sorted[n - 1];
  return sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

/**
 * Builds piecewise-linear anchor knots `[reading, percentile]` from a sample.
 *
 * Where consecutive grid points land on the same reading (a plateau in the
 * data), only the highest percentile for that reading is kept. That keeps the
 * knot list strictly increasing in the reading — required for unambiguous
 * interpolation — and means a reading on a plateau scores as "at or below this
 * reading", the standard percentile-rank convention.
 */
export function anchorsFromSample(sample, grid) {
  const sorted = [...sample].sort((a, b) => a - b);
  const knots = grid.map((p) => [quantileType7(sorted, p), p]);
  const out = [];
  for (const [x, y] of knots) {
    if (out.length && out[out.length - 1][0] === x) out[out.length - 1][1] = y;
    else out.push([x, y]);
  }
  return out;
}
