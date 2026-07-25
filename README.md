# APCCI — AP Credit Cycle Index

A published, citable 0–100 index of US credit conditions, computed from five
public FRED series. Built so that a stranger can find it, read it, **verify it
by hand in about five minutes**, and cite it in a way that still resolves years
later.

**0 = loosest credit conditions on the reference scale, 100 = tightest.**

> APCCI measures conditions, not returns. It is not a forecast, not investment
> advice, and carries no performance claim.

- Full specification: **[`docs/APCCI_METHODOLOGY.md`](docs/APCCI_METHODOLOGY.md)**
- Public page: `public/index.html` (built by `npm run site`)
- Downloads: `apcci-<version>.csv`, `apcci-<version>.json`, `apcci-all.csv`
- API: `api/index-value.js` — latest, `?history=1`, `?spec=1`

---

## The five inputs

| FRED series | Description | Weight |
|---|---|---|
| [`BAMLH0A0HYM2`](https://fred.stlouisfed.org/series/BAMLH0A0HYM2) | ICE BofA US High Yield OAS | 0.30 |
| [`BAMLH0A3HYC`](https://fred.stlouisfed.org/series/BAMLH0A3HYC) | ICE BofA US CCC & Lower OAS | 0.20 |
| [`BAMLC0A0CM`](https://fred.stlouisfed.org/series/BAMLC0A0CM) | ICE BofA US Corporate OAS | 0.20 |
| [`NFCI`](https://fred.stlouisfed.org/series/NFCI) | Chicago Fed National Financial Conditions Index | 0.20 |
| [`VIXCLS`](https://fred.stlouisfed.org/series/VIXCLS) | CBOE Volatility Index, close | 0.10 |

Each reading maps to a 0–100 subscore through that series' anchor table by
piecewise-linear interpolation; the index is the weighted sum. Weights total 1.

## Versions

| Version | Anchors | Status |
|---|---|---|
| **1.0.0** | Named historical episodes and approximate medians | Frozen. Never recomputed. |
| **1.1.0** | Empirical percentiles of each input's full FRED history | Current. **Needs calibration to publish** — see below. |

v1.0.0's anchors were placed by judgement, so a v1.0.0 subscore of 60 does not
mean "tighter than 60% of history" and the five inputs are not on a common
footing. v1.1.0 fixes both by fitting the anchors to the realised distribution.
Both versions coexist permanently; a citation must name one.

## Rules the code enforces

- **Reproducible.** Every value is recomputable from FRED plus the methodology.
  Rounding is specified to the decimal place, and the index is the sum of the
  *rounded* contributions so the published component table adds up exactly.
- **Publish nothing rather than something wrong.** A missing, stale, non-finite
  or implausible input skips the day entirely. There is no partial value.
- **Never revised.** `index_values` has `PRIMARY KEY (ticker, version,
  obs_date)` with `ON CONFLICT DO NOTHING`, plus `BEFORE UPDATE`/`BEFORE DELETE`
  triggers that `RAISE(ABORT)`. Immutability is enforced by the database.
- **Changes fork.** Any change to inputs, weights or anchors is a new version.
  A correction is a new observation, never an edit.

`node scripts/verify.mjs` checks all of these and fails if any is violated.

---

## Getting started

Requires Node ≥ 22.5 (uses the built-in `node:sqlite`). **No dependencies.**

```bash
node scripts/verify.mjs      # invariant suite — run this first
npm test                     # unit tests
npm run demo                 # end-to-end on synthetic data, no network needed
```

`npm run demo` generates fake inputs, calibrates, publishes both versions and
renders a site into `demo/` so you can see the whole pipeline work offline.
Everything it produces is quarantined and clearly marked; none of it is real.

### Publishing the real index

```bash
node scripts/calibrate.mjs               # 1. fit v1.1.0 anchors to full FRED history
node scripts/publish.mjs --backfill      # 2. compute and append the series
node scripts/build-site.mjs              # 3. render public/ + downloads
node scripts/verify.mjs                  # 4. re-check every invariant
node scripts/serve.mjs                   # optional: preview at localhost:8080
```

Step 1 needs outbound access to `fred.stlouisfed.org`. Without it, download each
series from `https://fred.stlouisfed.org/series/<ID>` as `<ID>.csv` into a
directory and pass `--from-dir <dir>` to both `calibrate.mjs` and `publish.mjs`
— the whole pipeline runs offline from those files.

**v1.1.0 publishes nothing until `data/calibration/v1.1.0.json` exists.** That
artifact holds the fitted anchors together with the FRED vintage, observation
counts and a SHA-256 of every source CSV. It is committed, so the anchors are
reviewable in a diff, and hashed, so anyone can prove their download matches.
Until it is generated, v1.1.0 reports `pending_calibration` and refuses to
compute — it does **not** fall back to v1.0.0's anchors.

## Layout

```
src/engine/       creditIndex.js (computeIndex, bandOf), specs/, series.js, percentile.js
src/data/fred.js  FRED reader — network or local CSVs
src/store/        index_values, append-only and trigger-enforced
src/site/         page renderer, procedural illustrations, PNG encoder
api/              public read endpoint
scripts/          calibrate, publish, build-site, serve, demo, verify
docs/             the methodology
```

## Citation

```
AP Credit Cycle Index (APCCI), version <version>, observation <YYYY-MM-DD>,
value <v>. Methodology: docs/APCCI_METHODOLOGY.md.
```

## Attribution

Data from the Federal Reserve Bank of St. Louis (FRED). ICE BofA index data
© ICE Data Indices, LLC · NFCI © Federal Reserve Bank of Chicago · VIX © Cboe
Global Markets. APCCI is not affiliated with or endorsed by any of them.

Page fonts are IBM Plex Mono and Playfair Display, self-hosted under the SIL
Open Font License.
