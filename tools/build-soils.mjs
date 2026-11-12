// node build-soils.mjs → ../img/real-soils.webp + ../soils.js
// The soils of Bulgaria, in the soil types taught in Bulgarian school geography (черноземи, сиви горски, канелени горски,
// смолници, кафяви горски, ...), painted on a transparent image over the whole map, one soft colour per type.
//
// Data: the Harmonized World Soil Database v2.0 (FAO & IIASA 2023, https://doi.org/10.4060/cc3823en, licence
// CC BY-NC-SA 3.0 IGO). For Bulgaria it carries the European Soil Database (ESDB, JRC), whose Bulgarian part comes from
// the national soil map; each 30″ (~1 km) cell names a soil mapping unit (SMU) and we take the unit's dominant soil
// (FAO-90 code). SoilGrids 2.0 was tried first and dropped: around Bulgaria it is four broad classes with no alluvial soils
// along the rivers and no mountain soils.
//
// FAO-90 → Bulgarian soil types after the correlation in Koinov, Kabakchiev & Boneva, "Атлас на почвите в България"
// (1998) and Shishkov & Kolev, "The Soils of Bulgaria" (Springer 2014):
//   Chernozems, Luvic Phaeozems (излужени черноземи)      → черноземи
//   Haplic Luvisols                                       → сиви горски
//   Chromic Luvisols, Vertic Luvisols                     → канелени горски, but north of the main ridge of Stara planina
//                                                           → сиви горски (school rule: канелените са в Южна България)
//   Vertisols → смолници · Fluvisols → алувиални · Dystric/Eutric Cambisols → кафяви горски
//   Humic Cambisols (Cambic Umbrisols) → тъмноцветни горски · Planosols → псевдоподзолисти
//   Rendzic Leptosols → рендзини · Lithic Leptosols → плитки каменисти · Solonetz (+ Solonchaks) → засолени
//   Haplic Acrisols (Strandzha) → жълтоземи
//   and everything above 1800 m (above the forest line, Terrain Tiles heights) → планинско-ливадни
// Cells that are town, water, a neighbour's unit or empty take the nearest Bulgarian unit's soil. A mode filter then
// rounds off the 1 km steps and the specks, so the types read as regions.
// The raster and its database are cached in tools/data/hwsd/, the heights in tools/data/tiles/ (shared with the relief).
import fs from 'fs';
import { spawn } from 'child_process';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url);
const REAL = JSON.parse(fs.readFileSync(new URL('real-map.js', ROOT), 'utf8').replace(/^[\s\S]*?const REAL=/, '').replace(/;\s*$/, ''));
const SCALE = .75, SS = 2; // output pixels per map unit, as the relief; work at twice that and scale down for soft edges
const ALPHA = 200, MODE_R = 4, MODE_PASSES = 3, MEADOW_FROM = 1800;
const lonOf = (x) => x / (REAL.cx * REAL.k) + REAL.lon0, latOf = (y) => REAL.lat1 - y / REAL.k;

// ---- the soil types: name, WRB names, FAO-90 codes in HWSD, colour ----
const SOILS = [
  { n: 'Черноземи', wrb: ['Chernozems', 'Luvic Phaeozems'], fao: ['CHh', 'CHk', 'PHl'], color: '#74604e' },
  { n: 'Сиви горски', wrb: ['Haplic Luvisols', 'Chromic Luvisols (Северна България)'], fao: ['LVh'], color: '#aba69b' },
  { n: 'Канелени горски', wrb: ['Chromic Luvisols', 'Vertic Luvisols'], fao: ['LVx', 'LVv'], color: '#cf905c' },
  { n: 'Смолници', wrb: ['Vertisols'], fao: ['VRe'], color: '#4f4a66' },
  { n: 'Алувиални', wrb: ['Fluvisols'], fao: ['FLc'], color: '#86bcd2' },
  { n: 'Кафяви горски', wrb: ['Dystric Cambisols', 'Eutric Cambisols'], fao: ['CMd', 'CMe'], color: '#7f9a56' },
  { n: 'Тъмноцветни горски', wrb: ['Cambic Umbrisols'], fao: ['CMu'], color: '#3f6b4d' },
  { n: 'Планинско-ливадни', wrb: ['Umbrisols', 'Umbric Leptosols'], fao: [], color: '#c6dc8c' },
  { n: 'Псевдоподзолисти', wrb: ['Planosols'], fao: ['PLe'], color: '#e4d6a2' },
  { n: 'Рендзини', wrb: ['Rendzic Leptosols'], fao: ['LPk'], color: '#a98bc8' },
  { n: 'Плитки каменисти', wrb: ['Lithic Leptosols'], fao: ['LPq'], color: '#b9685a' },
  { n: 'Засолени', wrb: ['Solonetz', 'Solonchaks'], fao: ['SNh'], color: '#de7fb2' },
  { n: 'Жълтоземи', wrb: ['Acrisols'], fao: ['ACh'], color: '#e9b941' },
];
const T = Object.fromEntries(SOILS.map((s, i) => [s.n, i]));
// the Bulgarian ESDB units in HWSD v2.0 and their dominant soil (table HWSD2_SMU of HWSD2.mdb: HWSD2_SMU_ID → FAO90)
const SMU = { 10419: 'CHk', 10420: 'CHh', 10421: 'PHl', 10422: 'LVh', 10423: 'LVx', 10424: 'LVv', 10425: 'PLe', 10426: 'VRe',
  10427: 'FLc', 10428: 'SNh', 10429: 'LPk', 10430: 'LVh', 10431: 'LVh', 10432: 'LVx', 10433: 'ACh', 10434: 'CMd', 10435: 'CMe',
  10436: 'CMe', 10437: 'CMu', 10438: 'LPq', 10439: 'CHh', 10440: 'LVh', 10441: 'LVx' };
const ofFao = {}; SOILS.forEach((s, i) => s.fao.forEach((f) => (ofFao[f] = i)));
// the main ridge of Stara planina, west to east [lon, lat]: Vrashka chuka, Midzhur, Kom, Murgash, Zlatitsa pass, Botev,
// Shipka, Vratnik, Kotel pass, Varbitsa pass, Emine
const RIDGE = [[22.38, 43.82], [22.68, 43.40], [23.06, 43.17], [23.35, 42.98], [23.66, 42.83], [24.17, 42.75], [24.92, 42.72],
  [25.32, 42.75], [26.20, 42.79], [26.45, 42.88], [26.65, 42.97], [26.98, 42.95], [27.90, 42.70]];
const ridgeLat = (lon) => { if (lon <= RIDGE[0][0]) return RIDGE[0][1];
  for (let i = 1; i < RIDGE.length; i++) if (lon <= RIDGE[i][0]) { const [a, b] = [RIDGE[i - 1], RIDGE[i]]; return a[1] + ((lon - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); }
  return RIDGE[RIDGE.length - 1][1]; };

// ---- the working grid: Bulgaria's box plus a margin, at SCALE·SS pixels per map unit ----
const G = SCALE * SS, M = 12;
const ox = Math.floor((REAL.bb.x0 - M) * SCALE), oy = Math.floor((REAL.bb.y0 - M) * SCALE); // output-pixel origin of the box
const OWb = Math.ceil((REAL.bb.x1 + M) * SCALE) - ox, OHb = Math.ceil((REAL.bb.y1 + M) * SCALE) - oy;
const GW = OWb * SS, GH = OHb * SS;
const gLon = (gx) => lonOf((ox * SS + gx + .5) / G), gLat = (gy) => latOf((oy * SS + gy + .5) / G);
const lon0 = gLon(0), lon1 = gLon(GW), lat0 = gLat(GH), lat1 = gLat(0);

// ---- HWSD v2.0: download once, cut the box out of the 1.9 GB world raster while it streams out of the zip ----
const dir = new URL('./data/hwsd/', import.meta.url); fs.mkdirSync(dir, { recursive: true });
const zip = new URL('HWSD2_RASTER.zip', dir);
if (!fs.existsSync(zip)) {
  const r = await fetch('https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/HWSD/HWSD2_RASTER.zip');
  if (!r.ok) throw new Error(`HWSD2_RASTER.zip: ${r.status}`);
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
}
const NCOLS = 43200, RB = NCOLS * 2, ULX = -179.9958333333333, ULY = 89.9958333333333, D = 1 / 120; // HWSD2.hdr
const R0 = Math.floor((ULY - lat1) / D) - 1, R1 = Math.ceil((ULY - lat0) / D) + 2;
const C0 = Math.floor((lon0 - ULX) / D) - 1, C1 = Math.ceil((lon1 - ULX) / D) + 2, NC = C1 - C0;
const cells = new Uint16Array((R1 - R0) * NC).fill(65535);
await new Promise((ok, fail) => {
  const p = spawn('unzip', ['-p', zip.pathname, 'HWSD2.bil']); let pos = 0; const raw = Buffer.alloc(cells.length * 2);
  p.stdout.on('data', (ch) => {
    const s = pos, e = (pos += ch.length);
    for (let r = Math.max(R0, Math.floor(s / RB)); r < R1 && r * RB < e; r++) {
      const a = r * RB + C0 * 2, lo = Math.max(a, s), hi = Math.min(a + NC * 2, e);
      if (lo < hi) ch.copy(raw, (r - R0) * NC * 2 + (lo - a), lo - s, hi - s);
    }
    if (s > R1 * RB) p.kill();
  });
  p.on('close', () => { for (let i = 0; i < cells.length; i++) cells[i] = raw.readUInt16LE(i * 2); ok(); });
  p.on('error', fail);
});

// ---- heights (Terrain Tiles, terrarium z8, as the relief) for the mountain-meadow rule ----
const Z = 8, TILE = 256;
const tgx = (lon) => ((lon + 180) / 360) * 2 ** Z * TILE;
const tgy = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * TILE; };
const tx0 = Math.floor(tgx(lon0) / TILE), tx1 = Math.floor(tgx(lon1) / TILE), ty0 = Math.floor(tgy(lat1) / TILE), ty1 = Math.floor(tgy(lat0) / TILE);
const MW = (tx1 - tx0 + 1) * TILE, MH = (ty1 - ty0 + 1) * TILE, elev = new Float32Array(MW * MH);
const tdir = new URL('./data/tiles/', import.meta.url); fs.mkdirSync(tdir, { recursive: true });
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
  const f = new URL(`${Z}-${tx}-${ty}.png`, tdir);
  if (!fs.existsSync(f)) { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!r.ok) throw new Error(`tile ${tx},${ty}: ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  const data = await sharp(fs.readFileSync(f)).removeAlpha().raw().toBuffer(), bx = (tx - tx0) * TILE, by = (ty - ty0) * TILE;
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { const o = (j * TILE + i) * 3; elev[(by + j) * MW + bx + i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768; }
}
const height = (lon, lat) => { const x = Math.max(0, Math.min(MW - 1.001, tgx(lon) - tx0 * TILE - .5)), y = Math.max(0, Math.min(MH - 1.001, tgy(lat) - ty0 * TILE - .5));
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, o = j * MW + i;
  return elev[o] * (1 - u) * (1 - v) + elev[o + 1] * u * (1 - v) + elev[o + MW] * (1 - u) * v + elev[o + MW + 1] * u * v; };

// ---- Bulgaria's shape on the grid: the land itself, and a little wider for painting under the page's clip ----
const shape = async (stroke) => (await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="${ox / SCALE} ${oy / SCALE} ${OWb / SCALE} ${OHb / SCALE}">` +
  `<path d="${REAL.bg}" fill="#fff"${stroke ? ` stroke="#fff" stroke-width="${stroke}" stroke-linejoin="round"` : ''}/></svg>`)).extractChannel(0).raw().toBuffer());
const inside = await shape(0), paint = await shape(8);

// ---- classify every grid pixel ----
const OUT = 255, NONE = 254, lab = new Uint8Array(GW * GH).fill(OUT);
const unknown = {};
for (let gy = 0; gy < GH; gy++) {
  const lat = gLat(gy), row = Math.round((ULY - lat) / D) - R0;
  for (let gx = 0; gx < GW; gx++) {
    const k = gy * GW + gx; if (paint[k] < 8) continue;
    const lon = gLon(gx), id = cells[row * NC + Math.round((lon - ULX) / D) - C0], fao = SMU[id];
    let t = fao === undefined ? NONE : ofFao[fao];
    if (fao === undefined && inside[k] >= 128) unknown[id] = (unknown[id] || 0) + 1;
    if ((fao === 'LVx' || fao === 'LVv') && lat > ridgeLat(lon)) t = T['Сиви горски'];
    if (height(lon, lat) >= MEADOW_FROM) t = T['Планинско-ливадни'];
    lab[k] = t;
  }
}
// towns, water, neighbours' units: the nearest Bulgarian soil (breadth-first growth from the known pixels)
let front = []; for (let k = 0; k < lab.length; k++) if (lab[k] < NONE) front.push(k);
while (front.length) { const next = [];
  for (const k of front) { const x = k % GW;
    for (const n of [k - GW, k + GW, x > 0 ? k - 1 : -1, x < GW - 1 ? k + 1 : -1]) if (n >= 0 && n < lab.length && lab[n] === NONE) { lab[n] = lab[k]; next.push(n); } }
  front = next; }

// ---- mode filter: each pixel takes the commonest type in the (2r+1)² square around it ----
const K = SOILS.length;
for (let pass = 0; pass < MODE_PASSES; pass++) {
  const src = lab.slice(), cnt = new Int32Array(K), R = MODE_R;
  for (let y = 0; y < GH; y++) {
    cnt.fill(0); const ya = Math.max(0, y - R), yb = Math.min(GH - 1, y + R);
    const col = (x, d) => { if (x < 0 || x >= GW) return; for (let yy = ya; yy <= yb; yy++) { const v = src[yy * GW + x]; if (v < K) cnt[v] += d; } };
    for (let x = -R; x < R; x++) col(x, 1);
    for (let x = 0; x < GW; x++) {
      col(x + R, 1);
      const k = y * GW + x;
      if (src[k] < K) { let best = src[k]; for (let c = 0; c < K; c++) if (cnt[c] > cnt[best]) best = c; lab[k] = best; }
      col(x - R, -1);
    }
  }
}

// ---- shares of Bulgaria's area (cells weighted by cos(lat): the projection is true to scale only on 42.7°) ----
const area = new Float64Array(K); let total = 0;
for (let gy = 0; gy < GH; gy++) { const w = Math.cos((gLat(gy) * Math.PI) / 180);
  for (let gx = 0; gx < GW; gx++) { const k = gy * GW + gx, v = lab[k]; if (v < K) { const a = (inside[k] / 255) * w; area[v] += a; total += a; } } }

// ---- paint, scale down to the output, place in the whole frame ----
const rgb = SOILS.map((s) => [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16)));
const big = Buffer.alloc(GW * GH * 4);
for (let k = 0; k < lab.length; k++) { const v = lab[k]; if (v >= K) continue; const o = k * 4;
  big[o] = rgb[v][0]; big[o + 1] = rgb[v][1]; big[o + 2] = rgb[v][2]; big[o + 3] = Math.round((paint[k] / 255) * ALPHA); }
const small = await sharp(big, { raw: { width: GW, height: GH, channels: 4 } }).resize(OWb, OHb, { kernel: 'cubic' }).png().toBuffer();
const OW = Math.round(REAL.W * SCALE), OH = Math.round(REAL.H * SCALE);
const frame = await sharp({ create: { width: OW, height: OH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: small, left: ox, top: oy }]).raw().toBuffer();
const file = new URL('img/real-soils.webp', ROOT);
const lossless = await sharp(frame, { raw: { width: OW, height: OH, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
const lossy = await sharp(frame, { raw: { width: OW, height: OH, channels: 4 } }).webp({ quality: 85, alphaQuality: 90, effort: 6 }).toBuffer();
fs.writeFileSync(file, lossless.length <= lossy.length ? lossless : lossy);

// ---- soils.js ----
const list = SOILS.map((s, i) => ({ n: s.n, wrb: s.wrb, color: s.color, share: Math.round((area[i] / total) * 1000) / 1000 }))
  .filter((s) => s.share > 0).sort((a, b) => b.share - a.share);
const q = (s) => `'${s.replace(/'/g, "\\'")}'`;
fs.writeFileSync(new URL('soils.js', ROOT),
  `/* generated by tools/build-soils.mjs; do not edit. The soils of Bulgaria in the types of Bulgarian school geography, for img/real-soils.webp.\n` +
  `   Data: Harmonized World Soil Database v2.0 (FAO & IIASA 2023, doi:10.4060/cc3823en; for Bulgaria the European Soil Database, JRC),\n` +
  `   licence CC BY-NC-SA 3.0 IGO; mountain meadows above ${MEADOW_FROM} m from Terrain Tiles (Mapzen/AWS). Mapping to Bulgarian types after\n` +
  `   Koinov, Kabakchiev & Boneva, "Атлас на почвите в България" (1998) and Shishkov & Kolev, "The Soils of Bulgaria" (2014).\n` +
  `   n: name, wrb: World Reference Base names, color: the map colour, share: part of Bulgaria's area. */\n` +
  `const SOILS=[\n${list.map((s) => `  {n:${q(s.n)}, wrb:[${s.wrb.map(q).join(',')}], color:'${s.color}', share:${s.share}}`).join(',\n')}\n];\n`);

const fill = Object.entries(unknown).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, c]) => `${id}:${c}`).join(' ');
console.log(`img/real-soils.webp ${OW}×${OH} ${(fs.statSync(file).size / 1024).toFixed(0)} KB (${lossless.length <= lossy.length ? 'lossless' : 'lossy'}) · filled from neighbours: ${fill}`);
for (const s of list) console.log(`  ${s.n.padEnd(20)} ${(s.share * 100).toFixed(1)}%`);
