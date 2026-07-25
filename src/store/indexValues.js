/**
 * The published record.
 *
 * `index_values` is append-only and that is enforced by the database, not by
 * convention:
 *   - PRIMARY KEY (ticker, version, obs_date) + INSERT ... ON CONFLICT DO
 *     NOTHING means re-running a publish for a day that already has a value is
 *     a no-op rather than a rewrite.
 *   - BEFORE UPDATE and BEFORE DELETE triggers RAISE(ABORT). There is no code
 *     path, accidental or deliberate, that revises a published number.
 *
 * A correction is therefore never an edit. It is a new observation, under a new
 * version, published alongside the original — see docs/APCCI_METHODOLOGY.md §7.
 */
import './quietSqlite.js';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_PATH = fileURLToPath(new URL('../../data/apcci.db', import.meta.url));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS index_values (
  ticker      TEXT NOT NULL,
  version     TEXT NOT NULL,
  obs_date    TEXT NOT NULL,
  value       REAL NOT NULL,
  band        TEXT NOT NULL,
  components  TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (ticker, version, obs_date)
);

CREATE TRIGGER IF NOT EXISTS index_values_no_update
BEFORE UPDATE ON index_values
BEGIN
  SELECT RAISE(ABORT, 'index_values is append-only: published values are never revised');
END;

CREATE TRIGGER IF NOT EXISTS index_values_no_delete
BEFORE DELETE ON index_values
BEGIN
  SELECT RAISE(ABORT, 'index_values is append-only: published values are never deleted');
END;
`;

/**
 * node:sqlite is loaded lazily rather than with a static import. Its
 * ExperimentalWarning is emitted while the module graph is being linked, which
 * is before any module body runs — so a static import would fire the warning
 * before quietSqlite.js could install its filter. Requiring it on first use
 * defers the load until after that filter is in place.
 */
let DatabaseSync;
const require = createRequire(import.meta.url);
function sqlite() {
  if (!DatabaseSync) ({ DatabaseSync } = require('node:sqlite'));
  return DatabaseSync;
}

export function openDb(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new (sqlite())(path);
  db.exec(SCHEMA);
  return db;
}

/**
 * Appends one observation. Returns true if it was written, false if a value
 * for (ticker, version, obs_date) already existed — in which case the existing
 * value stands, unchanged.
 */
export function insertValue(db, row) {
  const before = countValues(db);
  db.prepare(
    `INSERT INTO index_values
       (ticker, version, obs_date, value, band, components, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  ).run(
    row.ticker,
    row.version,
    row.obs_date,
    row.value,
    row.band,
    JSON.stringify(row.components),
    row.computed_at ?? new Date().toISOString(),
  );
  return countValues(db) > before;
}

export function countValues(db) {
  return db.prepare('SELECT COUNT(*) AS c FROM index_values').get().c;
}

function hydrate(r) {
  return r && { ...r, components: JSON.parse(r.components) };
}

export function getLatest(db, version, ticker = 'APCCI') {
  return hydrate(
    db
      .prepare(
        `SELECT * FROM index_values
          WHERE ticker = ? AND version = ?
          ORDER BY obs_date DESC LIMIT 1`,
      )
      .get(ticker, version),
  );
}

export function getHistory(db, version, ticker = 'APCCI') {
  return db
    .prepare(
      `SELECT * FROM index_values
        WHERE ticker = ? AND version = ?
        ORDER BY obs_date ASC`,
    )
    .all(ticker, version)
    .map(hydrate);
}

/** Every version that actually has published values, newest series first. */
export function getPublishedVersions(db, ticker = 'APCCI') {
  return db
    .prepare(
      `SELECT version, COUNT(*) AS n, MIN(obs_date) AS first_obs, MAX(obs_date) AS last_obs
         FROM index_values WHERE ticker = ?
        GROUP BY version ORDER BY version DESC`,
    )
    .all(ticker);
}

export function getAll(db, ticker = 'APCCI') {
  return db
    .prepare(
      `SELECT * FROM index_values WHERE ticker = ?
        ORDER BY version ASC, obs_date ASC`,
    )
    .all(ticker)
    .map(hydrate);
}
