#!/usr/bin/env node
/**
 * Computes APCCI and appends it to the published record.
 *
 *   node scripts/publish.mjs                          # latest publishable date
 *   node scripts/publish.mjs --backfill               # every date since inputs begin
 *   node scripts/publish.mjs --since 2015-01-01       # backfill from a date
 *   node scripts/publish.mjs --date 2026-07-24        # one specific date
 *   node scripts/publish.mjs --version 1.0.0          # publish the frozen series
 *   node scripts/publish.mjs --from-dir raw           # offline, from downloaded CSVs
 *
 * Rules this script exists to honour:
 *   - A date whose inputs are incomplete, stale or implausible publishes
 *     NOTHING. It is skipped and the reason is logged. There is no partial
 *     value under the APCCI name.
 *   - Dates that already have a published value are left exactly as they are.
 *     The insert is ON CONFLICT DO NOTHING and the table refuses UPDATE.
 *
 * Backfill is the normal way to create the series: because published values are
 * final, computing the full history once with a fixed spec is the only way to
 * get a consistent series. Re-running it later changes nothing.
 */
import { SERIES } from '../src/engine/series.js';
import { loadSeries, latestOnOrBefore } from '../src/data/fred.js';
import { computeIndex, getSpec, INDEX_VERSION, TICKER } from '../src/engine/creditIndex.js';
import { openDb, insertValue, countValues, DB_PATH } from '../src/store/indexValues.js';

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1] ?? true;
};
const version = flag('--version') ?? INDEX_VERSION;
const fromDir = flag('--from-dir');
const onlyDate = flag('--date');
const since = flag('--since');
const backfill = argv.includes('--backfill') || since != null;
const quiet = argv.includes('--quiet');

const spec = getSpec(version);
if (!spec.anchors) {
  console.error(`APCCI ${version} is not calibrated, so it cannot publish.\n\n${spec.note}`);
  process.exit(1);
}

console.log(`APCCI ${version} — loading inputs from ${fromDir ? `dir ${fromDir}` : 'FRED'}`);

/** All five histories, or exit. A missing input is never worked around. */
const loaded = {};
for (const s of SERIES) {
  try {
    loaded[s.key] = await loadSeries(s.id, { fromDir });
  } catch (err) {
    console.error(`\n${s.id}: ${err.message}`);
    console.error('\nCannot publish without all five inputs. Nothing was written.');
    process.exit(1);
  }
  const obs = loaded[s.key].observations;
  if (!quiet) {
    console.log(
      `  ${s.id.padEnd(14)} n=${String(obs.length).padStart(6)}  ` +
        `${obs[0].date}..${obs[obs.length - 1].date}`,
    );
  }
}

/** Candidate observation dates: every date any input printed, ascending. */
function candidateDates() {
  if (onlyDate) return [onlyDate];
  const set = new Set();
  for (const s of SERIES) for (const o of loaded[s.key].observations) set.add(o.date);
  let dates = [...set].sort();
  if (since) dates = dates.filter((d) => d >= since);
  if (!backfill) {
    // Only the newest date that actually passes the gates.
    for (let i = dates.length - 1; i >= 0; i--) {
      if (computeFor(dates[i]).ok) return [dates[i]];
    }
    return dates.slice(-1);
  }
  return dates;
}

function computeFor(date) {
  const inputs = {};
  for (const s of SERIES) {
    const o = latestOnOrBefore(loaded[s.key].observations, date);
    if (o) inputs[s.key] = { value: o.value, date: o.date };
  }
  return computeIndex(inputs, { version, obsDate: date });
}

const db = openDb(flag('--db') ?? DB_PATH);
const before = countValues(db);
let written = 0;
let existing = 0;
const skipped = [];

for (const date of candidateDates()) {
  const result = computeFor(date);
  if (!result.ok) {
    skipped.push({ date, reasons: result.reasons });
    continue;
  }
  const inserted = insertValue(db, {
    ticker: TICKER,
    version,
    obs_date: date,
    value: result.value,
    band: result.band,
    components: result.components,
    computed_at: new Date().toISOString(),
  });
  if (inserted) written++;
  else existing++;
}

console.log(
  `\nappended ${written}   already published ${existing}   skipped ${skipped.length}` +
    `   total rows ${countValues(db)} (was ${before})`,
);

if (skipped.length) {
  const show = backfill ? skipped.slice(-5) : skipped;
  console.log('\nPublished nothing for:');
  for (const s of show) console.log(`  ${s.date}  ${s.reasons.join('; ')}`);
  if (skipped.length > show.length) {
    console.log(`  ... and ${skipped.length - show.length} earlier dates`);
  }
}

if (written === 0 && existing === 0) {
  console.log('\nNo value was published. This is the correct outcome when inputs are incomplete.');
}
db.close();
