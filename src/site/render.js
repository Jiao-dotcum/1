/**
 * Renders the public APCCI page. Pure: data in, HTML string out, no I/O.
 *
 * The page has one job — let a stranger who has never seen this project check
 * today's number against FRED in about five minutes. So the component table
 * shows the whole arithmetic (reading, the two anchor knots it was interpolated
 * between, the subscore, the weight, the contribution) and the contributions
 * add up to the headline number exactly, by construction.
 *
 * Visual language: a single electric blue over paper, high-contrast didone
 * serif for display, wide-tracked uppercase mono for every label and number,
 * boxed tags, bracketed section indices, dotted leaders, corner ticks and a
 * heavy page frame.
 *
 * Chart: one series over time, so no legend — the title names it. The y-axis is
 * pinned to the full 0-100 scale and never truncated. The five bands are
 * ordinal, so they are zoned with one hue at increasing opacity (never a
 * rainbow) and each zone is labelled in words, so the band is never carried by
 * colour alone.
 */
import { BANDS, bracketFor } from '../engine/creditIndex.js';
import { PLATES } from './art.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (n, dp = 2) => Number(n).toFixed(dp);

/** Ordinal band tint: one hue, increasing with severity. */
const BAND_TINT = [0.03, 0.06, 0.095, 0.135, 0.18];

const FONTS = `
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:400;font-display:swap;
  src:url("fonts/ibm-plex-mono-normal-400.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:500;font-display:swap;
  src:url("fonts/ibm-plex-mono-normal-500.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:600;font-display:swap;
  src:url("fonts/ibm-plex-mono-normal-600.woff2") format("woff2")}
@font-face{font-family:"Playfair Display";font-style:normal;font-weight:400 700;font-display:swap;
  src:url("fonts/playfair-display-normal-400.woff2") format("woff2")}
`;

const CSS = `
:root{
  color-scheme:light;
  --blue:#1f1fe6; --blue-deep:#1212a8; --blue-soft:#6a6aff;
  --paper:#fdfdff; --tint:#f2f2ff; --ink:#12123a; --rule:rgba(31,31,230,.28);
  --edge:#1f1fe6;
  --frame:14px;
  --serif:"Playfair Display",Georgia,"Times New Roman",serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
}
@media (prefers-color-scheme:dark){
  :root:where(:not([data-theme="light"])){
    color-scheme:dark;
    --blue:#7b7bff; --blue-deep:#a6a6ff; --blue-soft:#4a4ad0;
    --paper:#0b0b1c; --tint:#14142e; --ink:#e6e6ff; --rule:rgba(123,123,255,.32);
    --edge:#1c1c6e;
  }
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --blue:#7b7bff; --blue-deep:#a6a6ff; --blue-soft:#4a4ad0;
  --paper:#0b0b1c; --tint:#14142e; --ink:#e6e6ff; --rule:rgba(123,123,255,.32);
  --edge:#1c1c6e;
}
*{box-sizing:border-box}
html{background:var(--edge)}
body{margin:0;background:var(--edge);font-family:var(--sans);font-size:14.5px;line-height:1.6;
  color:var(--ink);-webkit-font-smoothing:antialiased}
.sheet{background:var(--paper);margin:var(--frame);padding:44px clamp(20px,5vw,64px) 0;position:relative}
.sheet::before,.sheet::after{content:"";position:absolute;width:14px;height:14px;border:2px solid var(--edge)}
.sheet::before{top:10px;left:10px;border-right:0;border-bottom:0}
.sheet::after{bottom:10px;right:10px;border-left:0;border-top:0}
a{color:var(--blue);text-decoration:none;border-bottom:1px solid var(--rule)}
a:hover{border-bottom-color:var(--blue)}
h1,h2,h3{margin:0;font-family:var(--serif);font-weight:400;letter-spacing:.005em;
  text-transform:uppercase;color:var(--blue);line-height:1.02}
p{max-width:70ch}

/* boxed uppercase mono tag */
.tag{display:inline-block;font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.16em;
  text-transform:uppercase;color:var(--blue);border:1px solid var(--blue);padding:3px 8px 2px;
  white-space:nowrap}
.tag.fill{background:var(--blue);color:var(--paper)}
.idx{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;color:var(--blue);opacity:.75;
  text-transform:uppercase}

header{border-bottom:2px solid var(--blue);padding-bottom:26px}
header h1{font-size:clamp(30px,5.6vw,60px);margin:16px 0 0;max-width:19ch}
header .lede{margin:18px 0 0;color:var(--ink);opacity:.85;max-width:68ch}
.vtabs{display:flex;gap:8px;margin-top:22px;flex-wrap:wrap}

section{padding:34px 0;border-bottom:1px solid var(--rule)}
.sechead{display:flex;align-items:baseline;gap:14px;margin-bottom:20px;flex-wrap:wrap}
.sechead h2{font-size:clamp(19px,2.6vw,27px)}
.sechead .idx{flex:none}
.sechead .right{margin-left:auto}

/* hero */
.hero{display:grid;grid-template-columns:minmax(0,auto) minmax(240px,1fr);gap:34px;align-items:end}
.heroval{font-family:var(--serif);font-size:clamp(76px,15vw,150px);line-height:.82;color:var(--blue);
  font-feature-settings:"lnum" 1}
.herotags{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
.stats{list-style:none;margin:0;padding:0}
.stats li{display:flex;align-items:baseline;gap:8px;font-family:var(--mono);font-size:12px;
  letter-spacing:.06em;padding:5px 0;text-transform:uppercase}
.stats .k{color:var(--blue);opacity:.8;white-space:nowrap}
.stats .fill{flex:1;border-bottom:1px dotted var(--rule);transform:translateY(-3px);min-width:14px}
.stats .v{font-weight:500;white-space:nowrap}

figure{margin:0}
svg{display:block;width:100%;height:auto}
figcaption{font-family:var(--mono);font-size:11px;letter-spacing:.05em;color:var(--blue);opacity:.8;
  margin-top:12px;text-transform:uppercase;line-height:1.7}

.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-family:var(--mono);font-size:12.5px;
  font-variant-numeric:tabular-nums;min-width:660px}
th,td{text-align:right;padding:11px 14px;border-bottom:1px solid var(--rule);white-space:nowrap;
  vertical-align:top}
th:first-child,td:first-child{text-align:left;white-space:normal}
thead th{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);font-weight:500;
  border-bottom:1px solid var(--blue)}
tfoot td{border-top:2px solid var(--blue);border-bottom:0;font-weight:600;color:var(--blue);
  font-size:13.5px;text-transform:uppercase;letter-spacing:.06em}
td .sub{display:block;font-size:10.5px;letter-spacing:.04em;color:var(--blue);opacity:.7;
  white-space:normal;margin-top:4px;text-transform:uppercase}
td a{border-bottom-style:dotted}

.plates{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:28px}
.plate{margin:0}
.plate h3{font-size:clamp(19px,2.3vw,27px);margin:9px 0 15px;max-width:14ch}
.plate img{width:100%;height:auto;display:block;border:1px solid var(--rule);background:var(--tint)}
.platecap{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--blue);opacity:.82;line-height:1.85;margin:14px 0 0;max-width:none}

.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px}
.card{border:1px solid var(--blue);padding:15px 17px;background:var(--tint)}
.card .k{font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--blue);opacity:.8}
.card .v{font-family:var(--mono);font-size:13px;margin-top:9px;word-break:break-all}
.card .v a{border-bottom:1px solid var(--rule)}

.note{border:1px solid var(--blue);border-left:5px solid var(--blue);padding:16px 18px;background:var(--tint)}
.note.loud{background:var(--blue);color:var(--paper);border-color:var(--blue)}
.note.loud strong{color:var(--paper)}
ol.steps{padding-left:0;list-style:none;counter-reset:s;max-width:76ch;margin:0}
ol.steps li{counter-increment:s;position:relative;padding-left:38px;margin-bottom:13px}
ol.steps li::before{content:"[" counter(s) "]";position:absolute;left:0;top:1px;font-family:var(--mono);
  font-size:11px;letter-spacing:.08em;color:var(--blue)}
code{font-family:var(--mono);font-size:12.5px;border:1px solid var(--rule);padding:1px 5px;background:var(--tint)}
pre{font-family:var(--mono);font-size:12px;border:1px solid var(--blue);background:var(--tint);
  padding:16px 18px;overflow-x:auto;margin:0;line-height:1.75}
.fine{font-family:var(--mono);font-size:11px;letter-spacing:.05em;color:var(--blue);opacity:.78;
  text-transform:uppercase;line-height:1.75;margin-top:14px;max-width:105ch}

footer{padding:30px 0 0}
.wordmark{font-family:var(--serif);font-size:clamp(88px,25vw,300px);line-height:.74;color:var(--blue);
  text-transform:uppercase;margin:26px -.06em -.16em -.055em;overflow:hidden;user-select:none}
.colophon{font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--blue);opacity:.8;line-height:2;padding-bottom:22px}

#tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .08s;background:var(--blue);
  color:var(--paper);padding:7px 11px;font-family:var(--mono);font-size:11.5px;letter-spacing:.07em;
  text-transform:uppercase;z-index:9;white-space:nowrap}
@media (max-width:640px){
  .hero{grid-template-columns:1fr;gap:20px;align-items:start}
  .sheet{padding-top:30px}
}
`;

/** Inline SVG line chart. `rows` ascending by obs_date. */
function chartSvg(rows) {
  const W = 1000, H = 320, L = 40, R = 84, T = 12, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const ts = rows.map((r) => Date.parse(`${r.obs_date}T00:00:00Z`));
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const span = Math.max(1, t1 - t0);
  const x = (t) => L + ((t - t0) / span) * iw;
  const y = (v) => T + (1 - Math.min(100, Math.max(0, v)) / 100) * ih;

  const zones = BANDS.map(
    (b, i) =>
      `<rect x="${L}" y="${y(b.max).toFixed(1)}" width="${iw}" height="${(y(b.min) - y(b.max)).toFixed(1)}" ` +
      `fill="var(--blue)" opacity="${BAND_TINT[i]}"/>` +
      `<text x="${W - R + 11}" y="${((y(b.min) + y(b.max)) / 2 + 3.5).toFixed(1)}" font-size="10.5" ` +
      `letter-spacing="1.6" fill="var(--blue)" opacity="0.85" font-family="var(--mono)">` +
      `${b.name.toUpperCase()}</text>`,
  ).join('');

  const grid = [0, 20, 40, 60, 80, 100]
    .map(
      (v) =>
        `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" ` +
        `stroke="var(--blue)" stroke-width="1" opacity="0.22"/>` +
        `<text x="${L - 10}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" ` +
        `fill="var(--blue)" opacity="0.8" font-family="var(--mono)">${v}</text>`,
    )
    .join('');

  const years = [...new Set(rows.map((r) => r.obs_date.slice(0, 4)))];
  const step = Math.ceil(years.length / 10) || 1;
  const xticks = years
    .filter((_, i) => i % step === 0)
    .map((yr) => {
      const t = Date.parse(`${yr}-01-01T00:00:00Z`);
      if (t < t0 || t > t1) return '';
      return (
        `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${T + ih}" y2="${T + ih + 5}" ` +
        `stroke="var(--blue)" stroke-width="1" opacity="0.45"/>` +
        `<text x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" ` +
        `letter-spacing="1" fill="var(--blue)" opacity="0.8" font-family="var(--mono)">${yr}</text>`
      );
    })
    .join('');

  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(r.value).toFixed(1)}`).join('');
  const last = rows[rows.length - 1];
  const lx = x(t1), ly = y(last.value);

  return `<svg viewBox="0 0 ${W} ${H}" role="img"
  aria-label="APCCI published history from ${esc(rows[0].obs_date)} to ${esc(
    last.obs_date,
  )} on a 0 to 100 scale, latest value ${fmt(last.value)}">
  ${zones}${grid}
  <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--blue)" stroke-width="1.5"/>
  <line x1="${L}" x2="${L}" y1="${T}" y2="${T + ih}" stroke="var(--blue)" stroke-width="1.5"/>
  ${xticks}
  <path d="${d}" fill="none" stroke="var(--blue)" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round"/>
  <line id="cross" x1="0" x2="0" y1="${T}" y2="${T + ih}" stroke="var(--blue)" stroke-width="1"
        stroke-dasharray="3 3" opacity="0"/>
  <circle id="cdot" r="4.5" fill="var(--blue)" stroke="var(--paper)" stroke-width="2" opacity="0"/>
  <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" fill="var(--blue)"
          stroke="var(--paper)" stroke-width="2"/>
  <rect id="hit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent"/>
</svg>`;
}

function componentTable(latest, spec) {
  const rows = latest.components
    .map((c) => {
      const anchors = spec.anchors?.[c.key];
      const br = anchors ? bracketFor(anchors, c.observation) : null;
      const between = br
        ? `Anchors ${fmt(br[0][0], 2)}&rarr;${fmt(br[0][1], 1)} &middot; ${fmt(br[1][0], 2)}&rarr;${fmt(br[1][1], 1)}`
        : 'Clamped at end of anchor table';
      return `<tr>
  <td><a href="https://fred.stlouisfed.org/series/${esc(c.fred_id)}">${esc(c.fred_id)}</a>
      <span class="sub">${esc(c.label)}</span></td>
  <td>${fmt(c.observation, 2)}${c.unit === 'percent' ? '%' : ''}</td>
  <td>${esc(c.observation_date)}</td>
  <td>${fmt(c.subscore)}<span class="sub">${between}</span></td>
  <td>${fmt(c.weight, 2)}</td>
  <td>${fmt(c.contribution)}</td>
</tr>`;
    })
    .join('');

  return `<div class="tablewrap"><table>
<thead><tr>
  <th>Input &mdash; FRED series</th><th>Reading</th><th>As of</th>
  <th>Subscore 0&ndash;100</th><th>&times; Weight</th><th>= Contribution</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
  <td>APCCI ${esc(latest.version)} &mdash; ${esc(latest.obs_date)}</td>
  <td colspan="4"></td><td>${fmt(latest.value)}</td>
</tr></tfoot>
</table></div>`;
}

const stat = (k, v) =>
  `<li><span class="k">${k}</span><span class="fill"></span><span class="v">${v}</span></li>`;

/**
 * @param {object} d
 * @param {string} d.version           version being displayed
 * @param {object|null} d.latest       newest published row, or null
 * @param {Array} d.history            ascending published rows for this version
 * @param {object} d.spec              spec for this version
 * @param {Array} d.versions           [{version, n, first_obs, last_obs, status}]
 * @param {string|null} d.banner       loud warning shown above everything
 * @param {string} d.generatedAt
 */
export function renderPage(d) {
  const { version, latest, history, spec, versions, banner, generatedAt } = d;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const delta = latest && prev ? latest.value - prev.value : null;
  let n = 0;
  const num = () => `[${String(++n).padStart(2, '0')}]`;

  const vtabs = versions
    .map(
      (v) =>
        `<a class="tag${v.version === version ? ' fill' : ''}" ` +
        `href="${v.version === d.defaultVersion ? 'index.html' : `v${v.version}.html`}" ` +
        `aria-current="${v.version === version}">v${esc(v.version)} &nbsp;${v.n} obs</a>`,
    )
    .join('');

  const bannerHtml = banner ? `<div class="note loud" style="margin-bottom:26px">${banner}</div>` : '';

  const heroHtml = latest
    ? `<div class="hero">
  <div>
    <div class="herotags"><span class="tag fill">APCCI ${esc(version)}</span>
      <span class="tag">Band &nbsp;${esc(latest.band)}</span></div>
    <div class="heroval">${fmt(latest.value)}</div>
  </div>
  <ul class="stats">
    ${stat('Observation date', esc(latest.obs_date))}
    ${stat('Change from prior', delta === null ? '&mdash;' : `${delta >= 0 ? '+' : '&minus;'}${fmt(Math.abs(delta))}`)}
    ${stat('Published observations', history.length)}
    ${stat('Scale', '0 loose &rarr; 100 tight')}
  </ul>
</div>`
    : `<div class="note"><strong>No values are published for version ${esc(version)}.</strong><br>
${esc(spec.note ?? 'Run the publish pipeline to create the series.')}<br><br>
An empty series is the correct state here rather than a placeholder number: an index that has not been
computed from complete inputs must show nothing at all.</div>`;

  const chartHtml = history.length > 1
    ? `<figure>${chartSvg(history)}
<figcaption>Published APCCI ${esc(version)} &middot; ${esc(history[0].obs_date)} to ${esc(
        history[history.length - 1].obs_date,
      )} &middot; ${history.length} observations on the full 0&ndash;100 scale.<br>
Higher means tighter credit conditions. Values are never revised once published.</figcaption></figure>`
    : `<div class="note">A chart needs at least two published observations. There ${
        history.length === 1 ? 'is 1' : 'are 0'
      }.</div>`;

  const verifySteps = latest
    ? `<ol class="steps">
<li>Open each FRED series linked in the table above and read its value for <code>${esc(
        latest.obs_date,
      )}</code>, or the most recent prior business day &mdash; the &ldquo;as of&rdquo; column shows which date was used.</li>
<li>Check it matches the Reading column. If FRED has since revised an input, the published value still
stands: APCCI is computed from the vintage available on the observation date and is never restated.</li>
<li>Find the two anchor knots the reading falls between (shown under each subscore, and listed in full in
the methodology) and interpolate linearly between them. Round the subscore to 2 decimal places.</li>
<li>Multiply each subscore by its weight and round the product to 2 decimal places.</li>
<li>Add the five contributions. The total is the published value, ${fmt(
        latest.value,
      )} &mdash; the Contribution column sums to it exactly.</li>
</ol>`
    : '<p>Verification steps appear once a value is published.</p>';

  const versionRows = versions
    .map(
      (v) => `<tr><td>${esc(v.version)}<span class="sub">${esc(v.anchor_basis ?? '')}</span></td>
<td>${esc(v.status)}</td><td>${v.n}</td><td>${esc(v.first_obs ?? '—')}</td><td>${esc(v.last_obs ?? '—')}</td></tr>`,
    )
    .join('');

  const dataJson = JSON.stringify(history.map((r) => [r.obs_date, r.value, r.band]));

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APCCI ${esc(version)} &mdash; AP Credit Cycle Index</title>
<meta name="description" content="AP Credit Cycle Index (APCCI): a published, citable 0-100 index of US credit conditions built from five public FRED series. Every value is reproducible by hand.">
<style>${FONTS}${CSS}</style>
</head><body>
<div class="sheet">
${bannerHtml}
<header>
  <span class="tag fill">AP Credit Cycle Index</span>
  <span class="tag">Ticker ${esc(d.ticker ?? 'APCCI')}</span>
  <h1>A 0&ndash;100 reading of US credit conditions</h1>
  <p class="lede">Computed each business day from five public FRED series. 0 is the loosest credit
  conditions on the reference scale, 100 the tightest. Every published value is reproducible by hand from
  FRED and the methodology, and values are never revised &mdash; a correction is a new observation under a
  new version, never an edit to an old one. <strong>APCCI measures conditions, not returns.</strong> It is
  not a forecast, not investment advice, and carries no performance claim.</p>
  <nav class="vtabs">${vtabs}</nav>
</header>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Current value</h2>
    <span class="idx right">Generated ${esc(generatedAt)}</span></div>
  ${heroHtml}
</section>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Published history</h2>
    <span class="idx right">Append-only &middot; never restated</span></div>
  ${chartHtml}
</section>

${latest ? `<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>How today&rsquo;s number is built</h2>
    <span class="idx right">The arithmetic, in full</span></div>
  ${componentTable(latest, spec)}
  <p class="fine">Subscores round to 2dp; each contribution is its weight times the rounded subscore,
  rounded to 2dp; the index is the sum of the rounded contributions &mdash; so this column adds up
  exactly, with no hidden precision.</p>
</section>` : ''}

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Verify it yourself</h2>
    <span class="idx right">About five minutes</span></div>
  ${verifySteps}
</section>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>What the index promises</h2>
    <span class="idx right">Three rules, no exceptions</span></div>
  <div class="plates">${PLATES.map(
    (p, i) => `<figure class="plate">
    <div class="idx">#${i + 1} &nbsp;${esc(p.tag)}</div>
    <h3>${esc(p.title)}</h3>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="art/${p.name}-dark.png">
      <img src="art/${p.name}-light.png" alt="" aria-hidden="true" width="620" height="400" loading="lazy">
    </picture>
    <p class="platecap">${esc(p.caption)}</p>
  </figure>`,
  ).join('')}</div>
</section>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Download the series</h2>
    <span class="idx right">No scraping required</span></div>
  <div class="cards">
    <div class="card"><div class="k">CSV &middot; this version</div>
      <div class="v"><a href="apcci-${esc(version)}.csv">apcci-${esc(version)}.csv</a></div></div>
    <div class="card"><div class="k">JSON &middot; this version</div>
      <div class="v"><a href="apcci-${esc(version)}.json">apcci-${esc(version)}.json</a></div></div>
    <div class="card"><div class="k">CSV &middot; all versions</div>
      <div class="v"><a href="apcci-all.csv">apcci-all.csv</a></div></div>
    <div class="card"><div class="k">Spec &middot; weights &amp; anchors</div>
      <div class="v"><a href="spec-${esc(version)}.json">spec-${esc(version)}.json</a></div></div>
  </div>
  <p class="fine">CSV columns: ticker, version, obs_date, value, band. The JSON additionally carries the
  full component breakdown for every observation, so the arithmetic above can be checked for any past
  date, not just today.</p>
</section>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Versions</h2>
    <span class="idx right">Both series coexist permanently</span></div>
  <div class="tablewrap"><table>
    <thead><tr><th>Version</th><th>Status</th><th>Observations</th><th>First</th><th>Last</th></tr></thead>
    <tbody>${versionRows}</tbody>
  </table></div>
  <p class="fine">A change to inputs, weights or anchors creates a new version. Existing versions are
  never recomputed, so a citation naming a version and a date always resolves to the same number.</p>
</section>

<section>
  <div class="sechead"><span class="idx">${num()}</span><h2>Methodology &amp; citation</h2></div>
  <p>The full specification &mdash; inputs, staleness and plausibility gates, anchor tables for every
  version, the v1.1.0 calibration procedure and the revision policy &mdash; is in
  <a href="APCCI_METHODOLOGY.md">APCCI_METHODOLOGY.md</a>.</p>
  <pre>AP Credit Cycle Index (APCCI), version ${esc(version)}, observation ${esc(
    latest?.obs_date ?? 'YYYY-MM-DD',
  )}${latest ? `, value ${fmt(latest.value)}` : ''}.
Retrieved from apcci-${esc(version)}.csv. Methodology: APCCI_METHODOLOGY.md.</pre>
</section>

<footer>
  <div class="colophon">
  APCCI ${esc(version)} &middot; ${history.length} published observations &middot; generated ${esc(generatedAt)}<br>
  Source data: Federal Reserve Bank of St. Louis (FRED). ICE BofA index data &copy; ICE Data Indices, LLC
  &middot; NFCI &copy; Federal Reserve Bank of Chicago &middot; VIX &copy; Cboe Global Markets.<br>
  This index measures credit conditions. It is not a return series, not a forecast, and not investment advice.
  </div>
  <div class="wordmark" aria-hidden="true">APCCI</div>
</footer>
</div>
<div id="tip" role="status"></div>
<script>
(() => {
  const data = ${dataJson};
  const svg = document.querySelector('svg');
  if (!svg || data.length < 2) return;
  const hit = svg.querySelector('#hit'), cross = svg.querySelector('#cross'),
        cdot = svg.querySelector('#cdot'), tip = document.getElementById('tip');
  const L = 40, R = 84, T = 12, B = 30, W = 1000, H = 320;
  const iw = W - L - R, ih = H - T - B;
  const ts = data.map(d => Date.parse(d[0] + 'T00:00:00Z'));
  const t0 = ts[0], span = Math.max(1, ts[ts.length - 1] - t0);
  const px = t => L + ((t - t0) / span) * iw;
  const py = v => T + (1 - Math.min(100, Math.max(0, v)) / 100) * ih;
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    const t = t0 + ((vx - L) / iw) * span;
    let i = 0, best = Infinity;
    for (let k = 0; k < ts.length; k++) {
      const dd = Math.abs(ts[k] - t);
      if (dd < best) { best = dd; i = k; }
    }
    const [date, value, band] = data[i];
    const cx = px(ts[i]), cy = py(value);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '1');
    cdot.setAttribute('cx', cx); cdot.setAttribute('cy', cy); cdot.setAttribute('opacity', '1');
    tip.textContent = date + '  ' + value.toFixed(2) + '  ' + band;
    tip.style.opacity = '1';
    const sx = r.left + (cx / W) * r.width, sy = r.top + (cy / H) * r.height;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 10, Math.max(8, sx + 14)) + 'px';
    tip.style.top = Math.max(8, sy - tip.offsetHeight - 12) + 'px';
  };
  const hide = () => { cross.setAttribute('opacity','0'); cdot.setAttribute('opacity','0'); tip.style.opacity='0'; };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
})();
</script>
</body></html>
`;
}
