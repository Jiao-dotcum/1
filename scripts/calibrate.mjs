#!/usr/bin/env node
/**
 * Generates the APCCI v1.1.0 calibration artifact.
 *
 *   node scripts/calibrate.mjs                 # pull full history from FRED
 *   node scripts/calibrate.mjs --from-dir raw  # use raw/<SERIES_ID>.csv on disk
 *   node scripts/calibrate.mjs --force         # allow replacing an existing artifact
 *
 * For each of the five inputs it pulls the ENTIRE published history, computes
 * the percentiles named in PERCENTILE_GRID with the type-7 estimator, and
 * writes them as anchor knots to data/calibration/v1.1.0.json along with the
 * FRED vintage, the observation count, the date range and a SHA-256 of the raw
 * CSV each number came from.
 *
 * The artifact is the calibration. It is committed so that the anchors are
 * inspectable in a diff, and hashed so a third party can prove their download
 * matches ours.
 *
 * SAFETY: anchors define what a published number means. If the artifact
 * already exists and the newly computed anchors differ, this script refuses to
 * write. A different mapping is a different index version, never an edit to a
 * live one — see docs/APCCI_METHODOLOGY.md §7.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SERIES } from '../src/engine/series.js';
import { loadSeries } from '../src/data/fred.js';
import { anchorsFromSample } from '../src/engine/percentile.js';
import { PERCENTILE_GRID, WEIGHTS, ARTIFACT_PATH } from '../src/engine/specs/v1_1_0.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? true;
};
const fromDir = flag('--from-dir');
const force = argv.includes('--force');
const outPath = flag('--out') ?? ARTIFACT_PATH;

const today = new Date().toISOString().slice(0, 10);

console.log(
  `APCCI v1.1.0 calibration — source: ${fromDir ? `dir ${fromDir}` : 'FRED (fredgraph.csv)'}`,
);

const series = {};
for (const s of SERIES) {
  process.stdout.write(`  ${s.id.padEnd(14)} `);
  let loaded;
  try {
    loaded = await loadSeries(s.id, { fromDir });
  } catch (err) {
    console.log('FAILED');
    console.error(`\n${s.id}: ${err.message}`);
    console.error(
      '\nCalibration needs the full history of all five inputs. No partial ' +
        'artifact is written.\nIf this machine cannot reach FRED, download each ' +
        'series as CSV from\n  https://fred.stlouisfed.org/series/<ID>\ninto a ' +
        'directory as <ID>.csv and re-run with --from-dir <dir>.',
    );
    process.exit(1);
  }
  const values = loaded.observations.map((o) => o.value);
  const anchors = anchorsFromSample(values, PERCENTILE_GRID);
  series[s.key] = {
    fred_id: s.id,
    label: s.label,
    unit: s.unit,
    source: loaded.source,
    sha256: loaded.sha256,
    n: values.length,
    first_obs: loaded.observations[0].date,
    last_obs: loaded.observations[values.length - 1].date,
    anchors,
  };
  console.log(
    `n=${String(values.length).padStart(6)}  ${loaded.observations[0].date}..${
      loaded.observations[values.length - 1].date
    }  p50=${anchors.find((a) => a[1] === 50)?.[0].toFixed(3) ?? 'n/a'}`,
  );
}

const artifact = {
  version: '1.1.0',
  ticker: 'APCCI',
  method: 'empirical-percentile-anchors',
  description:
    'Anchor knots are [reading, percentile] pairs taken from the full published ' +
    'history of each input, so a subscore equals the historical percentile of ' +
    'that reading within its own series.',
  interpolation: 'type-7 quantile; piecewise-linear between knots; clamped outside',
  percentile_grid: PERCENTILE_GRID,
  weights: WEIGHTS,
  vintage: today,
  generated_at: new Date().toISOString(),
  series,
};

const serialised = `${JSON.stringify(artifact, null, 2)}\n`;

if (existsSync(outPath) && !force) {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  const changed = Object.keys(series).filter(
    (k) => JSON.stringify(prev.series?.[k]?.anchors) !== JSON.stringify(series[k].anchors),
  );
  if (changed.length) {
    console.error(
      `\nRefusing to overwrite ${outPath}.\n\n` +
        `Anchors changed for: ${changed.join(', ')}.\n` +
        'Values already published under 1.1.0 were computed with the existing ' +
        'anchors.\nRewriting them would silently change what those numbers mean.\n' +
        'Add version 1.2.0 instead, or pass --force if nothing has been published yet.',
    );
    process.exit(1);
  }
  console.log('\nAnchors unchanged; refreshing provenance metadata.');
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, serialised);
console.log(`\nWrote ${outPath}`);
console.log('Next: node scripts/publish.mjs && node scripts/build-site.mjs');
