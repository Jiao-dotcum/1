#!/usr/bin/env node
/**
 * One command to publish the index end to end.
 *
 *   node scripts/release.mjs                  # pull from FRED
 *   node scripts/release.mjs --from-dir raw   # offline, from downloaded CSVs
 *   node scripts/release.mjs --no-backfill    # only the latest publishable date
 *
 * Runs, in order, stopping at the first failure:
 *   1. calibrate    fit v1.1.0 anchors (skipped if the artifact already exists)
 *   2. publish      1.0.0 and 1.1.0, appending only what is not already there
 *   3. build-site   render public/ and the CSV/JSON downloads
 *   4. verify       re-check every invariant against what was just written
 *
 * Steps 2-4 are safe to re-run: publishing is append-only and skips dates that
 * already have values, so a repeated release is a no-op rather than a rewrite.
 *
 * This script deliberately does NOT commit. Look at the diff first — a release
 * adds rows to the published record, and those rows are final.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_PATH } from '../src/engine/specs/v1_1_0.js';
import { VERSIONS } from '../src/engine/creditIndex.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const flagIndex = argv.indexOf('--from-dir');
const passthrough = flagIndex === -1 ? [] : ['--from-dir', argv[flagIndex + 1]];
const backfill = argv.includes('--no-backfill') ? [] : ['--backfill'];

function step(label, args) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 58 - label.length))}\n`);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nRelease stopped: ${label} failed.`);
    if (label.startsWith('calibrate')) {
      console.error(
        '\nIf this machine cannot reach fred.stlouisfed.org, download each of the\n' +
          'five series from https://fred.stlouisfed.org/series/<ID> as <ID>.csv into\n' +
          'a directory and re-run with --from-dir <dir>.',
      );
    }
    process.exit(r.status ?? 1);
  }
}

if (existsSync(ARTIFACT_PATH)) {
  console.log(`calibration artifact present, skipping calibration\n  ${ARTIFACT_PATH}`);
  console.log('  (delete it, or add a new version, to recalibrate — see METHODOLOGY §7)');
} else {
  step('calibrate v1.1.0', ['scripts/calibrate.mjs', ...passthrough]);
}

for (const v of VERSIONS) {
  step(`publish ${v}`, ['scripts/publish.mjs', '--version', v, ...backfill, ...passthrough, '--quiet']);
}

step('build site', ['scripts/build-site.mjs']);
step('verify', ['scripts/verify.mjs']);

console.log(
  '\nReleased. Review the diff, then commit — data/apcci.db and\n' +
    'data/calibration/v1.1.0.json are the published record and must be kept.',
);
