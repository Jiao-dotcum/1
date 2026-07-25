/**
 * Minimal FRED reader.
 *
 * Two paths, both producing the same thing so calibration is reproducible
 * whether or not the machine has outbound network access:
 *   - fetchSeriesCsv(id)      GET fredgraph.csv (no API key required)
 *   - readSeriesCsv(dir, id)  read <dir>/<ID>.csv downloaded by hand
 *
 * The raw CSV bytes are hashed and the hash is recorded in the calibration
 * artifact, so anyone can check that their download matches the one the
 * published anchors were derived from.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const FREDGRAPH = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Downloads the full history of one series as CSV text. */
export async function fetchSeriesCsv(id, { timeoutMs = 60000 } = {}) {
  const url = `${FREDGRAPH}?id=${encodeURIComponent(id)}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: 'text/csv,*/*' },
    });
    if (!res.ok) throw new Error(`FRED ${id}: HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Reads <dir>/<ID>.csv from disk. */
export function readSeriesCsv(dir, id) {
  return readFileSync(join(dir, `${id}.csv`), 'utf8');
}

/**
 * Parses a fredgraph CSV into ascending `{date, value}` observations.
 *
 * FRED writes missing observations as "." — those rows are dropped, never
 * carried forward or interpolated. The first column has been named both DATE
 * and observation_date over the years; both are accepted.
 */
export function parseSeriesCsv(text, id) {
  // Leading '#' lines are not a FRED convention; they are tolerated so a
  // hand-assembled or annotated CSV can be fed in via --from-dir.
  const lines = text.trim().split(/\r?\n/).filter((l, i, a) => !(l.startsWith('#') && a.slice(0, i).every((p) => p.startsWith('#'))));
  if (lines.length < 2) throw new Error(`FRED ${id}: CSV has no observations`);
  const header = lines[0].split(',').map((h) => h.trim());
  const dateCol = header.findIndex((h) => /^(date|observation_date)$/i.test(h));
  if (dateCol === -1) throw new Error(`FRED ${id}: no date column in header "${lines[0]}"`);
  let valueCol = header.findIndex((h) => h.toUpperCase() === id.toUpperCase());
  if (valueCol === -1) valueCol = dateCol === 0 ? 1 : 0;

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const date = (row[dateCol] ?? '').trim();
    const raw = (row[valueCol] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (raw === '' || raw === '.') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  if (out.length === 0) throw new Error(`FRED ${id}: no usable observations`);
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Loads one series from network or disk and returns observations plus provenance. */
export async function loadSeries(id, { fromDir = null } = {}) {
  const csv = fromDir ? readSeriesCsv(fromDir, id) : await fetchSeriesCsv(id);
  const observations = parseSeriesCsv(csv, id);
  return {
    id,
    observations,
    source: fromDir ? `file://${join(fromDir, `${id}.csv`)}` : `${FREDGRAPH}?id=${id}`,
    sha256: sha256(csv),
  };
}

/** The most recent observation at or before `asOf` (or the last one if unset). */
export function latestOnOrBefore(observations, asOf = null) {
  if (!asOf) return observations[observations.length - 1] ?? null;
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i].date <= asOf) return observations[i];
  }
  return null;
}
