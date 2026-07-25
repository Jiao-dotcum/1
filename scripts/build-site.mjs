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
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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
const inline = argv.includes('--inline');

/**
 * Rewrites a page into a single self-contained file: fonts, illustrations and
 * the downloads become data: URIs. Needed for hosts that serve one HTML file
 * with no sibling assets, and for handing someone a page that keeps working
 * when it is saved to disk or emailed on.
 *
 * The downloads are embedded verbatim, so the CSV a reader saves from an
 * inlined page is byte-identical to the one the build wrote.
 *
 * Downloads above MAX_INLINE_BYTES are not embedded — the full-component JSON
 * for a multi-decade daily series runs to tens of megabytes, which would make
 * the page unopenable. Those links are replaced with a note rather than left
 * pointing at a file that will not be there, so an inlined page never ships a
 * dead download.
 */
const MAX_INLINE_BYTES = 500 * 1024;

function inlineAssets(html, assets) {
  let out = html;
  for (const f of readdirSync(join(root, 'assets', 'fonts'))) {
    const b64 = readFileSync(join(root, 'assets', 'fonts', f)).toString('base64');
    out = out.replaceAll(`fonts/${f}`, `data:font/woff2;base64,${b64}`);
  }
  for (const plate of PLATES) {
    for (const theme of Object.keys(INKS)) {
      const name = `art/${plate.name}-${theme}.png`;
      const b64 = readFileSync(join(outDir, name)).toString('base64');
      out = out.replaceAll(name, `data:image/png;base64,${b64}`);
    }
  }
  for (const [name, body, mime] of assets) {
    if (Buffer.byteLength(body) > MAX_INLINE_BYTES) {
      const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
      out = out.replaceAll(
        `<a href="${name}">${name}</a>`,
        `${name}<br><span style="opacity:.65">${kb}KB &mdash; too large to embed, ` +
          `download from the repository</span>`,
      );
      continue;
    }
    const b64 = Buffer.from(body, 'utf8').toString('base64');
    out = out.replaceAll(`"${name}"`, `"data:${mime};base64,${b64}" download="${name}"`);
  }
  return out;
}

// Illustrations first: an inlined page embeds them, so they must exist before
// any page is rendered.
const artOut = join(outDir, 'art');
mkdirSync(artOut, { recursive: true });
for (const plate of PLATES) {
  for (const [theme, ink] of Object.entries(INKS)) {
    writeFileSync(join(artOut, `${plate.name}-${theme}.png`), renderPlate(plate.field, ink));
  }
}

const histories = new Map(versions.map((v) => [v.version, getHistory(db, v.version)]));
for (const h of histories.values()) allRows.push(...h);
allRows.sort((a, b) =>
  a.version === b.version ? (a.obs_date < b.obs_date ? -1 : 1) : a.version < b.version ? -1 : 1,
);
const allCsv = toCsv(allRows);

for (const v of versions) {
  const history = histories.get(v.version);
  const spec = getSpec(v.version);
  const latest = history[history.length - 1] ?? null;

  const csv = toCsv(history);
  const json =
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
    )}\n`;
  const specJson = `${JSON.stringify({ ticker: TICKER, ...spec, disclaimer: DISCLAIMER }, null, 2)}\n`;

  writeFileSync(join(outDir, `apcci-${v.version}.csv`), csv);
  writeFileSync(join(outDir, `apcci-${v.version}.json`), json);
  writeFileSync(join(outDir, `spec-${v.version}.json`), specJson);

  let html = renderPage({
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
  if (inline) {
    html = inlineAssets(html, [
      [`apcci-${v.version}.csv`, csv, 'text/csv'],
      [`apcci-${v.version}.json`, json, 'application/json'],
      [`spec-${v.version}.json`, specJson, 'application/json'],
      ['apcci-all.csv', allCsv, 'text/csv'],
    ]);
  }
  const page = v.version === defaultVersion ? 'index.html' : `v${v.version}.html`;
  writeFileSync(join(outDir, page), html);

  console.log(
    `  ${v.version.padEnd(7)} ${String(history.length).padStart(6)} obs  -> ${page}` +
      `  ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`,
  );
}

writeFileSync(join(outDir, 'apcci-all.csv'), allCsv);

const methodology = join(root, 'docs', 'APCCI_METHODOLOGY.md');
if (existsSync(methodology)) copyFileSync(methodology, join(outDir, 'APCCI_METHODOLOGY.md'));

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
