// node build-real-map.mjs → ../real-map.js
// The accurate map ("Истинска карта"): today's Bulgaria, its oblasts, coast, rivers and lakes from OpenStreetMap, the
// neighbours' land from Natural Earth, all in one plain projection, so a place's real lon/lat lands where it really is.
// Data comes from fetch-data.sh into tools/data/.
import fs from 'fs';
import pc from 'polygon-clipping';

const read = (f) => JSON.parse(fs.readFileSync(new URL('./data/' + f, import.meta.url), 'utf8'));

// ---- projection: equirectangular, true to scale on 42.7° N (the middle of Bulgaria) ----
// The map is Bulgaria and the land around it, from the heel of Italy to Crimea (lon 15–36.5, lat 37–47). Around Bulgaria (DETAIL) the data is
// OpenStreetMap, further out Natural Earth 10m, simplified more.
const LON0 = 15, LON1 = 36.5, LAT0 = 37, LAT1 = 47, K = 300, CX = Math.cos((42.7 * Math.PI) / 180);
export const W = Math.round((LON1 - LON0) * CX * K), H = Math.round((LAT1 - LAT0) * K);
const BG_BOX = { lon0: 22.357, lon1: 28.609, lat0: 41.235, lat1: 44.215 }; // Bulgaria's extent, checked below
const DETAIL = { lon0: 21.6, lon1: 29.2, lat0: 40.9, lat1: 44.6 }; // the box the OSM rivers were fetched for (fetch-data.sh)
const P = ([lon, lat]) => [(lon - LON0) * CX * K, (LAT1 - lat) * K];
const box = (b) => [[[[b.lon0, b.lat0], [b.lon1, b.lat0], [b.lon1, b.lat1], [b.lon0, b.lat1], [b.lon0, b.lat0]]]];
const FRAME = box({ lon0: LON0 - .3, lon1: LON1 + .3, lat0: LAT0 - .3, lat1: LAT1 + .3 });
const inWorld = ([lon, lat]) => lon > LON0 - .3 && lon < LON1 + .3 && lat > LAT0 - .3 && lat < LAT1 + .3;
const inDetail = ([lon, lat]) => lon > DETAIL.lon0 && lon < DETAIL.lon1 && lat > DETAIL.lat0 && lat < DETAIL.lat1;
const [DX0, DY0] = P([DETAIL.lon0, DETAIL.lat1]), [DX1, DY1] = P([DETAIL.lon1, DETAIL.lat0]);
const FAR_TOL = 1.2; // map units (~0.45 km) outside DETAIL; inside, the finer tolerance each path asks for

// ---- helpers ----
const asMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const pts = (geom) => geom.map((p) => [p.lon, p.lat]);
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const close = (r) => (same(r[0], r[r.length - 1]) ? r : [...r, r[0]]);
// join OSM ways into as few lines as possible; closed ones come back as rings
function join(lines) {
  const out = []; let pool = lines.map((l) => l.slice());
  while (pool.length) {
    let cur = pool.shift(), grew = true;
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
// outer and inner rings of an OSM multipolygon relation → polygon-clipping MultiPolygon
function relPoly(rel) {
  const outer = rings(rel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => pts(m.geometry)));
  const inner = rings(rel.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => pts(m.geometry)));
  if (!outer.length) return [];
  const o = pc.union(...outer.map((r) => [[r]]));
  return inner.length ? pc.difference(o, ...inner.map((r) => [[r]])) : o;
}
// Douglas-Peucker on map units
function simplify(p, tol) {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = p[a], [bx, by] = p[b], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = p[i]; let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d > md) { md = d; mi = i; }
    }
    // segments that touch the detail box keep the fine tolerance, the rest of the world the coarse one
    const near = Math.max(ax, bx) > DX0 && Math.min(ax, bx) < DX1 && Math.max(ay, by) > DY0 && Math.min(ay, by) < DY1;
    if (md > (near ? tol : Math.max(tol, FAR_TOL))) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
const r1 = (v) => Math.round(v * 10) / 10;
const TOL = 0.3;
const linePath = (l, tol = TOL) => { const q = simplify(l.map(P), tol); return q.length < 2 ? '' : 'M' + q.map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L'); };
const ringPath = (r, tol = TOL) => { const q = simplify(r.map(P), tol); return q.length < 4 ? '' : 'M' + q.slice(0, -1).map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z'; };
const polyPath = (m, tol) => m.map((poly) => poly.map((r) => ringPath(r, tol)).join('')).join('');
const clipLine = (l, inF = inWorld) => { const out = []; let cur = [];
  l.forEach((p, i) => { if (inF(p) || (l[i - 1] && inF(l[i - 1])) || (l[i + 1] && inF(l[i + 1]))) cur.push(p); else if (cur.length) { out.push(cur); cur = []; } });
  if (cur.length) out.push(cur); return out.filter((c) => c.length > 1); };
const km = (a, b) => { const t = Math.PI / 180, dl = (b[1] - a[1]) * t, dn = (b[0] - a[0]) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const lineKm = (l) => l.slice(1).reduce((s, p, i) => s + km(l[i], p), 0);
const areaKm2 = (m) => { let A = 0; for (const poly of m) poly.forEach((r, i) => { let a = 0;
  for (let j = 0; j < r.length - 1; j++) a += (r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1]); A += (i ? -1 : 1) * Math.abs(a / 2); });
  return A * 111.2 * 111.2 * CX; };

// ---- Bulgaria: the OSM country relation (it reaches 12 nautical miles into the sea) ----
const bgRel = read('bg-rel.json').elements[0];
const bgFull = relPoly(bgRel);
const borderWayIds = new Set(bgRel.members.filter((m) => m.type === 'way').map((m) => m.ref));

// ---- the Black Sea: the OSM coastline from the Romanian edge of the frame to the Turkish one, closed along the east ----
const coastWays = read('coast.json').elements.filter((e) => e.type === 'way').map((w) => pts(w.geometry));
const coastJoined = join(coastWays);
const islands = coastJoined.filter((l) => same(l[0], l[l.length - 1]) && l.length > 3);
const shore = coastJoined.filter((l) => !same(l[0], l[l.length - 1])).sort((a, b) => b.length - a.length)[0];
// the open shore runs south → north (land on its left); close it through points far out at sea
const [sLon, sLat] = shore[0], [nLon, nLat] = shore[shore.length - 1];
const seaRing = close([...shore, [nLon, nLat + 2], [32, nLat + 2], [32, sLat - 2], [sLon, sLat - 2]]);
let sea = pc.intersection([[seaRing]], box({ lon0: 27.2, lon1: 29.4, lat0: 41.2, lat1: 44.6 })); // only where the coast was fetched
if (islands.length) sea = pc.difference(sea, ...islands.map((r) => [[r]]));

const bgLand = pc.difference(bgFull, sea);
// ---- the neighbours: Natural Earth land, cut where Bulgaria and the Black Sea are ----
const neLand = read('ne_10m_land.geojson').features.flatMap((f) => asMulti(f.geometry));
const nbLand = pc.difference(pc.intersection(neLand, FRAME), bgFull, sea);
const land = pc.union(nbLand, bgLand);

// the neighbours' borders with each other (Bulgaria's own come from OSM)
const nbBorders = read('ne_10m_admin_0_boundary_lines_land.geojson').features
  .filter((f) => !/Bulgaria/.test((f.properties.ADM0_LEFT || '') + (f.properties.ADM0_RIGHT || '')))
  .flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates))
  .flatMap((l) => clipLine(l));

// ---- oblasts: the inner lines of the 28 OSM regions (the ways that are not on the country border) ----
const oblWays = new Map(), oblastNames = [];
for (const rel of read('obl.json').elements) {
  if (rel.type !== 'relation') continue;
  oblastNames.push(rel.tags['name']);
  for (const m of rel.members) if (m.type === 'way' && m.geometry && !borderWayIds.has(m.ref)) oblWays.set(m.ref, pts(m.geometry));
}
const oblLines = join([...oblWays.values()]);

// ---- rivers: every named OSM river with at least 45 km inside the frame; the Danube on its own ----
const byName = new Map();
for (const w of read('rivers.json').elements) {
  if (w.type !== 'way' || !w.geometry) continue;
  const n = w.tags['name:bg'] || w.tags.name;
  const parts = clipLine(pts(w.geometry), inDetail); if (!parts.length) continue;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(...parts);
}
const outDetail = (p) => inWorld(p) && !inDetail(p);
for (const f of ['ne_10m_rivers_lake_centerlines.geojson', 'ne_10m_rivers_europe.geojson'].flatMap((n) => read(n).features)) {
  const g = f.geometry; if (!g) continue;
  const n = f.properties.name_bg || f.properties.name || '?', parts = (g.type === 'LineString' ? [g.coordinates] : g.coordinates).flatMap((l) => clipLine(l, outDetail));
  if (!parts.length) continue;
  const key = n === 'Danube' ? 'Дунав' : 'ne:' + n + ':' + f.properties.scalerank;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(...parts.map((l) => Object.assign(l, { far: true })));
}
const rivers = [];
let danube = '';
for (const [n, parts] of byName) {
  if (n.startsWith('ne:')) { // Natural Earth rivers: big ones only, sized by their rank
    const rank = +n.split(':').pop(); if (rank > 10) continue;
    rivers.push({ n: n.split(':')[1], km: 0, w: rank <= 6 ? 3 : rank <= 8 ? 2 : 1, d: join(parts).map((l) => linePath(l)).join('') }); continue;
  }
  const len = parts.reduce((s, l) => s + (l.far ? 0 : lineKm(l)), 0);
  const d = join(parts).map((l) => linePath(l, 0.35)).join('');
  if (n === 'Дунав') { danube = d; continue; }
  if (len < 45) continue;
  rivers.push({ n, km: Math.round(len), w: len >= 250 ? 3 : len >= 120 ? 2 : 1, d });
}
rivers.sort((a, b) => b.km - a.km);

// ---- lakes and reservoirs: named OSM water inside Bulgaria, larger than 0.6 km² ----
const lakes = [];
for (const e of read('lakes.json').elements) {
  let m = [];
  if (e.type === 'way' && e.geometry) { const r = pts(e.geometry); if (r.length > 3 && same(r[0], r[r.length - 1])) m = [[r]]; }
  else if (e.type === 'relation') { try { m = relPoly(e); } catch { m = []; } }
  if (!m.length) continue;
  const a = areaKm2(m); if (a < 0.6) continue;
  lakes.push({ n: e.tags['name:bg'] || e.tags.name, a, m });
}
lakes.sort((a, b) => b.a - a.a);
const neLakes = ['ne_10m_lakes.geojson', 'ne_10m_lakes_europe.geojson'].flatMap((n) => read(n).features).flatMap((f) => asMulti(f.geometry))
  .filter((poly) => poly[0].some(inWorld));
const lakePoly = pc.union(...lakes.map((l) => l.m), pc.difference(pc.intersection(neLakes, FRAME), bgFull));

// ---- sanity: Bulgaria's extent must match BG_BOX, or the frame is off-centre ----
let [x0, y0, x1, y1] = [180, 90, -180, -90];
for (const poly of bgLand) for (const [lon, lat] of poly[0]) { x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat); }
const off = Math.max(Math.abs(x0 - BG_BOX.lon0), Math.abs(x1 - BG_BOX.lon1), Math.abs(y0 - BG_BOX.lat0), Math.abs(y1 - BG_BOX.lat1));
if (off > 0.01) throw new Error(`BG_BOX is off by ${off.toFixed(3)}°: lon ${x0.toFixed(3)}–${x1.toFixed(3)}, lat ${y0.toFixed(3)}–${y1.toFixed(3)}`);
const [bx0, by0] = P([x0, y1]), [bx1, by1] = P([x1, y0]);

const REAL = {
  W, H, k: K, cx: CX, lon0: LON0, lat1: LAT1,
  detail: { x0: Math.round(DX0), y0: Math.round(DY0), x1: Math.round(DX1), y1: Math.round(DY1) },
  bb: { x0: Math.floor(bx0 - 14), y0: Math.floor(by0 - 14), x1: Math.ceil(bx1 + 14), y1: Math.ceil(by1 + 14) },
  land: polyPath(land, 0.25),
  bg: polyPath(bgLand, 0.25),
  nbBorders: nbBorders.map((l) => linePath(l)).join(''),
  obl: oblLines.map((l) => linePath(l, 0.25)).join(''),
  danube,
  rivers: rivers.map(({ n, w, d }) => ({ n, w, d })),
  lakes: polyPath(lakePoly, 0.2),
};

const out = new URL('../real-map.js', import.meta.url);
fs.writeFileSync(out, '/* generated by tools/build-real-map.mjs from OpenStreetMap (ODbL) and Natural Earth (public domain); do not edit */\nconst REAL=' + JSON.stringify(REAL) + ';\n');
console.log(`real-map.js ${(fs.statSync(out).size / 1024).toFixed(0)} KB · ${oblastNames.length} oblasts · ${rivers.length} rivers · ${lakes.length} lakes (${lakes.slice(0, 8).map((l) => l.n).join(', ')}…)`);
console.log(`world ${W}×${H} · Bulgaria lon ${x0.toFixed(3)}–${x1.toFixed(3)}, lat ${y0.toFixed(3)}–${y1.toFixed(3)}`);
