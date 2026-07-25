/**
 * APCCI v1.0.0 — FROZEN.
 *
 * These anchors were set from named historical episodes and approximate
 * medians. They were never fitted to the realised distribution of the inputs.
 * That is a known weakness (see docs/APCCI_METHODOLOGY.md §4) and it is the
 * reason v1.1.0 exists.
 *
 * DO NOT EDIT ANY NUMBER IN THIS FILE. Values published under 1.0.0 are final.
 * Editing an anchor here would silently change the meaning of every value ever
 * published under this version. If the mapping needs to change, add a version.
 */

/**
 * Each anchor table maps an input reading to a 0-100 subscore by
 * piecewise-linear interpolation, clamped at both ends.
 * 0 = loosest credit conditions in the reference episodes, 100 = tightest.
 */
export const ANCHORS = Object.freeze({
  // 2.33 = 2007-05 cycle low; 21.82 = 2008-12-16 peak.
  hy_oas: Object.freeze([
    [2.33, 0], [3.5, 20], [4.5, 40], [6.0, 60], [10.0, 80], [21.82, 100],
  ]),
  // 4.00 = mid-2007 low; 44.00 ~ 2008-12 peak.
  ccc_oas: Object.freeze([
    [4.0, 0], [6.5, 20], [9.0, 40], [13.0, 60], [20.0, 80], [44.0, 100],
  ]),
  // 0.51 = 2007-02 low; 6.18 = 2008-12 peak.
  ig_oas: Object.freeze([
    [0.51, 0], [0.9, 20], [1.3, 40], [1.8, 60], [3.0, 80], [6.18, 100],
  ]),
  // NFCI is constructed to average ~0; 3.5 ~ 2008-10 peak.
  nfci: Object.freeze([
    [-1.0, 0], [-0.6, 20], [0.0, 40], [0.5, 60], [1.5, 80], [3.5, 100],
  ]),
  // 9.14 = 2017-11 record low close; 82.69 = 2020-03-16 record close.
  vix: Object.freeze([
    [9.14, 0], [13.0, 20], [17.5, 40], [24.0, 60], [40.0, 80], [82.69, 100],
  ]),
});

/** Weights sum to exactly 1. Verified at load and by scripts/verify.mjs. */
export const WEIGHTS = Object.freeze({
  hy_oas: 0.3,
  ccc_oas: 0.2,
  ig_oas: 0.2,
  nfci: 0.2,
  vix: 0.1,
});

export const SPEC = Object.freeze({
  version: '1.0.0',
  status: 'published',
  anchor_basis: 'named historical episodes and approximate medians',
  calibrated: false,
  anchors: ANCHORS,
  weights: WEIGHTS,
});
