#!/usr/bin/env node
/**
 * Builds the static public site into public/.
 *
 *   node scripts/build-site.mjs
 *   node scripts/build-site.mjs --db data/demo.db --out public-demo --banner "..."
 *
 * Emits, for every version that exists:
 *   index.html / v<version>.html   the public page
 *   apcci-<version>.csv|.json      the downloads
 *   spec-<version>.json            weights, anchors, provenance
 *   apcci-all.csv                  every version in one file
 *   APCCI_METHODOLOGY.md           the spec, copied next to the page
 *
 * There is no server and no build step beyond this: the page is plain HTML with
 * one inline script for the chart hover, so anyone can read the source and see
 * that the numbers on screen are the numbers in the CSV.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/site/render.js';
import { PLATES, INKS, renderPlate } from '../src/site/art.js';
import { getSpec, INDEX_VERSION, VERSIONS, TICKER } from '../src/engine/creditIndex.js';
import { openDb, getHistory, getPublishedVersions, DB_PATH } from '../src/store/indexValues.js';
import { toCsv, DISCLAIMER } from '../api/index-value.js';

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1] ?? true;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const dbPath = flag('--db') ?? DB_PATH;
const outDir = flag('--out') ?? join(root, 'public');
const banner = flag('--banner');

const db = openDb(dbPath);
mkdirSync(outDir, { recursive: true });

const published = Object.fromEntries(getPublishedVersions(db).map((v) => [v.version, v]));

const versions = VERSIONS.map((v) => {
  const spec = getSpec(v);
  const p = published[v];
  return {
    version: v,
    status: p ? 'published' : spec.status,
    anchor_basis: spec.anchor_basis,
    n: p?.n ?? 0,
    first_obs: p?.first_obs ?? null,
    last_obs: p?.last_obs ?? null,
  };
}).sort((a, b) => (a.version < b.version ? 1 : -1));

const defaultVersion =
  published[INDEX_VERSION] ? INDEX_VERSION : versions.find((v) => v.n > 0)?.version ?? INDEX_VERSION;

const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + 'Z';
const allRows = [];

for (const v of versions) {
  const history = getHistory(db, v.version);
  const spec = getSpec(v.version);
  const latest = history[history.length - 1] ?? null;
  allRows.push(...history);

  const html = renderPage({
    ticker: TICKER,
    version: v.version,
    latest,
    history,
    spec,
    versions,
    defaultVersion,
    banner,
    generatedAt,
  });
  writeFileSync(
    join(outDir, v.version === defaultVersion ? 'index.html' : `v${v.version}.html`),
    html,
  );

  writeFileSync(join(outDir, `apcci-${v.version}.csv`), toCsv(history));
  writeFileSync(
    join(outDir, `apcci-${v.version}.json`),
    `${JSON.stringify(
      {
        ticker: TICKER,
        version: v.version,
        status: v.status,
        count: history.length,
        generated_at: new Date().toISOString(),
        methodology: 'APCCI_METHODOLOGY.md',
        disclaimer: DISCLAIMER,
        observations: history.map((r) => ({
          obs_date: r.obs_date,
          value: r.value,
          band: r.band,
          components: r.components,
        })),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(outDir, `spec-${v.version}.json`),
    `${JSON.stringify({ ticker: TICKER, ...spec, disclaimer: DISCLAIMER }, null, 2)}\n`,
  );
  console.log(`  ${v.version.padEnd(7)} ${String(history.length).padStart(6)} obs  -> ${
    v.version === defaultVersion ? 'index.html' : `v${v.version}.html`
  }`);
}

allRows.sort((a, b) =>
  a.version === b.version ? (a.obs_date < b.obs_date ? -1 : 1) : a.version < b.version ? -1 : 1,
);
writeFileSync(join(outDir, 'apcci-all.csv'), toCsv(allRows));

const methodology = join(root, 'docs', 'APCCI_METHODOLOGY.md');
if (existsSync(methodology)) copyFileSync(methodology, join(outDir, 'APCCI_METHODOLOGY.md'));

// Illustrations, generated from source rather than checked in as binaries.
// Two tints per plate so the page can swap them by colour scheme.
const artOut = join(outDir, 'art');
mkdirSync(artOut, { recursive: true });
for (const plate of PLATES) {
  for (const [theme, ink] of Object.entries(INKS)) {
    writeFileSync(join(artOut, `${plate.name}-${theme}.png`), renderPlate(plate.field, ink));
  }
}

// Self-hosted fonts: the page must render identically offline, so a reader can
// save it, or verify it from a checkout, with no third-party requests.
const fontSrc = join(root, 'assets', 'fonts');
if (existsSync(fontSrc)) {
  const fontOut = join(outDir, 'fonts');
  mkdirSync(fontOut, { recursive: true });
  for (const f of readdirSync(fontSrc)) copyFileSync(join(fontSrc, f), join(fontOut, f));
}

console.log(`\nsite -> ${outDir}   (${allRows.length} rows across ${versions.length} versions)`);
db.close();
