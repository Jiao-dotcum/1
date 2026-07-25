# AP Credit Cycle Index (APCCI) — Methodology

**Ticker:** `APCCI`
**Versions:** 1.0.0 (frozen), 1.1.0 (current)
**Scale:** 0–100, where 0 is the loosest credit conditions on the reference scale and 100 the tightest.

APCCI is a daily reading of US credit conditions built from five public series
published on FRED. It exists to be checked: every published value can be
reproduced by hand from FRED and this document in a few minutes, with no access
to this repository's code and no proprietary data.

> **APCCI measures conditions, not returns.** It is not a forecast, not a
> trading signal, not a return series, and not investment advice. No claim is
> made anywhere in this project that any level of the index precedes,
> predicts, or is associated with any investment outcome. A reading of 80 means
> credit conditions resemble historically tight ones; it means nothing else.

---

## 1. Summary of the calculation

1. Take the current reading of each of five FRED series.
2. Map each reading onto a 0–100 **subscore** through that series' anchor
   table, by piecewise-linear interpolation, clamped at both ends.
3. Multiply each subscore by its fixed weight and sum. That is the index.

The anchor tables are the only thing that differs between versions 1.0.0 and
1.1.0. The inputs, the weights, the interpolation and the rounding are
identical in both.

---

## 2. Scale, orientation and bands

Every input is oriented so that **a higher reading means tighter credit**.
Spreads widen under stress, NFCI rises under stress, VIX rises under stress —
so no input needs sign-flipping, and the composite inherits the orientation
directly.

| Band | Range | Reading |
|---|---|---|
| Benign | 0 ≤ v < 20 | Conditions at the loose end of the reference scale |
| Normal | 20 ≤ v < 40 | Unremarkable |
| Watch | 40 ≤ v < 60 | Middle of the scale |
| Stress | 60 ≤ v < 80 | Conditions resemble historically tight periods |
| Crisis | 80 ≤ v ≤ 100 | Conditions resemble the tightest in the sample |

The bands are labels over the same number, not a separate model. The top band
includes 100.

---

## 3. Inputs

All five are published by FRED and are free to download without an API key.

| Key | FRED series | Description | Unit | Weight | Max staleness | Plausible range |
|---|---|---|---|---|---|---|
| `hy_oas` | [`BAMLH0A0HYM2`](https://fred.stlouisfed.org/series/BAMLH0A0HYM2) | ICE BofA US High Yield OAS | percent | 0.30 | 5 days | 0.5 – 30 |
| `ccc_oas` | [`BAMLH0A3HYC`](https://fred.stlouisfed.org/series/BAMLH0A3HYC) | ICE BofA US CCC & Lower OAS | percent | 0.20 | 5 days | 1 – 60 |
| `ig_oas` | [`BAMLC0A0CM`](https://fred.stlouisfed.org/series/BAMLC0A0CM) | ICE BofA US Corporate OAS | percent | 0.20 | 5 days | 0.2 – 12 |
| `nfci` | [`NFCI`](https://fred.stlouisfed.org/series/NFCI) | Chicago Fed National Financial Conditions Index | index | 0.20 | 10 days | −3 – 6 |
| `vix` | [`VIXCLS`](https://fred.stlouisfed.org/series/VIXCLS) | CBOE Volatility Index, close | index | 0.10 | 5 days | 5 – 100 |

Weights sum to exactly 1.000. They are checked at every computation and by
`scripts/verify.mjs`.

**Why these five.** Three spread measures cover the credit stack from
investment grade through the riskiest high yield, which is where credit stress
shows up first and most legibly. NFCI adds the broader financial-conditions
picture — funding, leverage and non-credit markets — so the index is not purely
a spread composite. VIX carries a small weight as a fast-moving cross-check
that turns before spreads do. The 30/20/20/20/10 split reflects that intent:
the credit block carries 0.70, the conditions block 0.20, the volatility
cross-check 0.10. These weights were chosen, not fitted, and they are fixed for
the life of a version.

**Staleness.** NFCI is weekly, so it is allowed to be 10 days old. The others
are business-daily and are allowed 5 days, which covers holiday weekends. An
input older than its allowance counts as missing.

---

## 4. Version 1.0.0 anchors — and their known weakness

The v1.0.0 anchor tables were set from **named historical episodes and
approximate medians**: the 2007 pre-crisis lows at the bottom, the 2008–09
peaks at the top, and roughly-remembered mid-cycle levels in between.

| Reading → subscore | `hy_oas` | `ccc_oas` | `ig_oas` | `nfci` | `vix` |
|---|---|---|---|---|---|
| → 0 | 2.33 | 4.00 | 0.51 | −1.00 | 9.14 |
| → 20 | 3.50 | 6.50 | 0.90 | −0.60 | 13.00 |
| → 40 | 4.50 | 9.00 | 1.30 | 0.00 | 17.50 |
| → 60 | 6.00 | 13.00 | 1.80 | 0.50 | 24.00 |
| → 80 | 10.00 | 20.00 | 3.00 | 1.50 | 40.00 |
| → 100 | 21.82 | 44.00 | 6.18 | 3.50 | 82.69 |

**This is a real weakness, and it is why 1.1.0 exists.** The endpoints are
defensible — they are actual historical extremes — but the interior knots were
not fitted to anything. They were placed by judgement about where "normal"
sits. Two consequences follow:

- **A v1.0.0 subscore has no distributional meaning.** A subscore of 60 does
  not mean "tighter than 60% of history". It means "between two hand-picked
  reference points", and the spacing between those points was never checked
  against how much time the series actually spends in each interval.
- **The five inputs are not on a common footing.** Because each table was
  eyeballed separately, a subscore of 50 on `hy_oas` and a subscore of 50 on
  `vix` do not describe equally unusual conditions. Weighting them as if they
  did is an unstated assumption, and it is wrong by an unknown amount.

Version 1.0.0 is nonetheless preserved exactly as published, forever. Values
computed under it are final and are never recomputed under the newer anchors
(§7).

---

## 5. Version 1.1.0 calibration

Version 1.1.0 replaces the hand-set anchors with the **realised percentiles of
each input over its full published history**, so that a subscore is the
historical percentile of that reading within its own series, and the index
approximates the historical percentile of credit conditions.

This fixes both problems in §4 directly. A 1.1.0 subscore of 60 means the
reading is at the 60th percentile of that series' own history, and a subscore
of 50 means the same thing on every input, so the weighted average is a
weighted average of comparable quantities.

### 5.1 Procedure

1. Download the **entire** published history of each of the five series from
   FRED — every observation, not a recent window. Missing observations (FRED
   writes them as `.`) are dropped, never interpolated or carried forward.
2. For each series, compute the percentiles on the grid
   **0, 5, 25, 50, 75, 90, 95, 99, 100** using the **type-7 quantile
   estimator** (the R and NumPy default): with the sample sorted ascending and
   *n* observations, the *p*-th percentile sits at position
   `h = (n − 1) · p / 100`, linearly interpolated between the two neighbouring
   order statistics.
3. Each percentile becomes an anchor knot `[reading → percentile]`. The knot
   list is the anchor table.
4. Where two grid points land on the same reading (a plateau in the data), only
   the highest percentile for that reading is kept, so the knot list is
   strictly increasing in the reading and the interpolation stays unambiguous.
   A reading on a plateau therefore scores as "at or below this reading", the
   standard percentile-rank convention.

The grid is denser in the upper tail (90, 95, 99, 100) because credit spreads
spend most of their time in a narrow range and almost all of the information is
in the stressed tail. A uniform grid would resolve the crowded middle finely and
the part that matters coarsely.

### 5.2 Weights are unchanged

The calibration changes the anchor tables only. The weights in §3 are identical
in 1.0.0 and 1.1.0, so the difference between the two series is attributable
entirely to the anchors.

### 5.3 The calibration artifact

The anchors are not hand-written into source. They are generated by

```
node scripts/calibrate.mjs                  # from FRED
node scripts/calibrate.mjs --from-dir raw   # from CSVs downloaded by hand
```

into **`data/calibration/v1.1.0.json`**, which records, for every series: the
FRED series ID, the anchor knots, the observation count, the first and last
observation dates, the source URL, and a **SHA-256 of the exact CSV bytes** the
percentiles were computed from. The vintage date of the pull is recorded at the
top level.

That artifact *is* the calibration. It is committed, so the anchors are visible
in a diff rather than buried in a build step, and it is hashed, so a third
party can prove their download of FRED matches the one the published anchors
came from. `scripts/verify.mjs` recomputes the anchors from the artifact's own
percentile grid and fails if they disagree.

Because the anchors define what a published number means, `calibrate.mjs`
**refuses to overwrite an existing artifact whose anchors would change**. A
different mapping is a different version (§7), never an edit to a live one.

### 5.4 Calibration status

> **Not yet generated.** The anchors for 1.1.0 require the full FRED history of
> all five inputs. Until `data/calibration/v1.1.0.json` exists, version 1.1.0
> is *defined but uncalibrated*: it computes nothing, publishes nothing, and
> reports `status: pending_calibration` from the API and on the public page.
>
> It explicitly does **not** fall back to the v1.0.0 anchors. A value computed
> from one version's anchors and published under another version's name would
> be exactly the kind of mislabelled number this project forbids (§8).
>
> Once the artifact is generated, this section should be replaced with the
> vintage date, the per-series observation counts and date ranges, and the
> resulting anchor tables, all of which the artifact already contains.

---

## 6. Computation and rounding

The arithmetic is specified to the last decimal place, because "reproducible by
hand" is only true if two people rounding differently get the same answer.

For each input *i*:

```
subscore_i     = interpolate(anchors_i, reading_i)   clamped to [0, 100]
subscore_i     = round(subscore_i, 2)
contribution_i = round(weight_i × subscore_i, 2)
```

and the index is

```
APCCI = round( Σ contribution_i , 2 )
```

- **Interpolation** is linear between the two bracketing knots. Below the first
  knot the subscore is the first knot's value; above the last knot it is the
  last knot's value. Readings outside the anchor range are clamped, never
  extrapolated.
- **Rounding** is half-away-from-zero at each step, applied in the order above.
- The index is the sum of the **rounded** contributions, not the rounded sum of
  exact contributions. This is deliberate: it means the component table shown
  on the public page adds up to the published number exactly, with no residual
  to explain.

---

## 7. Versioning and revisions

**Published values are never revised.** Once `(APCCI, version, obs_date)` has a
value, that value is final. This is enforced in the database, not by
convention: the `index_values` table has `PRIMARY KEY (ticker, version,
obs_date)` with `INSERT ... ON CONFLICT DO NOTHING`, plus `BEFORE UPDATE` and
`BEFORE DELETE` triggers that `RAISE(ABORT)`. There is no code path that
rewrites a published number.

**Any change to inputs, weights or anchors is a new version.** Never an edit.
The rule covers: adding, removing or substituting a series; changing a weight;
changing an anchor table; changing the interpolation or rounding; changing the
staleness or plausibility gates.

**A correction is a new observation, not an edit.** If a published value is
found to be wrong — a bad input vintage, a bug in the mapping — the response is
to publish a new version alongside the old one and document the defect. The
erroneous value stays visible under its original version. Anyone who cited it
can still resolve exactly what they cited.

**Versions coexist permanently.** 1.0.0 and 1.1.0 are both live series. Neither
supersedes the other in the data; 1.1.0 is simply the version new observations
are published under by default. A citation must name a version — a bare APCCI
value with a date is ambiguous between them.

**Upstream revisions do not propagate.** FRED revises some of these inputs.
APCCI is computed from the vintage available on the observation date, and a
later revision to an input does not change an already-published index value.

---

## 8. When APCCI publishes nothing

An incomplete or implausible input set **publishes nothing for that date**. It
never publishes a partial value, a value computed from four of the five inputs,
or a value carried forward from the previous day under the same name. Any of
those would be a different index wearing the APCCI name.

A date is skipped when any input:

- has no observation at or before the date;
- has an observation older than its staleness allowance (§3);
- is non-numeric or non-finite;
- falls outside its plausible range (§3) — which catches transcription errors,
  unit mix-ups and corrupted vintages;
- is dated after the observation date.

The publisher logs the reason for every skipped date. A skipped date is a
normal outcome, not an error: weekends and holidays produce them routinely.

Version 1.1.0 additionally publishes nothing while it is uncalibrated (§5.4).

---

## 9. Reproducing a value by hand

Everything needed is public. To check any published value:

1. Look up the value and its `obs_date` in `apcci-<version>.csv`, or from
   `GET /api/index-value?version=<v>`.
2. Open each of the five FRED series in §3 and read its value for that date, or
   the most recent prior business day if the date is not a print for that
   series. The published component table shows exactly which observation date
   was used for each input.
3. Find the two anchor knots each reading falls between, in §4 for version
   1.0.0 or in the calibration artifact for 1.1.0, and interpolate linearly.
4. Round each subscore to 2 decimal places, multiply by the weight from §3, and
   round each product to 2 decimal places.
5. Sum the five contributions. That is the published value.

The public page shows steps 2–5 for the current observation, including which
two anchor knots each reading fell between, so the check is a matter of
confirming arithmetic rather than reconstructing it.

---

## 10. Access

| What | Where |
|---|---|
| Public page | `public/index.html` (per version: `v<version>.html`) |
| Latest value | `GET /api/index-value` |
| Specific version | `GET /api/index-value?version=1.0.0` |
| Full series (JSON) | `GET /api/index-value?history=1` |
| Full series (CSV) | `GET /api/index-value?history=1&format=csv` |
| Spec, weights, anchors | `GET /api/index-value?spec=1` |
| Bulk download | `apcci-<version>.csv`, `apcci-<version>.json`, `apcci-all.csv` |

CSV columns are `ticker,version,obs_date,value,band`. The JSON download
additionally carries the full component breakdown for every observation, so the
arithmetic in §9 can be checked for any historical date, not only the latest.

No authentication, no rate limit, CORS open. Every response names the version,
because a value without its version is not a citation.

### Citation

```
AP Credit Cycle Index (APCCI), version <version>, observation <YYYY-MM-DD>,
value <v>. Methodology: docs/APCCI_METHODOLOGY.md. Retrieved from
apcci-<version>.csv.
```

---

## 11. Sources and attribution

Data retrieved from the Federal Reserve Bank of St. Louis (FRED).

- ICE BofA index data © ICE Data Indices, LLC, used with permission from FRED;
  see the source page of each series for ICE's terms.
- NFCI © Federal Reserve Bank of Chicago.
- VIX © Cboe Global Markets, Inc.

APCCI is not affiliated with, endorsed by, or produced in cooperation with any
of these providers. It is a derived indicator computed from their published
data.

---

## 12. Limitations

- **The sample is short and crisis-poor.** These series begin in the mid-1990s
  (VIX in 1990, NFCI in 1971 but only the others are joint-limiting). That
  window contains few genuine credit crises, so the upper tail of the v1.1.0
  calibration rests on a small number of episodes and the 99th and 100th
  percentile anchors are effectively determined by 2008 and 2020.
- **Percentiles are backward-looking by construction.** A reading tighter than
  anything in the sample clamps at 100 and cannot be distinguished from any
  other reading beyond the maximum. The index cannot express "worse than the
  worst observed".
- **The calibration has a vintage.** Anchors are fixed at the vintage recorded
  in the artifact and do not roll forward as new data arrives. This is
  intentional — rolling anchors would silently restate the meaning of past
  values — but it means the percentile interpretation drifts slowly as history
  accumulates beyond the vintage.
- **The weights are judgement, not estimation.** §3 explains the reasoning, but
  they are not fitted, and no claim is made that they are optimal for any
  purpose.
- **The inputs overlap.** Three spread series, NFCI (which itself includes
  credit-spread components) and VIX are strongly correlated in stress. The
  index is not a set of independent signals and the weights should not be read
  as if it were.
- **It describes conditions, not consequences.** Repeating §0: no performance
  claim is made or implied, at any level of the index.
