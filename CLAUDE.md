# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

APCCI — the AP Credit Cycle Index. A published, citable 0–100 index of US credit
conditions computed from five public FRED series. The point of the project is not
the number; it is that a stranger can reproduce, verify and cite the number. See
`README.md` for orientation and `docs/APCCI_METHODOLOGY.md` for the full spec.

## Commands

No dependencies. Requires Node ≥ 22.5 for the built-in `node:sqlite`.

```bash
node scripts/verify.mjs                  # invariant suite — MUST pass before any commit
npm test                                 # unit tests (node --test)
node --test test/apcci.test.js           # a single test file
npm run demo                             # full pipeline on synthetic data, offline

node scripts/calibrate.mjs               # fit v1.1.0 anchors from full FRED history
node scripts/publish.mjs --backfill      # compute and append values
node scripts/build-site.mjs              # render public/ + CSV/JSON downloads
node scripts/serve.mjs                   # preview on localhost:8080
```

Every script that reads FRED accepts `--from-dir <dir>` to read `<SERIES_ID>.csv`
from disk instead, so the whole pipeline runs with no network.

## Architecture

- **`src/engine/creditIndex.js`** — `computeIndex()` and `bandOf()`. Returns
  `{ok:false, reasons}` rather than throwing or producing a partial value.
- **`src/engine/specs/`** — one module per version. `v1_0_0.js` holds frozen
  literal anchors; `v1_1_0.js` loads them from the calibration artifact and
  reports `pending_calibration` when it is absent.
- **`src/engine/series.js`** — the five inputs: units, staleness allowances,
  plausibility bounds. Shared by every version.
- **`src/store/indexValues.js`** — the append-only `index_values` table.
- **`src/site/`** — `render.js` (pure data→HTML), `art.js` (procedural dithered
  illustrations), `png.js` (encoder). Assets are generated, not checked in.
- **`api/index-value.js`** — `respond(url)` is pure; the default export adapts it
  to `(req, res)`.

## Rules that are not negotiable

These are the project's reason for existing. `scripts/verify.mjs` enforces each
one; if a change makes a check fail, the change is wrong, not the check.

1. **Every value must be recomputable by a stranger with FRED + the doc.** If you
   change the arithmetic, change §6 of the methodology in the same commit.
2. **Incomplete or implausible inputs publish NOTHING for that day.** Never a
   partial value, never a carry-forward, never a fallback to another version's
   anchors.
3. **Published values are never revised.** Corrections are new observations.
4. **Any change to inputs, weights or anchors is a new version, never an edit.**
   Do not touch the numbers in `specs/v1_0_0.js` or in a calibration artifact
   that has published values behind it — add a version.
5. **No performance claims anywhere.** The index measures conditions, not
   returns. No backtests, no return statistics, no signal language.

## Working notes

- Anchor tables are `[reading, subscore]` knots, sorted ascending, interpolated
  linearly and clamped at both ends.
- Rounding is specified: subscores to 2dp, contributions to 2dp, index = sum of
  rounded contributions. The public component table must add up exactly.
- Synthetic demo output belongs under `demo/` only (gitignored). `verify.mjs`
  fails if anything synthetic reaches `data/` or `public/`.
