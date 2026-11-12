// node build-animals.mjs [--preview <dir>] → ../animals.js
// The animals layer: 15 well-known animals of Bulgaria, each with the part of the country where it really lives, drawn
// as soft blobs a kid can read ("the bear lives here: Rila, Pirin, the Rhodopes, Stara planina").
//
// Where the ranges come from:
// • bear, wolf, chamois, souslik, tortoise: Bulgaria's own report to the EU under Article 17 of the Habitats Directive (2013–2018),
//   the official 10 km grid of where each species lives, from the EEA map service. GBIF records are counted for each and
//   checked against the range (the share that falls inside is printed).
// • birds (Article 12 withholds the vultures, eagles and the capercaillie as sensitive):
//   GBIF occurrences in Bulgaria since 1990 — human observations only (no GPS telemetry), coordinates within 5 km, no
//   captive animals — gridded into 5 km cells; a cell counts when it holds enough records and has an occupied neighbour.
// • dolphins: Bulgaria's territorial sea (all three Black Sea species are reported over all Bulgarian waters in Article 17).
// The 2019–2024 grids, the red deer (too few GBIF records), and the jackal, otter, Greek tortoise and black stork (all over
// the country, nothing distinctive to show) were tried and left out.
// Either way the cells are painted on a fine raster, blurred and contoured, so the 10 km squares and 5 km cells become
// smooth shapes, then cut to Bulgaria's land (or to its sea for the dolphins) and simplified.
// Downloads are cached in $ANIMALS_CACHE (default: the OS temp dir), so a rebuild is offline.
import fs from 'fs';
import os from 'os';
import path from 'path';
import pc from 'polygon-clipping';

const ROOT = new URL('../', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL('./data/' + f, import.meta.url), 'utf8'));
const CACHE = process.env.ANIMALS_CACHE || path.join(os.tmpdir(), 'animals-build-cache');
fs.mkdirSync(CACHE, { recursive: true });
const UA = { headers: { 'User-Agent': 'animals-build/1.0' } };
const TODAY = new Date().toISOString().slice(0, 10);

// ---- the animals ----
// src 'art17': range from the Article 17 grid (art17 = its species code) (gbif names only counted); 'gbif': range from GBIF cells; 'sea': Bulgaria's sea.
// minN: records a 5 km cell needs; alone: records that keep a cell without an occupied neighbour; blur/thr: smoothing.
const SPECIES = [
  { id: 'bear', n: 'Кафява мечка', sci: 'Ursus arctos', icon: '🐻', color: '#8a5a3c', src: 'art17', art17: '1354',
    fact: 'Най-едрият хищник в България — може да тежи над 300 кг, а зимата прекарва в бърлога.' },
  { id: 'wolf', n: 'Вълк', sci: 'Canis lupus', icon: '🐺', color: '#6b7280', src: 'art17', art17: '1352',
    fact: 'Вълците живеят и ловуват на глутници, водени от двойка родители.' },
  { id: 'chamois', n: 'Дива коза', sci: 'Rupicapra rupicapra', icon: '🐐', color: '#b8860b', src: 'art17', art17: '1371',
    fact: 'Балканската дива коза скача ловко по скали и сипеи високо в планината.' },
  { id: 'souslik', n: 'Лалугер', sci: 'Spermophilus citellus', icon: '🐿️', color: '#c49a6c', src: 'art17', art17: '1335',
    fact: 'Лалугерите живеят в дупки по пасищата и спят зимен сън почти половин година.' },
  { id: 'tortoise-h', n: 'Шипоопашата костенурка', sci: 'Testudo hermanni', icon: '🐢', color: '#6b8e23', src: 'art17', art17: '1217',
    fact: 'Има рогов шип на върха на опашката си — оттам идва и името ѝ.' },
  { id: 'dolphin', n: 'Делфини', sci: 'Tursiops truncatus, Delphinus delphis, Phocoena phocoena', icon: '🐬', color: '#1f78b4', src: 'sea',
    gbifNames: ['Tursiops truncatus', 'Delphinus delphis', 'Phocoena phocoena'],
    fact: 'В Черно море живеят три вида делфини: афала, обикновен делфин и морска свиня.' },
  { id: 'golden-eagle', n: 'Скален орел', sci: 'Aquila chrysaetos', icon: '🦅', color: '#7a4b1e', src: 'gbif', minN: 1, alone: 3, blur: 16, thr: .2,
    fact: 'Гнезди по високи скали, а когато се спуска към плячката, развива над 200 км/ч.' },
  { id: 'griffon', n: 'Белоглав лешояд', sci: 'Gyps fulvus', icon: '🦅', color: '#9c6b4e', src: 'gbif', minN: 2, alone: 5,
    fact: 'Крилата му са широки до 2,8 м; храни се с умрели животни и така чисти природата.' },
  { id: 'egyptian-vulture', n: 'Египетски лешояд', sci: 'Neophron percnopterus', icon: '🦅', color: '#d9b26f', src: 'gbif', minN: 2, alone: 4, blur: 14,
    fact: 'Най-малкият лешояд у нас — разбива яйца с камъче, а зимата прекарва в Африка.' },
  { id: 'imperial-eagle', n: 'Царски орел', sci: 'Aquila heliaca', icon: '🦅', color: '#5c3a1e', src: 'gbif', minN: 2, alone: 4, blur: 14,
    fact: 'Един от най-редките орли в Европа — у нас гнезди на високи самотни дървета в Сакар и Странджа.' },
  { id: 'pelican', n: 'Къдроглав пеликан', sci: 'Pelecanus crispus', icon: '🦢', color: '#5b8db8', src: 'gbif', minN: 2, alone: 5,
    fact: 'Една от най-големите летящи птици — гнезди в езерото Сребърна, а зимува по Бургаските езера.' },
  { id: 'flamingo', n: 'Розово фламинго', sci: 'Phoenicopterus roseus', icon: '🦩', color: '#e75480', src: 'gbif', minN: 2, alone: 5,
    fact: 'Розовият цвят идва от малките рачета, с които се храни в солените езера край Бургас и Поморие.' },
  { id: 'spoonbill', n: 'Лопатарка', sci: 'Platalea leucorodia', icon: '🐦', color: '#3aa0a0', src: 'gbif', minN: 2, alone: 5,
    fact: 'Клюнът ѝ е широк като лопатка — с него тя „мете“ плитката вода и лови храна.' },
  { id: 'goose', n: 'Червеногуша гъска', sci: 'Branta ruficollis', icon: '🪿', color: '#c0392b', src: 'gbif', minN: 2, alone: 5, labelNear: [28.55, 43.6],
    fact: 'Зимува край езерата Шабла и Дуранкулак — там се събират голяма част от всички червеногуши гъски на света.' },
  { id: 'capercaillie', n: 'Глухар', sci: 'Tetrao urogallus', icon: '🦃', color: '#2e5e3e', src: 'gbif', minN: 1, alone: 2, blur: 16, thr: .18,
    fact: 'Най-голямата горска кокошка у нас; когато мъжкият „пее“ напролет, за миг не чува нищо — оттам и името му.' },
];

// ---- projection (as build-real-map.mjs): x = (lon − 15)·cos 42.7°·300, y = (47 − lat)·300 ----
const LON0 = 15, LAT1 = 47, K = 300, CX = Math.cos((42.7 * Math.PI) / 180);
const P = ([lon, lat]) => [(lon - LON0) * CX * K, (LAT1 - lat) * K];
const KM = 111.2 / K; // km per map unit (both axes)
const UNIT2 = KM * KM; // km² per map unit²

// ---- Bulgaria: land and sea, as build-real-map.mjs makes them ----
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const close = (r) => (same(r[0], r[r.length - 1]) ? r : [...r, r[0]]);
const pts = (geom) => geom.map((p) => [p.lon, p.lat]);
function join(lines) {
  const out = []; const pool = lines.map((l) => l.slice());
  while (pool.length) {
    const cur = pool.shift(); let grew = true;
    while (grew && !same(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i]; let add = null;
        if (same(cur[cur.length - 1], l[0])) add = () => cur.push(...l.slice(1));
        else if (same(cur[cur.length - 1], l[l.length - 1])) add = () => cur.push(...l.slice(0, -1).reverse());
        else if (same(cur[0], l[l.length - 1])) add = () => cur.unshift(...l.slice(0, -1));
        else if (same(cur[0], l[0])) add = () => cur.unshift(...l.slice(1).reverse());
        if (add) { add(); pool.splice(i, 1); grew = true; break; }
      }
    }
    out.push(cur);
  }
  return out;
}
const rings = (lines) => join(lines).filter((l) => l.length > 3 && same(l[0], l[l.length - 1]));
const box = (b) => [[[[b.lon0, b.lat0], [b.lon1, b.lat0], [b.lon1, b.lat1], [b.lon0, b.lat1], [b.lon0, b.lat0]]]];
const bgRel = read('bg-rel.json').elements[0];
const outer = rings(bgRel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => pts(m.geometry)));
const bgFull = pc.union(...outer.map((r) => [[r]]));
const coastJoined = join(read('coast.json').elements.filter((e) => e.type === 'way').map((w) => pts(w.geometry)));
const islands = coastJoined.filter((l) => same(l[0], l[l.length - 1]) && l.length > 3);
const shore = coastJoined.filter((l) => !same(l[0], l[l.length - 1])).sort((a, b) => b.length - a.length)[0];
const [sLon, sLat] = shore[0], [nLon, nLat] = shore[shore.length - 1];
let sea = pc.intersection([[close([...shore, [nLon, nLat + 2], [32, nLat + 2], [32, sLat - 2], [sLon, sLat - 2]])]], box({ lon0: 27.2, lon1: 29.4, lat0: 41.2, lat1: 44.6 }));
if (islands.length) sea = pc.difference(sea, ...islands.map((r) => [[r]]));
const toMap = (m) => m.map((poly) => poly.map((r) => r.map(P)));
const bgLand = toMap(simplifyMulti(pc.difference(bgFull, sea), 0.002)); // ~0.2 km: plenty for a range edge
const bgSea = toMap(simplifyMulti(pc.intersection(bgFull, sea), 0.002));

// ---- small geometry helpers ----
function simplify(p, tol) { // Douglas-Peucker
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = p[a], [bx, by] = p[b], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = p[i]; let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
function simplifyMulti(m, tol) {
  return m.map((poly) => poly.map((r) => close(simplify(r, tol))).filter((r) => r.length >= 4)).filter((poly) => poly.length);
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
const polyArea = (poly) => poly.reduce((s, r, i) => s + (i ? -1 : 1) * ringArea(r), 0);
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
  const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h));
const inMulti = (x, y, m) => m.some((poly) => inPoly(x, y, poly));
// the label point: the inside point farthest from the edge (a coarse pole of inaccessibility)
function labelPoint(poly) {
  const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const segs = poly.flatMap((r) => r.slice(1).map((p, i) => [r[i], p]));
  const distEdge = (x, y) => { let md = Infinity; for (const [[ax, ay], [bx, by]] of segs) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    md = Math.min(md, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return md; };
  let best = null, bd = -1, step = Math.max(1, Math.sqrt(((x1 - x0) * (y1 - y0)) / 3000));
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    if (!inPoly(x, y, poly)) continue; const d = distEdge(x, y); if (d > bd) { bd = d; best = [x, y]; } }
  if (best) { // refine around the best sample
    const s = step; for (let y = best[1] - s; y <= best[1] + s; y += s / 6) for (let x = best[0] - s; x <= best[0] + s; x += s / 6) {
      if (!inPoly(x, y, poly)) continue; const d = distEdge(x, y); if (d > bd) { bd = d; best = [x, y]; } } }
  return best || poly[0][0];
}

// ---- the raster the ranges are drawn on: map units, Bulgaria and its sea with a margin ----
const G = 2; // map units per cell (~0.74 km)
const X0 = 1540, Y0 = 760, X1 = 3120, Y1 = 1810;
const GW = Math.ceil((X1 - X0) / G) + 1, GH = Math.ceil((Y1 - Y0) / G) + 1;
const gx = (i) => X0 + i * G, gy = (j) => Y0 + j * G;
function fillPolys(field, multi) { // even-odd scanline fill of map-unit polygons
  for (let j = 0; j < GH; j++) {
    const y = gy(j), xs = [];
    for (const poly of multi) for (const r of poly) for (let k = 0; k < r.length - 1; k++) {
      const [ax, ay] = r[k], [bx, by] = r[k + 1]; if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - X0) / G)), i1 = Math.min(GW - 1, Math.floor((xs[k + 1] - X0) / G));
      for (let i = i0; i <= i1; i++) field[j * GW + i] = 1;
    }
  }
}
function blur(field, sigma) { // separable gaussian, sigma in map units
  const s = sigma / G, R = Math.ceil(3 * s), w = []; let sum = 0;
  for (let k = -R; k <= R; k++) { const v = Math.exp(-(k * k) / (2 * s * s)); w.push(v); sum += v; }
  for (let k = 0; k < w.length; k++) w[k] /= sum;
  const tmp = new Float32Array(field.length), out = new Float32Array(field.length);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let v = 0; for (let k = -R; k <= R; k++) { const ii = i + k; if (ii >= 0 && ii < GW) v += field[j * GW + ii] * w[k + R]; } tmp[j * GW + i] = v; }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let v = 0; for (let k = -R; k <= R; k++) { const jj = j + k; if (jj >= 0 && jj < GH) v += tmp[jj * GW + i] * w[k + R]; } out[j * GW + i] = v; }
  return out;
}
// marching squares at level t → closed rings (orientation free: they are XOR-ed into a polygon)
function contour(f, t) {
  for (let i = 0; i < GW; i++) f[i] = f[(GH - 1) * GW + i] = 0;
  for (let j = 0; j < GH; j++) f[j * GW] = f[j * GW + GW - 1] = 0;
  const pt = new Map(), adj = new Map();
  const edgePt = (key, a, b, ia, ja, ib, jb) => { if (!pt.has(key)) { const s = (t - a) / (b - a); pt.set(key, [gx(ia + (ib - ia) * s), gy(ja + (jb - ja) * s)]); } return key; };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const tl = f[j * GW + i], tr = f[j * GW + i + 1], bl = f[(j + 1) * GW + i], br = f[(j + 1) * GW + i + 1];
    const c = (tl > t ? 8 : 0) | (tr > t ? 4 : 0) | (br > t ? 2 : 0) | (bl > t ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => edgePt((j * GW + i) * 2, tl, tr, i, j, i + 1, j), B = () => edgePt(((j + 1) * GW + i) * 2, bl, br, i, j + 1, i + 1, j + 1);
    const L = () => edgePt((j * GW + i) * 2 + 1, tl, bl, i, j, i, j + 1), Rr = () => edgePt((j * GW + i + 1) * 2 + 1, tr, br, i + 1, j, i + 1, j + 1);
    const hi = (tl + tr + bl + br) / 4 > t;
    switch (c) {
      case 1: link(L(), B()); break; case 2: link(B(), Rr()); break; case 3: link(L(), Rr()); break; case 4: link(T(), Rr()); break;
      case 5: if (hi) { link(L(), T()); link(B(), Rr()); } else { link(L(), B()); link(T(), Rr()); } break;
      case 6: link(T(), B()); break; case 7: link(L(), T()); break; case 8: link(L(), T()); break; case 9: link(T(), B()); break;
      case 10: if (hi) { link(T(), Rr()); link(L(), B()); } else { link(L(), T()); link(B(), Rr()); } break;
      case 11: link(T(), Rr()); break; case 12: link(L(), Rr()); break; case 13: link(B(), Rr()); break; case 14: link(L(), B()); break;
    }
  }
  const seen = new Set(), out = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ring = []; let prev = null, cur = start;
    while (cur != null && !seen.has(cur)) { seen.add(cur); ring.push(pt.get(cur)); const nb = adj.get(cur); const nx = nb.find((k) => k !== prev && !seen.has(k)); prev = cur; cur = nx; }
    if (ring.length >= 3) out.push(close(ring));
  }
  return out;
}
const fieldToMulti = (f, t) => { const rs = contour(f, t); return rs.length ? pc.xor(...rs.map((r) => [[r]])) : []; };

// ---- downloads (cached) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, file) {
  const fp = path.join(CACHE, file);
  if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (let a = 0; a < 6; a++) {
    const r = await fetch(url, UA).catch(() => null);
    if (r && r.ok) { const j = await r.json(); fs.writeFileSync(fp, JSON.stringify(j)); return j; }
    await sleep(1500 * (a + 1));
  }
  throw new Error('download failed: ' + url);
}
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
const GBIF_Q = 'country=BG&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&year=1990,2026'
  + '&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=OBSERVATION&basisOfRecord=OCCURRENCE&basisOfRecord=PRESERVED_SPECIMEN&basisOfRecord=MATERIAL_SAMPLE';
async function gbif(name) {
  const m = await getJSON('https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(name), `match_${slug(name)}.json`);
  if (!m.usageKey || m.matchType !== 'EXACT') throw new Error('no exact GBIF match for ' + name);
  const recs = [];
  for (let off = 0; ; off += 300) {
    const j = await getJSON(`https://api.gbif.org/v1/occurrence/search?${GBIF_Q}&taxonKey=${m.usageKey}&limit=300&offset=${off}`, `occ_${m.usageKey}_${off}.json`);
    recs.push(...j.results);
    if (j.endOfRecords || !j.results.length || off > 60000) break;
  }
  const decimals = (v) => (String(v).split('.')[1] || '').length;
  const ok = recs.filter((r) => {
    const u = r.coordinateUncertaintyInMeters;
    if (u != null && u > 5000) return false;
    if (u == null && (decimals(r.decimalLatitude) < 2 || decimals(r.decimalLongitude) < 2)) return false; // a coarse, unstated position
    const est = `${r.establishmentMeans || ''} ${r.degreeOfEstablishment || ''}`.toLowerCase();
    if (/managed|captive|cultivated/.test(est)) return false;
    if (/captiv|zoo\b|зоопарк/i.test(`${r.occurrenceRemarks || ''} ${r.locality || ''}`)) return false;
    return true;
  });
  return { key: m.usageKey, total: recs.length, pts: ok.map((r) => P([r.decimalLongitude, r.decimalLatitude])), datasets: new Set(ok.map((r) => r.datasetKey)) };
}
// The 2013–2018 report: Bulgaria's 2019–2024 maps are only the cells surveyed in that period (the otter, found on nearly
// every river, shows as scattered squares; the bear misses the Rhodopes), so the earlier, complete distribution is used.
const EEA17 = 'https://bio.discomap.eea.europa.eu/arcgis/rest/services/Article17/HabitatsDirective_ART_17_WMS_version_2020_08_public/MapServer/3/query';
async function art17(code) {
  const q = new URLSearchParams({ where: `country='BG' AND speciescode='${code}'`, outFields: 'region', outSR: '4326', f: 'geojson' });
  const j = await getJSON(`${EEA17}?${q}`, `art17_2013_2018_${code}.json`);
  if (!j.features?.length) throw new Error('no Article 17 distribution for ' + code);
  const m = j.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  return { regions: j.features.map((f) => Object.values(f.properties)[0]), multi: toMap(m) };
}

// ---- build each range ----
const CELL = 5 / KM; // 5 km in map units
function gbifField(points, sp) {
  const minN = sp.minN ?? 2, alone = sp.alone ?? 5, cells = new Map();
  for (const [x, y] of points) { const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; cells.set(k, (cells.get(k) || 0) + 1); }
  const keep = [...cells].filter(([k, n]) => {
    if (n < minN) return false; if (n >= alone) return true;
    const [cx, cy] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (cells.get(`${cx + dx},${cy + dy}`) || 0) >= minN) return true;
    return false;
  });
  const f = new Float32Array(GW * GH);
  for (const [k] of keep) { const [cx, cy] = k.split(',').map(Number);
    const i0 = Math.max(0, Math.floor((cx * CELL - X0) / G)), i1 = Math.min(GW - 1, Math.ceil(((cx + 1) * CELL - X0) / G));
    const j0 = Math.max(0, Math.floor((cy * CELL - Y0) / G)), j1 = Math.min(GH - 1, Math.ceil(((cy + 1) * CELL - Y0) / G));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) f[j * GW + i] = 1; }
  return { f, cells: cells.size, kept: keep.length };
}
const r1 = (v) => Math.round(v * 10) / 10;
const pathOf = (m) => m.map((poly) => poly.map((r) => { const q = simplify(r, 0.8); return q.length < 4 ? '' : 'M' + q.slice(0, -1).map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z'; }).join('')).join('');
const MIN_PART = 40 / UNIT2; // drop specks under 40 km²

const out = [], report = [], previewPts = {};
const datasets = new Set();
for (const sp of SPECIES) {
  const names = sp.gbifNames || [sp.sci];
  const occ = [];
  for (const nm of names) { const g = await gbif(nm); occ.push(...g.pts); g.datasets.forEach((d) => datasets.add(d)); }
  previewPts[sp.id] = occ;
  let range, note = '';
  if (sp.src === 'sea') {
    range = bgSea; note = 'range: Bulgarian territorial sea';
  } else {
    let f;
    if (sp.src === 'art17') {
      const a = await art17(sp.art17);
      f = new Float32Array(GW * GH); fillPolys(f, a.multi);
      f = blur(f, sp.blur ?? 10); note = `Art17 ${a.regions.join('+')}`;
      range = fieldToMulti(f, sp.thr ?? .5);
    } else {
      const g = gbifField(occ, sp);
      f = blur(g.f, sp.blur ?? 12); note = `GBIF cells ${g.kept}/${g.cells}`;
      range = fieldToMulti(f, sp.thr ?? .25);
    }
    range = pc.intersection(range, bgLand);
  }
  range = range.filter((poly) => polyArea(poly) > MIN_PART);
  range.sort((a, b) => polyArea(b) - polyArea(a));
  const d = pathOf(range);
  // the label goes in the largest part, or in the part nearest sp.labelNear [lon, lat] when the teachable place is not the largest
  const near = sp.labelNear && P(sp.labelNear), dist = (poly) => Math.min(...poly[0].map(([x, y]) => Math.hypot(x - near[0], y - near[1])));
  const main = near ? range.slice().sort((p1, p2) => dist(p1) - dist(p2))[0] : range[0];
  const at = labelPoint(simplifyMulti([main], 0.8)[0]).map(r1);
  const area = range.reduce((s, poly) => s + polyArea(poly), 0) * UNIT2;
  const inside = occ.length ? occ.filter(([x, y]) => inMulti(x, y, range)).length / occ.length : 0;
  out.push({ id: sp.id, n: sp.n, sci: sp.sci, icon: sp.icon, color: sp.color, d, at, n_obs: occ.length, fact: sp.fact });
  report.push(`${sp.id.padEnd(13)} ${String(occ.length).padStart(5)} GBIF records · ${(inside * 100).toFixed(0).padStart(3)}% inside · ${String(Math.round(area)).padStart(6)} km² · ${range.length} parts · ${(d.length / 1024).toFixed(1)} KB · ${note}`);
}

const head = `/* generated by tools/build-animals.mjs on ${TODAY}; do not edit.
   Ranges: bear, wolf, chamois, souslik and tortoise from Bulgaria's Article 17 Habitats Directive report 2013–2018 (EEA, HabitatsDirective_ART_17_WMS_version_2020_08_public, CC BY 4.0),
   dolphins: Bulgaria's territorial sea; birds from GBIF occurrences (GBIF.org, occurrence search API, ${TODAY}: ${GBIF_Q.replace(/&basisOfRecord=[A-Z_]+/g, '')} & human observations,
   uncertainty ≤ 5 km; ${datasets.size} datasets, CC0/CC BY), smoothed and clipped to Bulgaria (OpenStreetMap, ODbL). n_obs = GBIF records used.
   Map units: x = (lon − 15)·cos 42.7°·300, y = (47 − lat)·300. */\n`;
const body = 'const ANIMALS=[\n' + out.map((a) => '{' + Object.entries(a).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(',') + '}').join(',\n') + '\n];\n';
fs.writeFileSync(new URL('animals.js', ROOT), head + body);
console.log(report.join('\n'));
console.log(`animals.js ${((head + body).length / 1024).toFixed(0)} KB · ${out.length} animals`);

// ---- optional preview: one small map per animal, GBIF records as dots ----
const pi = process.argv.indexOf('--preview');
if (pi > 0) {
  const dir = process.argv[pi + 1]; fs.mkdirSync(dir, { recursive: true });
  const { default: sharp } = await import('sharp');
  const REAL = JSON.parse(fs.readFileSync(new URL('real-map.js', ROOT), 'utf8').replace(/^[\s\S]*?const REAL=/, '').replace(/;\s*$/, ''));
  const bx = 1590, by = 800, bw = 1480, bh = 960, cols = 3, tw = 740, th = 480;
  const tiles = out.map((a, k) => {
    const dots = previewPts[a.id].map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="4" fill="#000" opacity=".55"/>`).join('');
    return `<svg x="${(k % cols) * tw}" y="${Math.floor(k / cols) * th}" width="${tw}" height="${th}" viewBox="${bx} ${by} ${bw} ${bh}">
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#cfe3f0"/><path d="${REAL.land}" fill="#f3ead7" stroke="#bbb" stroke-width="1"/>
      <path d="${REAL.bg}" fill="#fbf6ea" stroke="#777" stroke-width="2"/><path d="${REAL.obl}" fill="none" stroke="#ccc" stroke-width="1"/>
      <path d="${a.d}" fill="${a.color}" fill-opacity=".55" stroke="${a.color}" stroke-width="3"/>${dots}
      <text x="${a.at[0]}" y="${a.at[1]}" font-size="60" text-anchor="middle" dominant-baseline="middle">●</text>
      <text x="${bx + 20}" y="${by + 70}" font-size="56" font-family="Helvetica" font-weight="bold">${a.n} (${a.n_obs})</text></svg>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * tw}" height="${Math.ceil(out.length / cols) * th}">${tiles}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, 'animals-preview.png'));
  console.log('preview', path.join(dir, 'animals-preview.png'));
}
