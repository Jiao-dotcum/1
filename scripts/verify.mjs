#!/usr/bin/env node
/**
 * Verifies the invariants APCCI promises. Every hard rule in the project is
 * represented here as a check that can fail:
 *
 *   - weights sum to 1, anchors are well formed and monotone
 *   - the frozen v1.0.0 mapping still produces its documented values
 *   - every published value still equals what its own components imply, which
 *     is what catches an edit to a "frozen" anchor table
 *   - incomplete, stale and implausible inputs publish nothing
 *   - the store physically refuses UPDATE and DELETE
 *   - the calibration artifact is internally consistent and not synthetic
 *   - exports agree with the database
 *   - the no-performance-claim disclaimer is present in every public surface
 *
 * Exit code 0 means all checks passed.
 */
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  computeIndex, getSpec, bandOf, round, interpolate, bracketFor,
  VERSIONS, INDEX_VERSION, TICKER, BANDS,
} from '../src/engine/creditIndex.js';
import { SERIES } from '../src/engine/series.js';
import { anchorsFromSample, quantileType7 } from '../src/engine/percentile.js';
import { parseSeriesCsv } from '../src/data/fred.js';
import { openDb, insertValue, getAll, getPublishedVersions, DB_PATH } from '../src/store/indexValues.js';
import { respond, DISCLAIMER } from '../api/index-value.js';
import { ARTIFACT_PATH } from '../src/engine/specs/v1_1_0.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail: detail ?? '' });
  } catch (err) {
    results.push({ ok: false, name, detail: err.message });
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${a}, want ${b})`);

// ---------------------------------------------------------------- spec shape

check('weights sum to exactly 1 in every version', () => {
  for (const v of VERSIONS) {
    const w = getSpec(v).weights;
    eq(Object.keys(w).length, SERIES.length, `${v}: weight count`);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1) < 1e-12, `${v}: weights sum to ${sum}`);
    for (const s of SERIES) assert(w[s.key] > 0, `${v}: missing weight for ${s.key}`);
  }
  return `${VERSIONS.length} versions`;
});

check('anchor tables are well formed and monotone', () => {
  let tables = 0;
  for (const v of VERSIONS) {
    const { anchors } = getSpec(v);
    if (!anchors) continue;
    for (const s of SERIES) {
      const t = anchors[s.key];
      assert(Array.isArray(t) && t.length >= 2, `${v}/${s.key}: needs >= 2 knots`);
      for (let i = 1; i < t.length; i++) {
        assert(t[i][0] > t[i - 1][0], `${v}/${s.key}: readings not strictly increasing at knot ${i}`);
        assert(t[i][1] >= t[i - 1][1], `${v}/${s.key}: subscores decrease at knot ${i}`);
      }
      for (const [, y] of t) assert(y >= 0 && y <= 100, `${v}/${s.key}: subscore outside 0-100`);
      tables++;
    }
  }
  return `${tables} tables`;
});

check('bands tile 0-100 with no gap or overlap', () => {
  eq(BANDS[0].min, 0, 'first band starts at 0');
  eq(BANDS[BANDS.length - 1].max, 100, 'last band ends at 100');
  for (let i = 1; i < BANDS.length; i++) {
    eq(BANDS[i].min, BANDS[i - 1].max, `band ${i} does not abut the previous`);
  }
  eq(bandOf(0), 'Benign', 'bandOf(0)');
  eq(bandOf(19.99), 'Benign', 'bandOf(19.99)');
  eq(bandOf(20), 'Normal', 'bandOf(20)');
  eq(bandOf(59.99), 'Watch', 'bandOf(59.99)');
  eq(bandOf(80), 'Crisis', 'bandOf(80)');
  eq(bandOf(100), 'Crisis', 'bandOf(100)');
  return `${BANDS.length} bands`;
});

// ------------------------------------------------------- the frozen mapping

/** Readings that sit exactly on the documented v1.0.0 knots. */
const V100_KNOT_CASES = [
  { readings: { hy_oas: 2.33, ccc_oas: 4.0, ig_oas: 0.51, nfci: -1.0, vix: 9.14 }, value: 0, band: 'Benign' },
  { readings: { hy_oas: 4.5, ccc_oas: 9.0, ig_oas: 1.3, nfci: 0.0, vix: 17.5 }, value: 40, band: 'Watch' },
  { readings: { hy_oas: 10.0, ccc_oas: 20.0, ig_oas: 3.0, nfci: 1.5, vix: 40.0 }, value: 80, band: 'Crisis' },
  { readings: { hy_oas: 21.82, ccc_oas: 44.0, ig_oas: 6.18, nfci: 3.5, vix: 82.69 }, value: 100, band: 'Crisis' },
];

check('v1.0.0 reproduces its documented values (anchors unedited)', () => {
  for (const c of V100_KNOT_CASES) {
    const inputs = Object.fromEntries(
      Object.entries(c.readings).map(([k, v]) => [k, { value: v, date: '2020-03-16' }]),
    );
    const r = computeIndex(inputs, { version: '1.0.0', obsDate: '2020-03-16' });
    assert(r.ok, `expected a value, got: ${r.reasons?.join('; ')}`);
    eq(r.value, c.value, `value for ${JSON.stringify(c.readings)}`);
    eq(r.band, c.band, 'band');
    const sum = round(r.components.reduce((a, x) => a + x.contribution, 0), 2);
    eq(sum, r.value, 'contributions must sum to the published value');
  }
  return `${V100_KNOT_CASES.length} golden cases`;
});

check('interpolation is linear between knots and clamped outside', () => {
  const t = getSpec('1.0.0').anchors.hy_oas;
  eq(interpolate(t, 5.25), 50, 'midpoint of 4.50->40 and 6.00->60');
  eq(interpolate(t, 1.0), 0, 'below first knot clamps to 0');
  eq(interpolate(t, 99), 100, 'above last knot clamps to 100');
  eq(bracketFor(t, 1.0), null, 'clamped low reading has no bracket');
  eq(bracketFor(t, 99), null, 'clamped high reading has no bracket');
  const br = bracketFor(t, 5.25);
  eq(br[0][1], 40, 'lower knot subscore');
  eq(br[1][1], 60, 'upper knot subscore');
  return 'ok';
});

check('rounding is half-away-from-zero and float-stable', () => {
  eq(round(2.675, 2), 2.68, 'classic float case');
  eq(round(0.5, 0), 1, 'half up');
  eq(round(-0.5, 0), -1, 'half away from zero');
  eq(round(1.005, 2), 1.01, '1.005');
  return 'ok';
});

// ------------------------------------------------- publish-nothing gating

check('incomplete, stale and implausible inputs publish nothing', () => {
  const good = { value: 5.0, date: '2026-07-24' };
  const base = Object.fromEntries(SERIES.map((s) => [s.key, { ...good }]));
  base.hy_oas = { value: 5.0, date: '2026-07-24' };
  base.ccc_oas = { value: 9.0, date: '2026-07-24' };
  base.ig_oas = { value: 1.3, date: '2026-07-24' };
  base.nfci = { value: 0.2, date: '2026-07-24' };
  base.vix = { value: 18.0, date: '2026-07-24' };
  const opts = { version: '1.0.0', obsDate: '2026-07-24' };

  assert(computeIndex(base, opts).ok, 'the control case should compute');

  const missing = { ...base };
  delete missing.vix;
  assert(!computeIndex(missing, opts).ok, 'a missing input must publish nothing');

  assert(
    !computeIndex({ ...base, nfci: { value: 0.2, date: '2026-06-01' } }, opts).ok,
    'a stale input must publish nothing',
  );
  assert(
    !computeIndex({ ...base, hy_oas: { value: 450, date: '2026-07-24' } }, opts).ok,
    'an implausible input (bp instead of pct) must publish nothing',
  );
  assert(
    !computeIndex({ ...base, vix: { value: NaN, date: '2026-07-24' } }, opts).ok,
    'a non-finite input must publish nothing',
  );
  assert(
    !computeIndex({ ...base, vix: { value: 18, date: '2026-07-30' } }, opts).ok,
    'an input dated after the observation date must publish nothing',
  );
  const partial = computeIndex(missing, opts);
  assert(partial.value === undefined, 'a refusal must not carry a value');
  return '6 refusal cases';
});

check('an uncalibrated version refuses rather than falling back', () => {
  const spec = getSpec('1.1.0');
  if (spec.anchors) return 'skipped: 1.1.0 is calibrated';
  const inputs = Object.fromEntries(
    SERIES.map((s) => [s.key, { value: s.key === 'nfci' ? 0.2 : 5, date: '2026-07-24' }]),
  );
  const r = computeIndex(inputs, { version: '1.1.0', obsDate: '2026-07-24' });
  assert(!r.ok, 'uncalibrated 1.1.0 must not compute a value');
  assert(/not calibrated/i.test(r.reasons.join(' ')), 'the reason must say so');
  assert(
    JSON.stringify(spec.weights) === JSON.stringify(getSpec('1.0.0').weights),
    'weights are shared across versions by design',
  );
  return 'refuses correctly';
});

// -------------------------------------------------------- percentile method

check('type-7 quantiles match known values', () => {
  const s = [1, 2, 3, 4];
  eq(quantileType7(s, 0), 1, 'p0');
  eq(quantileType7(s, 100), 4, 'p100');
  eq(quantileType7(s, 50), 2.5, 'p50');
  eq(quantileType7([1, 2, 3, 4, 5], 50), 3, 'odd-length p50');
  eq(quantileType7(s, 25), 1.75, 'p25');
  const a = anchorsFromSample([5, 5, 5, 5], [0, 50, 100]);
  eq(a.length, 1, 'a degenerate sample collapses to one knot');
  eq(a[0][1], 100, 'and keeps the highest percentile');
  return 'ok';
});

// ------------------------------------------------------------ the store

check('the store physically refuses UPDATE and DELETE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apcci-verify-'));
  try {
    const db = openDb(join(dir, 't.db'));
    const row = {
      ticker: TICKER, version: '1.0.0', obs_date: '2026-07-24',
      value: 40, band: 'Watch', components: [], computed_at: new Date().toISOString(),
    };
    assert(insertValue(db, row) === true, 'first insert should write');
    assert(insertValue(db, { ...row, value: 99 }) === false, 'duplicate insert must be a no-op');
    eq(getAll(db)[0].value, 40, 'the original value must survive a duplicate insert');

    let updateBlocked = false;
    try {
      db.exec("UPDATE index_values SET value = 99 WHERE obs_date = '2026-07-24'");
    } catch { updateBlocked = true; }
    assert(updateBlocked, 'UPDATE must be rejected by the database');

    let deleteBlocked = false;
    try {
      db.exec("DELETE FROM index_values WHERE obs_date = '2026-07-24'");
    } catch { deleteBlocked = true; }
    assert(deleteBlocked, 'DELETE must be rejected by the database');

    eq(getAll(db).length, 1, 'the row must still be there');
    db.close();
    return 'insert/update/delete all behave';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------- published values vs their maths

check('every published value still equals its own arithmetic', () => {
  if (!existsSync(DB_PATH)) return 'skipped: nothing published yet';
  const db = openDb(DB_PATH);
  try {
    const rows = getAll(db);
    if (!rows.length) return 'skipped: no rows';
    let checked = 0;
    for (const r of rows) {
      const spec = getSpec(r.version);
      assert(spec.anchors, `${r.version}: published rows exist but the spec has no anchors`);
      const inputs = Object.fromEntries(
        r.components.map((c) => [c.key, { value: c.observation, date: c.observation_date }]),
      );
      const re = computeIndex(inputs, { version: r.version, obsDate: r.obs_date });
      assert(re.ok, `${r.version}/${r.obs_date}: no longer computes (${re.reasons?.join('; ')})`);
      eq(re.value, r.value, `${r.version}/${r.obs_date}: stored value drifted from its components`);
      eq(re.band, r.band, `${r.version}/${r.obs_date}: band drifted`);
      const sum = round(r.components.reduce((a, c) => a + c.contribution, 0), 2);
      eq(sum, r.value, `${r.version}/${r.obs_date}: contributions do not sum to the value`);
      checked++;
    }
    return `${checked} published rows re-verified`;
  } finally {
    db.close();
  }
});

// ---------------------------------------------------- calibration artifact

check('calibration artifact is consistent and not synthetic', () => {
  if (!existsSync(ARTIFACT_PATH)) return 'skipped: 1.1.0 not calibrated yet';
  const raw = readFileSync(ARTIFACT_PATH, 'utf8');
  assert(!/SYNTHETIC/i.test(raw), 'a synthetic calibration must never sit at the real artifact path');
  const a = JSON.parse(raw);
  eq(a.version, '1.1.0', 'artifact version');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(a.vintage ?? ''), 'artifact must record a vintage date');
  for (const s of SERIES) {
    const e = a.series?.[s.key];
    assert(e, `artifact missing series ${s.key}`);
    eq(e.fred_id, s.id, `${s.key}: fred_id`);
    assert(typeof e.n === 'number' && e.n > 100, `${s.key}: implausible observation count ${e.n}`);
    assert(/^[0-9a-f]{64}$/.test(e.sha256 ?? ''), `${s.key}: missing source hash`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(e.first_obs ?? ''), `${s.key}: first_obs`);
    const pcts = e.anchors.map(([, p]) => p);
    assert(
      pcts.every((p) => a.percentile_grid.includes(p)),
      `${s.key}: anchor percentiles are not from the declared grid`,
    );
    assert(pcts[pcts.length - 1] === 100, `${s.key}: top anchor must be the maximum (p100)`);
    for (let i = 1; i < e.anchors.length; i++) {
      assert(e.anchors[i][0] > e.anchors[i - 1][0], `${s.key}: anchor readings not increasing`);
    }
  }
  assert(
    JSON.stringify(a.weights) === JSON.stringify(getSpec('1.0.0').weights),
    'the calibration must not change the weights (that would be a new version)',
  );
  return `vintage ${a.vintage}`;
});

// -------------------------------------------- exports agree with the store

check('published exports agree with the database', () => {
  const pub = join(root, 'public');
  if (!existsSync(pub) || !existsSync(DB_PATH)) return 'skipped: nothing built yet';
  const db = openDb(DB_PATH);
  try {
    let files = 0;
    for (const v of getPublishedVersions(db)) {
      const csvPath = join(pub, `apcci-${v.version}.csv`);
      if (!existsSync(csvPath)) throw new Error(`missing export ${csvPath}`);
      const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
      eq(lines[0], 'ticker,version,obs_date,value,band', 'CSV header');
      eq(lines.length - 1, v.n, `${v.version}: CSV row count vs database`);
      files++;
    }
    return `${files} exports match`;
  } finally {
    db.close();
  }
});

// ------------------------------------------------------- no-claim guardrail

check('no performance claims, and the disclaimer is on every surface', () => {
  const forbidden = /\b(sharpe|outperform|backtest|annuali[sz]ed return|total return|buy signal|sell signal|expected return)\b/i;
  const surfaces = [join(root, 'docs', 'APCCI_METHODOLOGY.md'), join(root, 'README.md')];
  for (const f of surfaces) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const m = text.match(forbidden);
    assert(!m, `${f}: contains a performance-claim term "${m?.[0]}"`);
  }
  assert(/conditions, not returns/i.test(DISCLAIMER), 'the disclaimer must state what the index is not');
  const spec = respond(new URL('http://x/api/index-value?spec=1&version=1.0.0'));
  assert(JSON.parse(spec.body).disclaimer === DISCLAIMER, 'the spec endpoint must carry the disclaimer');
  return 'clean';
});

// --------------------------------------------------------- demo quarantine

check('synthetic demo output is quarantined', () => {
  const forbidden = [
    join(root, 'data', 'calibration', 'v1.1.0.json'),
    join(root, 'public', 'index.html'),
  ];
  for (const f of forbidden) {
    if (existsSync(f) && /SYNTHETIC/i.test(readFileSync(f, 'utf8'))) {
      throw new Error(`${f} contains synthetic demo content`);
    }
  }
  const ignore = existsSync(join(root, '.gitignore'))
    ? readFileSync(join(root, '.gitignore'), 'utf8')
    : '';
  assert(/^demo\/$/m.test(ignore), 'demo/ must be gitignored so synthetic output is never committed');
  return 'clean';
});

// -------------------------------------------------------------- API shape

check('API responds correctly for known and unknown versions', () => {
  const bad = respond(new URL('http://x/api/index-value?version=9.9.9'));
  eq(bad.status, 400, 'unknown version status');
  const spec = respond(new URL('http://x/api/index-value?spec=1&version=1.0.0'));
  eq(spec.status, 200, 'spec status');
  const body = JSON.parse(spec.body);
  eq(body.version, '1.0.0', 'spec echoes the version');
  eq(body.ticker, TICKER, 'spec echoes the ticker');
  assert(body.anchors?.hy_oas?.length > 0, 'spec exposes the anchor tables');
  assert(body.inputs.length === SERIES.length, 'spec lists every input');
  assert(body.inputs.every((i) => typeof i.weight === 'number'), 'spec lists every weight');
  return 'ok';
});

check('FRED CSV parsing drops missing observations rather than filling them', () => {
  const csv = 'observation_date,VIXCLS\n2026-07-20,17.5\n2026-07-21,.\n2026-07-22,18.25\n';
  const obs = parseSeriesCsv(csv, 'VIXCLS');
  eq(obs.length, 2, 'the "." row must be dropped, not carried forward');
  eq(obs[0].value, 17.5, 'first value');
  eq(obs[1].date, '2026-07-22', 'second date');
  let threw = false;
  try { parseSeriesCsv('observation_date,VIXCLS\n2026-07-21,.\n', 'VIXCLS'); } catch { threw = true; }
  assert(threw, 'a series with no usable observations must throw, not return empty');
  return 'ok';
});

// ------------------------------------------------------------------ report

const width = Math.max(...results.map((r) => r.name.length));
console.log(`APCCI verify — ${TICKER} ${INDEX_VERSION}\n`);
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
  console.error(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
