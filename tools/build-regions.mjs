// node build-regions.mjs → ../regions.js
// The natural-geographic (physical-geographic) regions of Bulgaria as taught at school, after the classic division used in
// bg.wikipedia "География на България" (Релеф) and the regional articles (Милан Георгиев, "Физическа география на България", 1979;
// Мичев и др., "Географски речник на България", 1980):
//   Дунавска равнина; Старопланинска област = Предбалкан + Стара планина; Преходна (Краищенско-Средногорска) област =
//   Краище, Задбалкански котловини, Средногорие, Горнотракийско-Тунджанска, Странджанско-Сакарска; Рило-Родопска област =
//   Осогово-Беласишка, Рило-Пиринска, Западни и Източни Родопи; plus the school's fifth region, Черноморско крайбрежие, a land
//   strip along the coast (bg.wikipedia "Българско Черноморие": 10 km wide by the Balkan, wider at Varna and Burgas), cut out first.
// Boundaries are lon/lat polylines through the places the sources name (towns, river mouths, passes). Where a source says
// "the foot of" a mountain, the line is snapped onto the real break of slope from the Terrain Tiles heights in data/tiles/
// (terrarium z10, ~120 m per pixel). Regions are cut in a fixed order (each takes its shape minus the ones before), so they tile
// Bulgaria's land (OSM relation minus the sea) with no gaps or overlaps.
import fs from 'fs';
import sharp from 'sharp';
import pc from 'polygon-clipping';

const read = (f) => JSON.parse(fs.readFileSync(new URL('./data/' + f, import.meta.url), 'utf8'));
const CX = Math.cos((42.7 * Math.PI) / 180), K = 300;
const P = ([lon, lat]) => [(lon - 15) * CX * K, (47 - lat) * K]; // the map's projection, in map units
const unP = ([x, y]) => [x / (CX * K) + 15, 47 - y / K];
const TOL = 0.5; // simplification, map units

// ---------------------------------------------------------------- heights (terrarium z10 mosaic) ----
const Z = 10, TS = 256, TX0 = 573, TX1 = 595, TY0 = 369, TY1 = 384;
const MW = (TX1 - TX0 + 1) * TS, MH = (TY1 - TY0 + 1) * TS, elev = new Float32Array(MW * MH);
for (let ty = TY0; ty <= TY1; ty++) for (let tx = TX0; tx <= TX1; tx++) {
  const { data } = await sharp(fs.readFileSync(new URL(`./data/tiles/${Z}-${tx}-${ty}.png`, import.meta.url))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ox = (tx - TX0) * TS, oy = (ty - TY0) * TS;
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) { const o = (j * TS + i) * 3; elev[(oy + j) * MW + ox + i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768; }
}
// a calmer copy (box blur, ~0.4 km) so the snapping follows landforms, not single pixels
const calm = (() => { let a = elev, r = 3;
  for (let pass = 0; pass < 2; pass++) { const b = new Float32Array(a.length), c = new Float32Array(a.length);
    for (let y = 0; y < MH; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * MW + Math.max(0, Math.min(MW - 1, x))];
      for (let x = 0; x < MW; x++) { b[y * MW + x] = s / (2 * r + 1); s += a[y * MW + Math.min(MW - 1, x + r + 1)] - a[y * MW + Math.max(0, x - r)]; } }
    for (let x = 0; x < MW; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(MH - 1, y)) * MW + x];
      for (let y = 0; y < MH; y++) { c[y * MW + x] = s / (2 * r + 1); s += b[Math.min(MH - 1, y + r + 1) * MW + x] - b[Math.max(0, y - r) * MW + x]; } }
    a = c; }
  return a; })();
const gx = (lon) => ((lon + 180) / 360) * 2 ** Z * TS - TX0 * TS;
const gy = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * TS - TY0 * TS; };
const height = (lon, lat) => { const x = Math.max(0, Math.min(MW - 1.001, gx(lon))), y = Math.max(0, Math.min(MH - 1.001, gy(lat))), i = x | 0, j = y | 0, u = x - i, v = y - j, o = j * MW + i;
  return calm[o] * (1 - u) * (1 - v) + calm[o + 1] * u * (1 - v) + calm[o + MW] * (1 - u) * v + calm[o + MW + 1] * u * v; };

// ---------------------------------------------------------------- boundary lines ----
// km plane for snapping
const KM = 111.2, toKm = ([lon, lat]) => [lon * CX * KM, lat * KM], fromKm = ([x, y]) => [x / (CX * KM), y / KM];
// foot(side, ...points): the line is moved onto the foot of the high ground on its `side` ('L' or 'R' of the direction of travel):
// along each normal (±R km) it finds where the height crosses lo + f·(hi − lo), the crossing nearest the drawn line.
// The ends stay put, so consecutive pieces join.
function foot(side, opts, ...pts) {
  const { R = 4, f = 0.25, minRelief = 50 } = opts;
  const km = pts.map(toKm), d = []; // densify to 0.4 km
  for (let i = 0; i < km.length - 1; i++) { const [a, b] = [km[i], km[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
    for (let k = 0; k < n; k++) d.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
  d.push(km[km.length - 1]);
  const N = d.length, off = new Float64Array(N).fill(NaN), nrm = [];
  for (let i = 0; i < N; i++) {
    const a = d[Math.max(0, i - 5)], b = d[Math.min(N - 1, i + 5)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l, h = side === 'L' ? [-ty, tx] : [ty, -tx]; nrm.push(h);
    const prof = []; for (let s = -R; s <= R + 1e-9; s += 0.1) prof.push([s, height(...fromKm([d[i][0] + h[0] * s, d[i][1] + h[1] * s]))]);
    const low = prof.filter(([s]) => s <= 0).map((p) => p[1]).sort((x, y) => x - y), high = prof.filter(([s]) => s >= 0).map((p) => p[1]).sort((x, y) => x - y);
    const lo = low[Math.floor(low.length * 0.1)], hi = high[Math.floor(high.length * 0.9)];
    if (hi - lo < minRelief) continue;
    const t = lo + f * (hi - lo); let best = NaN;
    for (let k = 1; k < prof.length; k++) if (prof[k - 1][1] < t && prof[k][1] >= t) { const s = prof[k - 1][0] + ((t - prof[k - 1][1]) / (prof[k][1] - prof[k - 1][1])) * 0.1; if (isNaN(best) || Math.abs(s) < Math.abs(best)) best = s; }
    off[i] = best;
  }
  // fill the gaps, pin the ends, then a running median and mean so the line stays calm
  const known = [...off.keys()].filter((i) => !isNaN(off[i]));
  for (let i = 0; i < N; i++) if (isNaN(off[i])) { const a = known.filter((k) => k < i).pop(), b = known.find((k) => k > i);
    off[i] = a === undefined && b === undefined ? 0 : a === undefined ? off[b] : b === undefined ? off[a] : off[a] + ((off[b] - off[a]) * (i - a)) / (b - a); }
  const run = (src, w, fn) => src.map((_, i) => fn(Array.from(src.slice(Math.max(0, i - w), Math.min(N, i + w + 1)))));
  let o = run(Array.from(off), 6, (a) => a.sort((x, y) => x - y)[a.length >> 1]);
  o = run(o, 4, (a) => a.reduce((s, v) => s + v, 0) / a.length);
  const pin = 8; for (let i = 0; i < N; i++) { const e = Math.min(i, N - 1 - i); if (e < pin) o[i] *= e / pin; }
  return d.map((p, i) => fromKm([p[0] + nrm[i][0] * o[i], p[1] + nrm[i][1] * o[i]]));
}
const line = (...parts) => parts.flatMap((p, i) => (i ? p.slice(1) : p)); // pieces share their end points
const far = { N: 45.2, S: 40.6, W: 21.8, E: 29.8 };

// ---- 1. Черноморско крайбрежие: the inland edge of the coastal strip, north → south ----
// ~12 km on the Dobrudzha coast, the Varna lowland with the Varna and Beloslav lakes, ~10 km where the Balkan meets the sea,
// the whole Burgas lowland west to Aytos–Kameno–Sredets, and the sea-facing slopes of Strandzha (~25 km).
const COAST_W = [[28.50, 43.95], [28.46, 43.76], [28.45, 43.62], [28.44, 43.52], [28.30, 43.49], [28.12, 43.46], [27.98, 43.40], [27.85, 43.33],
  [27.70, 43.27], [27.60, 43.245], [27.61, 43.17], [27.71, 43.11], [27.77, 43.03], [27.77, 42.92], [27.76, 42.80], [27.68, 42.735], [27.50, 42.70],
  [27.30, 42.665], [27.17, 42.63], [27.10, 42.53], [27.11, 42.43], [27.20, 42.37], [27.38, 42.31], [27.50, 42.23], [27.58, 42.13], [27.62, 42.03], [27.66, 41.85]];
const COAST = [...COAST_W, [far.E, 41.5], [far.E, 44.6]];

// ---- 2. Дунавска равнина: its southern edge, the "conditional" foot of the Predbalkan, west → east, through the places the
// sources list: Връшка чука, Рабишка могила, Венеца, Широка планина, Ogosta at Владимирово, Боровanska могила, Iskar at Чомаковци,
// Телиш, Vit at Садовец, the Lovech heights, Osam at Александрово, the Rositsa valley, Yantra at Самоводене, the Tarnovo heights,
// the Golyama reka valley, the Cherni Lom watershed, the northern foot of Preslavska planina, then the south edge of the
// Kamchia valley to the sea.
const DANUBE_S = line(
  [[21.9, 43.85], [22.30, 43.83], [22.37, 43.80], [22.47, 43.77], [22.60, 43.75], [22.70, 43.71], [22.79, 43.665], [22.92, 43.60], [23.05, 43.56],
    [23.20, 43.535], [23.38, 43.52], [23.55, 43.47], [23.75, 43.45], [23.92, 43.41], [24.07, 43.36], [24.25, 43.335], [24.32, 43.315], [24.45, 43.29],
    [24.60, 43.27], [24.75, 43.245], [24.88, 43.25], [24.98, 43.255], [25.10, 43.205], [25.25, 43.17], [25.40, 43.175], [25.52, 43.18], [25.62, 43.155],
    [25.75, 43.15], [25.90, 43.14], [26.05, 43.16], [26.18, 43.18], [26.32, 43.20], [26.45, 43.21], [26.57, 43.215], [26.70, 43.20], [26.80, 43.175],
    [26.87, 43.162], [26.95, 43.17], [27.01, 43.145], [27.06, 43.075], [27.15, 43.045], [27.25, 43.025], [27.38, 43.035], [27.47, 43.005],
    [27.60, 42.99], [27.75, 42.985], [27.95, 42.985], [28.4, 42.98]]);
const DANUBE = [...DANUBE_S, [far.E, far.N], [far.W, far.N]];

// ---- 3. Предбалкан: its southern edge against Stara planina, west → east: the Belogradchik pass, the Salash syncline, the
// Prevala saddle, the Ogosta valley, Berkovitsa, south of Vrachanska planina to the Iskar at Лютиброд, the southern edge of the
// Botevgrad basin, Etropole, Cherni Vit at Дивчовото, then across the rivers below the main ridge (Beli Vit, the Osams, Vidima,
// Rositsa, Yantra at Gabrovo, Dryanovska, Belitsa, Zlatarishka, Stara reka), the southern edge of Gerlovo and the northern
// foot of Varbishka planina to the Kamchia confluence by Цонево.
const PREDB_S = [[21.9, 43.63], [22.40, 43.63], [22.55, 43.615], [22.60, 43.55], [22.68, 43.47], [22.80, 43.41], [22.92, 43.37], [23.03, 43.31],
  [23.12, 43.235], [23.28, 43.175], [23.42, 43.13], [23.55, 43.115], [23.66, 43.10], [23.68, 43.00], [23.70, 42.93], [23.76, 42.865], [23.88, 42.85], [23.96, 42.83], [24.03, 42.805],
  [24.16, 42.84], [24.30, 42.86], [24.45, 42.85], [24.60, 42.84], [24.72, 42.85], [24.85, 42.84], [25.00, 42.85], [25.15, 42.845], [25.32, 42.85],
  [25.48, 42.87], [25.65, 42.88], [25.80, 42.89], [25.92, 42.90], [26.05, 42.92], [26.20, 42.935], [26.35, 42.945], [26.50, 42.96], [26.64, 42.975],
  [26.80, 42.975], [27.00, 42.97], [27.18, 42.975], [27.32, 43.00], [27.40, 43.035], [27.48, 43.20], [27.6, 43.6], [far.E, 43.6]];
const PREDB = [...PREDB_S, [far.E, far.N], [far.W, far.N]];

// ---- 4. Стара планина: its southern foot along the Sub-Balkan basins, west → east (Burel, Sofia, Saran, Kamarsko, Zlatitsa–
// Pirdop, Karlovo, Kazanlak, Sliven, Karnobat, Aytos), snapped onto the break of slope.
const STARA_S = line(
  [[21.9, 43.05], [22.55, 43.04]],
  foot('L', { R: 4 }, [22.55, 43.04], [22.72, 43.00], [22.88, 42.965], [23.02, 42.93], [23.15, 42.88], [23.24, 42.82], [23.38, 42.80], [23.52, 42.76],
    [23.68, 42.735], [23.84, 42.75], [23.98, 42.745], [24.13, 42.73], [24.28, 42.72], [24.45, 42.70], [24.62, 42.675], [24.80, 42.665], [24.98, 42.63],
    [25.15, 42.645], [25.35, 42.675], [25.55, 42.685], [25.75, 42.70], [25.92, 42.715], [26.10, 42.715], [26.32, 42.705], [26.50, 42.705], [26.68, 42.72],
    [26.85, 42.735], [27.00, 42.705], [27.15, 42.72], [27.30, 42.73]),
  [[27.30, 42.73], [27.60, 42.74], [28.4, 42.74]]);
const STARA = [...STARA_S, [far.E, far.N], [far.W, far.N]];

// ---- 5. Краище: north — the southern foot of the Zavala–Plana chain (Greben, Zavalska, Viskyar, Lyulin), east — the
// foothills of Vitosha and Verila, the Dupnitsa basin's edge against Rila, south — the northern foot of Osogovo and Vlahina
// along the Kyustendil basin; the Tran, Breznik, Pernik, Radomir, Kyustendil and Dupnitsa basins are inside.
const KRAISHTE = line(
  [[22.20, 42.92], [22.60, 42.895]],
  foot('L', { R: 3 }, [22.60, 42.895], [22.72, 42.87], [22.82, 42.81], [22.90, 42.775], [23.00, 42.705], [23.08, 42.66], [23.16, 42.625]),
  foot('L', { R: 3 }, [23.16, 42.625], [23.18, 42.57], [23.17, 42.51], [23.20, 42.465], [23.22, 42.41], [23.20, 42.35], [23.21, 42.30]),
  foot('L', { R: 3 }, [23.21, 42.30], [23.16, 42.235], [23.10, 42.19], [23.06, 42.13]),
  foot('L', { R: 3 }, [23.06, 42.13], [22.98, 42.17], [22.88, 42.205], [22.76, 42.22], [22.66, 42.22], [22.55, 42.215], [22.45, 42.20]),
  [[22.45, 42.20], [22.20, 42.20], [22.20, 42.92]]);

// ---- 6. Рило-Родопска област: its northern edge, west → east: (inside Kraishte, which comes first) to the northern foot of
// Rila along the Samokov and Kostenets basins, the Maritsa at Belovo, then the northern foot of the Rhodopes (Belovo – Peshtera
// – Krichim – Perushtitsa – Asenovgrad – south of Parvomay), the Haskovo hills south of the Maritsa, to Svilengrad.
const RR_N = line(
  [[22.20, 42.33], [23.00, 42.34], [23.30, 42.275]],
  foot('R', { R: 3 }, [23.30, 42.275], [23.42, 42.285], [23.53, 42.29], [23.63, 42.295], [23.72, 42.29], [23.80, 42.285], [23.88, 42.28], [23.96, 42.235], [24.03, 42.205]),
  foot('R', { R: 4, f: 0.2 }, [24.03, 42.205], [24.12, 42.12], [24.22, 42.06], [24.32, 42.035], [24.42, 42.04], [24.50, 42.05], [24.58, 42.05], [24.70, 42.045],
    [24.82, 42.025], [24.92, 42.00], [25.05, 42.00], [25.18, 42.02], [25.32, 42.035], [25.45, 42.04], [25.58, 42.03], [25.72, 41.985], [25.86, 41.925], [25.98, 41.875],
    [26.10, 41.815], [26.20, 41.77]),
  [[26.20, 41.77], [26.30, 41.70], [26.6, 41.2]]);
const RILA_RHODOPES = [...RR_N, [26.6, far.S], [far.W, far.S]];
// inside it: Struma (Осогово-Беласишка | Рило-Пиринска), the Rila–Rhodope line Белово – Yadenitsa – Юндола – Аврамова седловина –
// Drechenets, then the Mesta (Рило-Пиринска | Западни Родопи), and Искра – Kayaliyka – Китка – Borovitsa – Arda – Madanska reka
// (Западни | Източни Родопи).
const riverLL = (name, latMax, latMin = 0) => { const REAL = JSON.parse(fs.readFileSync(new URL('../real-map.js', import.meta.url), 'utf8').replace(/^[\s\S]*?const REAL=/, '').replace(/;\s*$/, ''));
  const d = REAL.rivers.find((r) => r.n === name).d; // the longest run inside the latitude band
  const runs = d.split('M').filter(Boolean).map((s) => s.split('L').map((q) => unP(q.trim().split(' ').map(Number))));
  return runs.map((r) => r.filter(([, la]) => la <= latMax && la >= latMin)).sort((a, b) => b.length - a.length)[0]; };
const struma = riverLL('Струма', 42.13, 41.38).sort((a, b) => b[1] - a[1]); // north → south
const mesta = riverLL('Места', 42.03, 41.44).sort((a, b) => b[1] - a[1]);
const OSOGOVO = [[22.0, 42.40], [23.07, 42.40], [23.07, 42.13], ...struma, [23.33, 41.30], [22.0, 41.30]];
const RILA_PIRIN = [[22.0, 42.40], [24.06, 42.40], [24.06, 42.21], [23.99, 42.15], [23.92, 42.09], [23.86, 42.065], [23.80, 42.035], [23.73, 42.03], ...mesta, [24.05, 41.40], [24.1, 41.2], [22.0, 41.2]];
const W_RHODOPES = [[22.0, 42.50], [25.17, 42.50], [25.17, 42.04], [25.15, 41.95], [25.13, 41.87], [25.18, 41.78], [25.22, 41.70], [25.22, 41.655],
  [25.10, 41.60], [25.00, 41.57], [24.95, 41.555], [24.94, 41.50], [24.93, 41.43], [24.92, 41.30], [22.0, 41.30]];

// ---- 7. Задбалкански котловини: their southern edge, the northern foot of the Srednogorie chain, west → east (Viskyar, Lyulin,
// Vitosha, Plana, Lozen, Ihtimanska, Sashtinska and Sarnena Sredna gora), then the Sliven basin, the northern foot of the
// Straldzha field and the Karnobat basin to the Burgas lowland.
const BASINS_S = line(
  [[21.9, 42.97], [22.55, 42.965]],
  foot('R', { R: 3 }, [22.55, 42.965], [22.75, 42.93], [22.90, 42.875], [23.02, 42.81], [23.12, 42.745], [23.20, 42.695], [23.28, 42.645], [23.40, 42.625],
    [23.50, 42.595], [23.60, 42.615], [23.70, 42.625], [23.80, 42.66], [23.92, 42.695], [24.05, 42.685], [24.18, 42.675], [24.30, 42.68], [24.45, 42.66],
    [24.62, 42.625], [24.78, 42.605], [24.92, 42.585], [25.10, 42.58], [25.30, 42.58], [25.50, 42.575], [25.70, 42.60], [25.85, 42.625], [26.00, 42.62]),
  [[26.00, 42.62], [26.20, 42.615], [26.35, 42.585], [26.50, 42.55], [26.65, 42.53], [26.80, 42.54], [26.95, 42.56], [27.12, 42.60], [27.5, 42.60], [28.4, 42.60]]);
const BASINS = [...BASINS_S, [far.E, far.N], [far.W, far.N]];

// ---- 8. Средногорие: its southern edge: (inside Kraishte and Rila, which come first) the southern foot of Ihtimanska,
// Sashtinska and Sarnena Sredna gora from Belovo past Strelcha, Hisarya and Stara Zagora to Sarnena's end by Nova Zagora
// (the tiny Bakadzhik and Hisar hills further east, which some authors add, are left in the plains around them).
const SREDNA_S = line(
  [[21.9, 42.50], [23.30, 42.20], [23.80, 42.20], [24.02, 42.215]],
  foot('L', { R: 4 }, [24.02, 42.215], [24.10, 42.26], [24.18, 42.33], [24.26, 42.41], [24.36, 42.465], [24.50, 42.47], [24.62, 42.475], [24.75, 42.49],
    [24.88, 42.50], [25.00, 42.47], [25.15, 42.445], [25.30, 42.445], [25.45, 42.43], [25.60, 42.42], [25.75, 42.44], [25.88, 42.48], [25.98, 42.53]),
  [[25.98, 42.53], [26.10, 42.66], [26.84, 42.80], [28.4, 42.80]]);
const SREDNA = [...SREDNA_S, [far.E, far.N], [far.W, far.N]];

// ---- 9. Странджа и Сакар: Sakar from the Maritsa at Harmanli–Svilengrad to the Tundzha at Elhovo, the Dervent heights,
// and inland Strandzha north to the Sredetska river (its sea-facing side is in the coastal strip).
const STRANDZHA_SAKAR = line(
  [[26.40, 41.70], [26.33, 41.745], [26.22, 41.795], [26.10, 41.85], [25.98, 41.925]],
  foot('R', { R: 3, f: 0.2 }, [25.98, 41.925], [26.05, 42.00], [26.18, 42.06], [26.33, 42.115], [26.45, 42.11], [26.52, 42.05], [26.62, 42.08], [26.75, 42.12],
    [26.88, 42.18], [27.00, 42.23], [27.10, 42.30], [27.20, 42.33]),
  [[27.20, 42.33], [27.40, 42.32], [27.9, 42.32], [27.9, 41.75], [26.40, 41.70]]);

// ---------------------------------------------------------------- geometry ----
const pts = (geom) => geom.map((p) => [p.lon, p.lat]);
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const close = (r) => (same(r[0], r[r.length - 1]) ? r : [...r, r[0]]);
function join(lines) { // OSM ways → as few lines as possible
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
function simplify(p, tol) { // Douglas-Peucker
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = p[a], [bx, by] = p[b], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [x, y] = p[i]; let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
      const dd = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (dd > md) { md = dd; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
// a lon/lat ring → a simplified, closed map-unit ring
// everything lives on the output's 0.1-unit grid from the start, so neighbours share exactly the vertices that get written out
const r1 = (v) => Math.round(v * 10) / 10;
const grid = (m) => (m.length ? pc.union(m.map((poly) => poly.map((r) => r.map(([x, y]) => [r1(x), r1(y)])))) : m);
const ring = (ll) => close(simplify(close(ll).map(P), TOL)).map(([x, y]) => [r1(x), r1(y)]);

// Bulgaria's land: the OSM relation (it reaches 12 nautical miles out) minus the Black Sea behind the OSM coastline
const bgRel = read('bg-rel.json').elements[0];
const outerRings = join(bgRel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => pts(m.geometry))).filter((l) => l.length > 3 && same(l[0], l[l.length - 1]));
const bgFull = pc.union(...outerRings.map((r) => [[r]]));
const coastJoined = join(read('coast.json').elements.filter((e) => e.type === 'way').map((w) => pts(w.geometry)));
const shore = coastJoined.filter((l) => !same(l[0], l[l.length - 1])).sort((a, b) => b.length - a.length)[0];
const [sLon, sLat] = shore[0], [nLon, nLat] = shore[shore.length - 1];
const sea = pc.intersection([[close([...shore, [nLon, nLat + 2], [32, nLat + 2], [32, sLat - 2], [sLon, sLat - 2]])]], [[[[27.2, 41.2], [29.4, 41.2], [29.4, 44.6], [27.2, 44.6], [27.2, 41.2]]]]);
const islands = coastJoined.filter((l) => same(l[0], l[l.length - 1]) && l.length > 3); // islets stay with the land
const land = pc.union(pc.difference(bgFull, sea), ...islands.map((r) => pc.intersection([[r]], bgFull)));
// to map units, each ring simplified once, tiny bits dropped
const LAND = grid(land.map((poly) => poly.map((r) => close(simplify(r.map(P), TOL)))).filter((poly) => poly[0].length > 3));

// cut in order: each region is its shape ∩ land minus everything cut before it
const ORDER = [
  ['coast', COAST], ['danube', DANUBE], ['predbalkan', PREDB], ['stara', STARA], ['kraishte', KRAISHTE], ['rr', RILA_RHODOPES],
  ['basins', BASINS], ['sredna', SREDNA], ['strandzha', STRANDZHA_SAKAR],
];
const cut = {}; let taken = [];
for (const [k, shape] of ORDER) { const g = grid(pc.difference(pc.intersection(LAND, [[ring(shape)]]), ...(taken.length ? [taken] : []))); cut[k] = g; taken = taken.length ? pc.union(taken, g) : g; }
cut.thrace = grid(pc.difference(LAND, taken));
// Rila-Rhodope split inside
const rr = cut.rr;
cut.osogovo = grid(pc.intersection(rr, [[ring(OSOGOVO)]]));
cut.rilapirin = grid(pc.difference(pc.intersection(rr, [[ring(RILA_PIRIN)]]), cut.osogovo));
cut.wrhod = grid(pc.difference(pc.intersection(rr, [[ring(W_RHODOPES)]]), cut.osogovo, cut.rilapirin));
cut.erhod = grid(pc.difference(rr, cut.osogovo, cut.rilapirin, cut.wrhod));

// ---------------------------------------------------------------- output ----
// slivers left where lines meet (pieces under ~4 km²) go to the neighbour they share the most corners with
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const LEAVES = ['coast', 'danube', 'predbalkan', 'stara', 'kraishte', 'basins', 'sredna', 'thrace', 'strandzha', 'osogovo', 'rilapirin', 'wrhod', 'erhod'];
{
  const vkey = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const moves = [];
  for (const k of LEAVES) for (const poly of cut[k]) if (Math.abs(ringArea(poly[0])) < 30) moves.push([k, poly]);
  for (const [k, poly] of moves) {
    cut[k] = cut[k].filter((q) => q !== poly);
    const mine = new Set(poly[0].map(vkey)); let best = null, bn = 0;
    for (const o of LEAVES) if (o !== k) { let n = 0; for (const q of cut[o]) for (const r of q) for (const p of r) if (mine.has(vkey(p))) n++; if (n > bn) { bn = n; best = o; } }
    if (best) cut[best] = grid(pc.union(cut[best], [poly])); else if (Math.abs(ringArea(poly[0])) > 1) cut[k].push(poly); // an islet keeps its place
    console.log(`  sliver ${Math.abs(ringArea(poly[0])).toFixed(1)} u² of ${k} → ${best || 'kept'}`);
  }
}
cut.rr = pc.union(cut.osogovo, cut.rilapirin, cut.wrhod, cut.erhod);
const km2 = (m) => { // spherical area of map-unit polygons
  const R = 6371.0088, t = Math.PI / 180; let A = 0;
  for (const poly of m) poly.forEach((r, i) => { const ll = r.map(unP); let a = 0;
    for (let j = 0; j < ll.length - 1; j++) a += (ll[j + 1][0] - ll[j][0]) * t * (Math.sin(ll[j][1] * t) + Math.sin(ll[j + 1][1] * t)) / 2;
    A += (i ? -1 : 1) * Math.abs(a) * R * R; });
  return A; };
const path = (m) => m.map((poly) => poly.map((r) => 'M' + r.slice(0, -1).map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z').join('')).join('');
// pole of inaccessibility (polylabel) of the biggest piece
function labelAt(m) {
  const poly = m.slice().sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
  const segDist = (px, py, a, b) => { let [x, y] = a; let dx = b[0] - x, dy = b[1] - y; if (dx || dy) { const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } } dx = px - x; dy = py - y; return dx * dx + dy * dy; };
  const dist = (x, y) => { let inside = false, md = Infinity; for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; md = Math.min(md, segDist(x, y, a, b)); }
    return (inside ? 1 : -1) * Math.sqrt(md); };
  const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const cell = (x, y, s) => { const d = dist(x, y); return { x, y, s, d, max: d + s * Math.SQRT2 }; };
  let s = Math.min(w, h) / 2, q = [], best = cell(x0 + w / 2, y0 + h / 2, 0);
  for (let x = x0; x < x0 + w; x += 2 * s) for (let y = y0; y < y0 + h; y += 2 * s) q.push(cell(x + s, y + s, s));
  while (q.length) { q.sort((a, b) => b.max - a.max); const c = q.shift(); if (c.d > best.d) best = c; if (c.max - best.d <= 0.5) continue;
    const hs = c.s / 2; q.push(cell(c.x - hs, c.y - hs, hs), cell(c.x + hs, c.y - hs, hs), cell(c.x - hs, c.y + hs, hs), cell(c.x + hs, c.y + hs, hs)); }
  return [r1(best.x), r1(best.y)];
}
const U = (...ks) => pc.union(...ks.map((k) => cut[k]));
const DEF = [ // name, parent, colour, geometry
  ['Дунавска равнина', null, '#cfe6a8', cut.danube],
  ['Старопланинска област', null, '#f1cf98', U('predbalkan', 'stara')],
  ['Предбалкан', 'Старопланинска област', '#f6e0b0', cut.predbalkan],
  ['Стара планина', 'Старопланинска област', '#e8bd84', cut.stara],
  ['Краищенско-Средногорска област', null, '#f4e7a3', U('kraishte', 'basins', 'sredna', 'thrace', 'strandzha')],
  ['Краище', 'Краищенско-Средногорска област', '#eed29a', cut.kraishte],
  ['Задбалкански котловини', 'Краищенско-Средногорска област', '#f8efb6', cut.basins],
  ['Средногорие', 'Краищенско-Средногорска област', '#e4d28c', cut.sredna],
  ['Горнотракийско-Тунджанска низина', 'Краищенско-Средногорска област', '#f2f4c2', cut.thrace],
  ['Странджа и Сакар', 'Краищенско-Средногорска област', '#dfe3a2', cut.strandzha],
  ['Рило-Родопска област', null, '#e7c4da', cut.rr],
  ['Осогово-Беласишка подобласт', 'Рило-Родопска област', '#efd3e4', cut.osogovo],
  ['Рила и Пирин', 'Рило-Родопска област', '#dbb0cd', cut.rilapirin],
  ['Западни Родопи', 'Рило-Родопска област', '#e6c0d8', cut.wrhod],
  ['Източни Родопи', 'Рило-Родопска област', '#f2dbe8', cut.erhod],
  ['Черноморско крайбрежие', null, '#bcdcef', cut.coast],
];
const REGIONS = DEF.map(([n, parent, color, m]) => { return { n, parent, color, d: path(m), at: labelAt(m), _km2: Math.round(km2(m)) }; });
const total = Math.round(km2(LAND));
for (const r of REGIONS) console.log(`${r.parent ? '   ' : ''}${r.n}: ${r._km2} km² (${((r._km2 / total) * 100).toFixed(1)}%)`);
console.log('land total', total, 'km²; parents sum', REGIONS.filter((r) => !r.parent).reduce((s, r) => s + r._km2, 0));
const out = REGIONS.map(({ _km2, ...r }) => r);
fs.writeFileSync(new URL('../regions.js', import.meta.url),
  '/* generated by tools/build-regions.mjs: natural-geographic regions of Bulgaria (school division: Дунавска равнина, Старопланинска, Краищенско-Средногорска (Преходна), Рило-Родопска области + Черноморско крайбрежие; after bg.wikipedia "География на България" and its regional articles, from М. Георгиев, Физическа география на България, 1979), boundaries on Terrain Tiles heights, clipped to OpenStreetMap Bulgaria (ODbL); do not edit */\nconst REGIONS=' +
  JSON.stringify(out).replace(/"(n|parent|color|d|at)":/g, '$1:') + ';\n');
