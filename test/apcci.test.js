/**
 * Unit tests. These cover the pieces `scripts/verify.mjs` does not: the page
 * renderer, the CSV/JSON export shape, and the API's data paths against a
 * throwaway database.
 *
 * verify.mjs is the invariant suite (weights, anchors, immutability, refusal
 * rules) and is the thing to run before publishing. This file is the ordinary
 * developer test suite: `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeIndex, getSpec, round, TICKER } from '../src/engine/creditIndex.js';
import { renderPage } from '../src/site/render.js';
import { openDb, insertValue, getHistory, getLatest } from '../src/store/indexValues.js';
import { respond, toCsv } from '../api/index-value.js';
import { parseSeriesCsv, latestOnOrBefore } from '../src/data/fred.js';

const READINGS = { hy_oas: 5.25, ccc_oas: 11.0, ig_oas: 1.55, nfci: 0.25, vix: 20.0 };
const DATE = '2026-07-24';
const inputs = Object.fromEntries(
  Object.entries(READINGS).map(([k, v]) => [k, { value: v, date: DATE }]),
);

function computed() {
  const r = computeIndex(inputs, { version: '1.0.0', obsDate: DATE });
  assert.ok(r.ok, r.reasons?.join('; '));
  return r;
}

function seeded() {
  const dir = mkdtempSync(join(tmpdir(), 'apcci-test-'));
  const db = openDb(join(dir, 't.db'));
  const r = computed();
  for (const [i, d] of ['2026-07-22', '2026-07-23', DATE].entries()) {
    insertValue(db, {
      ticker: TICKER, version: '1.0.0', obs_date: d,
      value: round(r.value + i, 2), band: r.band,
      components: r.components, computed_at: '2026-07-25T00:00:00.000Z',
    });
  }
  return { db, dir, r };
}

test('components sum exactly to the published value', () => {
  const r = computed();
  const sum = round(r.components.reduce((a, c) => a + c.contribution, 0), 2);
  assert.equal(sum, r.value);
  assert.equal(r.components.length, 5);
});

test('interpolation midpoint is exact', () => {
  // hy_oas 5.25 is the midpoint of the v1.0.0 knots 4.50 -> 40 and 6.00 -> 60.
  const hy = computed().components.find((c) => c.key === 'hy_oas');
  assert.equal(hy.subscore, 50);
  assert.equal(hy.contribution, 15); // 0.30 * 50
});

test('a refusal carries reasons and no value', () => {
  const short = { ...inputs };
  delete short.ig_oas;
  const r = computeIndex(short, { version: '1.0.0', obsDate: DATE });
  assert.equal(r.ok, false);
  assert.equal(r.value, undefined);
  assert.ok(r.reasons.some((x) => x.includes('BAMLC0A0CM')));
});

test('latestOnOrBefore never looks into the future', () => {
  const obs = [
    { date: '2026-07-20', value: 1 },
    { date: '2026-07-24', value: 2 },
    { date: '2026-07-28', value: 3 },
  ];
  assert.equal(latestOnOrBefore(obs, '2026-07-24').value, 2);
  assert.equal(latestOnOrBefore(obs, '2026-07-25').value, 2);
  assert.equal(latestOnOrBefore(obs, '2026-07-19'), null);
});

test('CSV export has a stable header and one row per observation', () => {
  const { db, dir } = seeded();
  try {
    const csv = toCsv(getHistory(db, '1.0.0'));
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'ticker,version,obs_date,value,band');
    assert.equal(lines.length, 4);
    assert.ok(lines[1].startsWith('APCCI,1.0.0,2026-07-22,'));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API returns latest, history and CSV from the store', () => {
  const { db, dir } = seeded();
  try {
    const latest = JSON.parse(respond(new URL('http://x/a?version=1.0.0'), { db }).body);
    assert.equal(latest.obs_date, DATE);
    assert.equal(latest.ticker, 'APCCI');
    assert.equal(latest.components.length, 5);

    const hist = JSON.parse(respond(new URL('http://x/a?version=1.0.0&history=1'), { db }).body);
    assert.equal(hist.count, 3);

    const csv = respond(new URL('http://x/a?version=1.0.0&history=1&format=csv'), { db });
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.headers['content-disposition'], /apcci-1\.0\.0\.csv/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API 404s for a version with no published values', () => {
  const { db, dir } = seeded();
  try {
    const res = respond(new URL('http://x/a?version=1.1.0'), { db });
    assert.equal(res.status, 404);
    assert.match(res.body, /no values published/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the page renders the value, the arithmetic and the disclaimer', () => {
  const { db, dir } = seeded();
  try {
    const history = getHistory(db, '1.0.0');
    const html = renderPage({
      ticker: TICKER,
      version: '1.0.0',
      latest: getLatest(db, '1.0.0'),
      history,
      spec: getSpec('1.0.0'),
      versions: [{ version: '1.0.0', status: 'published', n: 3, first_obs: '2026-07-22', last_obs: DATE }],
      defaultVersion: '1.0.0',
      banner: null,
      generatedAt: '2026-07-25 00:00Z',
    });
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /conditions, not returns/i);
    assert.match(html, /BAMLH0A0HYM2/);
    assert.match(html, /fred\.stlouisfed\.org\/series\/VIXCLS/);
    // The bracketing anchor knots are shown, so a reader can redo the
    // interpolation rather than trust the subscore.
    assert.match(html, /Anchors 4\.50&rarr;40\.0/);
    assert.match(html, /apcci-1\.0\.0\.csv/);
    assert.ok(html.includes('<svg'), 'chart is rendered');
    assert.ok(!html.includes('undefined'), 'no undefined leaked into the page');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the page renders an honest empty state with no published values', () => {
  const html = renderPage({
    ticker: TICKER,
    version: '1.1.0',
    latest: null,
    history: [],
    spec: getSpec('1.1.0'),
    versions: [{ version: '1.1.0', status: 'pending_calibration', n: 0, first_obs: null, last_obs: null }],
    defaultVersion: '1.1.0',
    banner: null,
    generatedAt: '2026-07-25 00:00Z',
  });
  assert.match(html, /No values are published/i);
  assert.ok(!/NaN/.test(html), 'no NaN in the empty state');
  assert.ok(!html.includes('<svg'), 'no chart without data');
});

test('malformed CSV input is rejected rather than guessed at', () => {
  assert.throws(() => parseSeriesCsv('nonsense\n', 'VIXCLS'));
  assert.throws(() => parseSeriesCsv('observation_date,VIXCLS\n', 'VIXCLS'));
});
