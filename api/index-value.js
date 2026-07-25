/**
 * Public read endpoint for APCCI. No auth, no rate limit, CORS open.
 *
 *   GET /api/index-value                      latest value, current version
 *   GET /api/index-value?version=1.0.0        latest value, a specific version
 *   GET /api/index-value?history=1            full published series
 *   GET /api/index-value?history=1&format=csv same, as CSV
 *   GET /api/index-value?spec=1               the spec: weights, anchors, provenance
 *
 * Every response echoes the version and the ticker, because two versions of
 * APCCI coexist and a number without its version is meaningless.
 *
 * The core is `respond(url)`, a pure function over a URL returning
 * {status, headers, body}. The default export adapts it to the Node/Vercel
 * (req, res) signature; scripts/serve.mjs adapts it to node:http.
 */
import {
  getSpec,
  INDEX_VERSION,
  VERSIONS,
  TICKER,
  BANDS,
} from '../src/engine/creditIndex.js';
import { SERIES } from '../src/engine/series.js';
import {
  openDb,
  getLatest,
  getHistory,
  getPublishedVersions,
} from '../src/store/indexValues.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
};

export const DISCLAIMER =
  'APCCI measures credit conditions, not returns. It is not a forecast, not ' +
  'investment advice, and carries no performance claim.';

export function toCsv(rows) {
  const head = 'ticker,version,obs_date,value,band';
  if (!rows.length) return `${head}\n`;
  const body = rows
    .map((r) => [r.ticker, r.version, r.obs_date, r.value.toFixed(2), r.band].join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}

function jsonBody(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** @param {URL} url @returns {{status:number, headers:object, body:string}} */
export function respond(url, { db: injected } = {}) {
  const q = url.searchParams;
  const version = q.get('version') ?? INDEX_VERSION;

  if (!VERSIONS.includes(version)) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: jsonBody({ error: `unknown version "${version}"`, known_versions: VERSIONS }),
    };
  }

  if (q.get('spec')) {
    const spec = getSpec(version);
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: jsonBody({
        ticker: TICKER,
        version,
        known_versions: VERSIONS,
        status: spec.status,
        scale: '0 = loosest credit conditions, 100 = tightest',
        orientation: 'every input is oriented so a higher reading means tighter credit',
        bands: BANDS,
        inputs: SERIES.map((s) => ({
          key: s.key,
          fred_id: s.id,
          label: s.label,
          unit: s.unit,
          max_stale_days: s.maxStaleDays,
          plausible_range: s.plausible,
          weight: spec.weights[s.key],
        })),
        anchor_basis: spec.anchor_basis,
        calibrated: spec.calibrated,
        anchors: spec.anchors,
        calibration: spec.calibration ?? null,
        note: spec.note ?? null,
        methodology: 'docs/APCCI_METHODOLOGY.md',
        disclaimer: DISCLAIMER,
      }),
    };
  }

  const db = injected ?? openDb();
  try {
    if (q.get('history')) {
      const rows = getHistory(db, version);
      if (q.get('format') === 'csv') {
        return {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=300',
            'content-disposition': `attachment; filename="apcci-${version}.csv"`,
          },
          body: toCsv(rows),
        };
      }
      return {
        status: 200,
        headers: JSON_HEADERS,
        body: jsonBody({
          ticker: TICKER,
          version,
          count: rows.length,
          observations: rows.map((r) => ({
            obs_date: r.obs_date,
            value: r.value,
            band: r.band,
          })),
          disclaimer: DISCLAIMER,
        }),
      };
    }

    const latest = getLatest(db, version);
    if (!latest) {
      return {
        status: 404,
        headers: JSON_HEADERS,
        body: jsonBody({
          ticker: TICKER,
          version,
          error: 'no values published for this version',
          published_versions: getPublishedVersions(db),
          note: getSpec(version).note ?? null,
        }),
      };
    }
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: jsonBody({
        ticker: TICKER,
        version,
        obs_date: latest.obs_date,
        value: latest.value,
        band: latest.band,
        components: latest.components,
        computed_at: latest.computed_at,
        methodology: 'docs/APCCI_METHODOLOGY.md',
        disclaimer: DISCLAIMER,
      }),
    };
  } finally {
    if (!injected) db.close();
  }
}

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers?.host ?? 'localhost'}`);
  const { status, headers, body } = respond(url);
  res.writeHead(status, headers);
  res.end(body);
}
