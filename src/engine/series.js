/**
 * The five FRED inputs to APCCI. This list is identical for every index
 * version; a change here is a new index, not a new version.
 *
 * `unit` is the unit FRED publishes the series in. `maxStaleDays` is how old
 * an observation may be relative to the observation date before the input
 * counts as missing (NFCI is weekly, the rest are daily business-day series).
 * `plausible` bounds reject transcription errors and bad vintages; an input
 * outside its bound is treated as missing, and a missing input publishes
 * nothing.
 */
export const SERIES = [
  {
    id: 'BAMLH0A0HYM2',
    key: 'hy_oas',
    label: 'ICE BofA US High Yield OAS',
    unit: 'percent',
    maxStaleDays: 5,
    plausible: [0.5, 30],
  },
  {
    id: 'BAMLH0A3HYC',
    key: 'ccc_oas',
    label: 'ICE BofA US CCC & Lower OAS',
    unit: 'percent',
    maxStaleDays: 5,
    plausible: [1, 60],
  },
  {
    id: 'BAMLC0A0CM',
    key: 'ig_oas',
    label: 'ICE BofA US Corporate OAS',
    unit: 'percent',
    maxStaleDays: 5,
    plausible: [0.2, 12],
  },
  {
    id: 'NFCI',
    key: 'nfci',
    label: 'Chicago Fed National Financial Conditions Index',
    unit: 'index',
    maxStaleDays: 10,
    plausible: [-3, 6],
  },
  {
    id: 'VIXCLS',
    key: 'vix',
    label: 'CBOE Volatility Index (VIX), close',
    unit: 'index',
    maxStaleDays: 5,
    plausible: [5, 100],
  },
];

export const SERIES_BY_KEY = Object.fromEntries(SERIES.map((s) => [s.key, s]));
export const SERIES_IDS = SERIES.map((s) => s.id);

/** Every input is oriented so that a higher reading means tighter credit. */
export const ORIENTATION = 'higher = tighter credit';
