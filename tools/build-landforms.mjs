// node build-landforms.mjs [--fetch] [--preview DIR] → ../landforms.js (relief forms) + ../peaks.js (summits)
//
// The relief forms of a school physical map — mountains, plateaus, plains, lowlands and valleys — outlined from the
// heights themselves, not drawn by eye:
//  1. Heights: Terrain Tiles (terrarium, z10, ~110 m a pixel) resampled onto a grid of half map units (~185 m).
//  2. Mountain ground = where the smoothed height stands above the local foot level (the lowest ground within ~11 km)
//     by 30 % of the local foot-to-top range, kept between 130 and 250 m, so low ranges (Странджа, Сакар, Източни
//     Родопи) count while the Danube plain's valleys don't. Outline calmed, small holes filled, specks dropped.
//  3. Every form is named by seeds: summits (peaks.js) for mountains, high points for plateaus, towns for lowlands.
//     The seeds then compete for the ground in four priority-flood rounds:
//       1 plateaus  — from their high points over ground above their own floor height h0, by cost distance (a step
//                     costs more the more it climbs, so neighbours part in the valleys), at most `reach` km out; a few
//                     hidden neighbours (Разград heights, the hills west of Бели Лом, Стана…) compete too so the
//                     plateau edges fall in the valleys bg Wikipedia names, then hand their ground back;
//       2 lowlands  — valleys, plains and lowlands together, from their towns over non-mountain ground by cost distance
//                     (1 + 0.3 per metre up or down), so two basins meet on the threshold between them; no form goes
//                     more than dh above or below its seeds, valleys no further than `reach`, a низина only over flat
//                     ground (local relief within ~2.5 km under `flat` m);
//       3 mountains — fill downhill from their summits over mountain ground (watershed), so two mountains meet along
//                     the valleys and passes between them (Рила/Пирин at Предела, the Стара планина parts at Арабаконак
//                     and Вратник, the Средна гора parts along Тополница and Стряма); `floor`: below it a mountain
//                     doesn't climb again, so it stops at the lower ranges beside it instead of swallowing them;
//                     Предбалкан is seeded at every hilltop of OSM's Стара планина ~9 km or more north of the main ridge;
//       4 plains    — grow on (≤ 6 km) over the hills in their zone that no mountain took.
//     Zones: OSM outlines of Западни/Източни Родопи, Стара планина (for Предбалкан) and Дунавска равнина, widened by
//     a few km so the terrain, not the OSM line, draws the edge.
//  4. Tidy: thin tongues up gorges are cut off (opening), stray islands dropped, small holes filled, edges smoothed.
//  5. Outlines are traced once per shared border (so neighbours share every vertex and never overlap), smoothed,
//     simplified to ~0.6 units and clipped to Bulgaria (OSM relation minus the sea behind the OSM coastline); mountains
//     crossing the border are clipped at it.
// Peaks: Wikidata (P625 coordinates, P2044 height) cross-checked with the bg Wikipedia infobox ("височина"); where the
// two differ the bg Wikipedia height is used (it follows the Bulgarian topographic maps). --fetch refreshes both caches
// in landforms-src/.
import fs from 'fs';
import sharp from 'sharp';
import pc from 'polygon-clipping';

const SRC = new URL('./landforms-src/', import.meta.url), DATA = new URL('./data/', import.meta.url), ROOT = new URL('../', import.meta.url);
const readJ = (u) => JSON.parse(fs.readFileSync(u, 'utf8'));
const CX = Math.cos((42.7 * Math.PI) / 180), K = 300;
const P = ([lon, lat]) => [(lon - 15) * CX * K, (47 - lat) * K];
const unP = ([x, y]) => [x / (CX * K) + 15, 47 - y / K];
const UA = { 'User-Agent': 'landforms-build/1.0' };

// ======================================================================================================================
// Peaks: [name, Wikidata id, mountain (a form name below)]
// ======================================================================================================================
const PEAK_LIST = [
  ['Мусала', 'Q209341', 'Рила'], ['Мальовица', 'Q210004', 'Рила'], ['Белмекен', 'Q26144', 'Рила'],
  ['Вихрен', 'Q1140684', 'Пирин'], ['Кутело', 'Q59836', 'Пирин'], ['Тодорка', 'Q7812850', 'Пирин'], ['Синаница', 'Q12293800', 'Пирин'],
  ['Ореляк', 'Q12289306', 'Пирин'],
  ['Миджур', 'Q962856', 'Западна Стара планина'], ['Ком', 'Q846340', 'Западна Стара планина'],
  ['Тодорини кукли', 'Q12296633', 'Западна Стара планина'], ['Мургаш', 'Q11786693', 'Западна Стара планина'],
  ['Околчица', 'Q3321997', 'Предбалкан'],
  ['Ботев', 'Q894703', 'Централна Стара планина'], ['Вежен', 'Q7924249', 'Централна Стара планина'],
  ['Голям Купен', 'Q8364919', 'Централна Стара планина'], ['Голям Кадемлия', 'Q52187216', 'Централна Стара планина'],
  ['Бузлуджа', 'Q15987051', 'Централна Стара планина'], ['Шипка', 'Q134217', 'Централна Стара планина'],
  ['Чумерна', 'Q12299263', 'Централна Стара планина'],
  ['Българка', 'Q12274177', 'Източна Стара планина'],
  ['Черни връх', 'Q849657', 'Витоша'], ['Камен дел', 'Q6356657', 'Витоша'],
  ['Голям Перелик', 'Q1548833', 'Западни Родопи'], ['Голяма Сюткя', 'Q12277138', 'Западни Родопи'],
  ['Баташки снежник', 'Q12272992', 'Западни Родопи'], ['Голям Персенк', 'Q3110295', 'Западни Родопи'], ['Мечи чал', 'Q12286617', 'Западни Родопи'],
  ['Вейката', 'Q12274952', 'Източни Родопи'], ['Мъгленик', 'Q11787533', 'Източни Родопи'],
  ['Голям Богдан', 'Q576796', 'Същинска Средна гора'], ['Братан', 'Q102313267', 'Сърнена Средна гора'],
  ['Бенковски', 'Q95229679', 'Ихтиманска Средна гора'],
  ['Руен', 'Q46499', 'Осогово'], ['Радомир', 'Q7281542', 'Беласица'], ['Тумба', 'Q2458111', 'Беласица'],
  ['Гоцев връх', 'Q12277264', 'Славянка'], ['Дупевица', 'Q12279222', 'Люлин'], ['Манастирище', 'Q12285797', 'Плана'],
  ['Голям Дебелец', 'Q21780834', 'Верила'], ['Виден', 'Q12275221', 'Конявска планина'], ['Милевец', 'Q12286711', 'Милевска планина'],
  ['Руй', 'Q12292614', 'Руй'], ['Кадийца', 'Q6547737', 'Влахина'], ['Ильов връх', 'Q12281701', 'Малешевска планина'],
  ['Маркови кладенци', 'Q12286217', 'Огражден'], ['Градище', 'Q56394805', 'Странджа'], ['Папия', 'Q41524058', 'Странджа'],
  ['Вишеград', 'Q9375421', 'Сакар'],
];

// ======================================================================================================================
// Forms. seeds: peak names or [lon, lat]. Mountains fill downhill over mountain ground (floor: below this height they
// don't climb again, so they stop at the lower ranges next to them instead of swallowing them); plateaus over ground above h0;
// lowlands ('plain' | 'lowland' | 'valley') outward from their seeds, at most dh metres above/below a seed.
// zone: an OSM relation id (widened by `grow` km) or a lon/lat box [lon0, lat0, lon1, lat1]; the form stays inside it.
// ======================================================================================================================
const FORMS = [
  // ---- Стара планина: West to the Arabakonak (Botevgrad) pass, Central to Vratnik, East to Emine ----
  { n: 'Западна Стара планина', k: 'mountain', seeds: ['Миджур', 'Ком', 'Тодорини кукли', 'Мургаш', [23.29, 43.03]] },
  { n: 'Централна Стара планина', k: 'mountain', seeds: ['Вежен', 'Ботев', 'Голям Купен', 'Бузлуджа', 'Шипка', 'Чумерна', [23.996, 42.744]] },
  { n: 'Източна Стара планина', k: 'mountain', seeds: ['Българка', [26.414, 42.858], [26.683, 42.897], [26.966, 42.797], [27.5, 42.83]] },
  { n: 'Предбалкан', k: 'mountain', seeds: ['Околчица'], autoSeeds: { osm: 18306789, ridge: [[22.3, 43.6], [22.68, 43.39], [23.05, 43.17], [23.67, 42.83],
    [24.0, 42.74], [24.35, 42.756], [24.93, 42.717], [25.39, 42.736], [25.97, 42.78], [26.32, 42.75], [26.41, 42.86], [26.68, 42.9], [27.2, 42.85], [27.9, 42.72], [28.2, 42.72]] },
    zone: { osm: 18306789, grow: 2 } },
  // ---- Рило-Родопски масив ----
  { n: 'Рила', k: 'mountain', floor: 1250, seeds: ['Мусала', 'Мальовица', 'Белмекен', [23.358, 41.945]] },
  { n: 'Пирин', k: 'mountain', seeds: ['Вихрен', 'Синаница', 'Тодорка', 'Ореляк', [23.629, 41.522]] },
  { n: 'Западни Родопи', k: 'mountain', seeds: ['Голям Перелик', 'Голяма Сюткя', 'Баташки снежник', 'Голям Персенк', 'Мечи чал'], zone: { osm: 18629756, grow: 4 } },
  { n: 'Източни Родопи', k: 'mountain', seeds: ['Вейката', 'Мъгленик', [25.45, 41.55], [25.85, 41.6], [25.15, 41.45]], zone: { osm: 18627976, grow: 4 } },
  { n: 'Славянка', k: 'mountain', seeds: ['Гоцев връх'] },
  { n: 'Беласица', k: 'mountain', seeds: ['Радомир', 'Тумба'] },
  { n: 'Огражден', k: 'mountain', seeds: ['Маркови кладенци'] },
  { n: 'Малешевска планина', k: 'mountain', seeds: ['Ильов връх'] },
  { n: 'Влахина', k: 'mountain', seeds: ['Кадийца'] },
  { n: 'Осогово', k: 'mountain', seeds: ['Руен', [22.571, 42.29]] },
  // ---- Краище и Средногорие ----
  { n: 'Витоша', k: 'mountain', seeds: ['Черни връх', 'Камен дел'] },
  { n: 'Люлин', k: 'mountain', floor: 950, seeds: ['Дупевица'] },
  { n: 'Плана', k: 'mountain', seeds: ['Манастирище'] },
  { n: 'Верила', k: 'mountain', seeds: ['Голям Дебелец'] },
  { n: 'Конявска планина', k: 'mountain', seeds: ['Виден'] },
  { n: 'Милевска планина', k: 'mountain', floor: 1150, seeds: ['Милевец'] },
  { n: 'Руй', k: 'mountain', floor: 1200, seeds: ['Руй'] },
  { n: 'Земенска планина', k: 'mountain', floor: 950, seeds: [[22.689, 42.513]] },
  { n: 'Голо бърдо', k: 'mountain', floor: 900, seeds: [[23.068, 42.552]] },
  { n: 'Ихтиманска Средна гора', k: 'mountain', seeds: ['Бенковски', [23.659, 42.458], [23.493, 42.582], [23.631, 42.283]] },
  { n: 'Същинска Средна гора', k: 'mountain', seeds: ['Голям Богдан', [24.158, 42.597]] },
  { n: 'Сърнена Средна гора', k: 'mountain', seeds: ['Братан', [25.6, 42.47]] },
  { n: 'Сакар', k: 'mountain', seeds: ['Вишеград'] },
  { n: 'Странджа', k: 'mountain', seeds: ['Градище', 'Папия'] },
  // ---- plateaus (north-east) ----
  // Plateaus fill downhill from their high points over ground above their h0, all at once, so neighbours meet in the
  // valleys between them. Лудогорско плато reaches west to the Бели Лом / Топчийска valleys and south up to the Разград
  // and Самуил heights, Добруджанско плато south to the Стана plateau and the Батова valley (bg Wikipedia): those
  // neighbours get hidden seeds of their own, so the edges fall in the valleys, then their ground is handed back.
  { n: 'Лудогорско плато', k: 'plateau', reach: 40, h0: 200, seeds: [[26.75, 43.72], [26.95, 43.68], [27.1, 43.75], [26.55, 43.7]] },
  { n: 'Добруджанско плато', k: 'plateau', reach: 45, h0: 30, seeds: [[27.6, 43.6], [27.85, 43.7], [27.4, 43.75], [28.1, 43.65]] },
  { n: 'Шуменско плато', k: 'plateau', reach: 12, h0: 250, seeds: [[26.87, 43.28]] },
  { n: 'Провадийско плато', k: 'plateau', reach: 20, h0: 180, seeds: [[27.13, 43.25], [27.3, 43.17], [27.4, 43.13]] },
  { n: 'Франгенско плато', k: 'plateau', reach: 14, h0: 150, seeds: [[27.82, 43.26], [27.67, 43.28]] },
  { n: 'Авренско плато', k: 'plateau', reach: 20, h0: 80, seeds: [[27.67, 43.115]] },
  { n: 'Деветашко плато', k: 'plateau', reach: 16, h0: 300, seeds: [[25.0, 43.17], [24.92, 43.15], [25.08, 43.2]] },
  { n: 'Ловчански и Севлиевски височини', k: 'plateau', hidden: true, reach: 15, h0: 300, seeds: [[24.82, 43.06], [25.15, 43.05], [24.98, 43.04]] },
  { n: 'Разградски и Самуиловски височини', k: 'plateau', reach: 25, hidden: true, h0: 150, seeds: [[26.55, 43.47], [26.75, 43.5], [26.4, 43.42]] },
  { n: 'хълмове западно от Бели Лом', k: 'plateau', reach: 30, hidden: true, h0: 150, seeds: [[26.1, 43.6], [26.2, 43.45], [25.95, 43.5]] },
  { n: 'Поповски и Търговищки височини', k: 'plateau', reach: 25, hidden: true, h0: 150, seeds: [[26.25, 43.33], [26.55, 43.27]] },
  { n: 'Стана', k: 'plateau', reach: 15, hidden: true, h0: 120, seeds: [[27.4, 43.36], [27.5, 43.33]] },
  // ---- plains and lowlands ----
  { n: 'Дунавска равнина', k: 'plain', dh: 260, seeds: [[22.88, 43.98], [23.6, 43.75], [24.62, 43.42], [25.35, 43.6], [25.95, 43.8], [24.0, 43.6]], zone: { osm: 18155583, grow: 12 } },
  { n: 'Горнотракийска низина', k: 'lowland', dh: 160, flat: 60, o: 2.2, seeds: [[24.33, 42.19], [24.75, 42.15], [25.33, 42.2], [25.6, 42.05], [25.65, 42.33]] },
  { n: 'Тунджанска хълмиста равнина', k: 'plain', dh: 180, flat: 120, seeds: [[26.5, 42.48], [26.57, 42.17]] },
  { n: 'Бургаска низина', k: 'lowland', dh: 140, flat: 80, seeds: [[27.43, 42.52], [27.25, 42.70]], zone: { box: [26.9, 42.25, 27.95, 42.85] } },
  // ---- valleys (котловини) ----
  { n: 'Софийска котловина', k: 'valley', dh: 200, reach: 30, seeds: [[23.32, 42.70], [23.6, 42.67], [23.15, 42.75]] },
  { n: 'Пернишка котловина', k: 'valley', dh: 180, reach: 25, seeds: [[23.03, 42.60]] },
  { n: 'Радомирска котловина', k: 'valley', dh: 160, reach: 25, seeds: [[22.96, 42.545]] },
  { n: 'Кюстендилска котловина', k: 'valley', dh: 200, reach: 25, seeds: [[22.69, 42.28]] },
  { n: 'Дупнишка котловина', k: 'valley', dh: 180, reach: 25, seeds: [[23.12, 42.26]] },
  { n: 'Самоковска котловина', k: 'valley', dh: 180, reach: 25, seeds: [[23.56, 42.34]] },
  { n: 'Ихтиманска котловина', k: 'valley', dh: 160, reach: 25, seeds: [[23.82, 42.43]] },
  { n: 'Благоевградска котловина', k: 'valley', dh: 200, reach: 25, seeds: [[23.10, 42.02]] },
  { n: 'Санданско-Петричка котловина', k: 'valley', dh: 220, reach: 25, seeds: [[23.27, 41.56], [23.2, 41.42]] },
  { n: 'Разложка котловина', k: 'valley', dh: 180, reach: 25, seeds: [[23.47, 41.88]] },
  { n: 'Гоцеделчевска котловина', k: 'valley', dh: 200, reach: 25, seeds: [[23.73, 41.57]] },
  { n: 'Златишко-Пирдопска котловина', k: 'valley', dh: 160, reach: 25, seeds: [[24.13, 42.70]] },
  { n: 'Карловска котловина', k: 'valley', dh: 100, reach: 14, seeds: [[24.81, 42.63], [24.6, 42.65]] },
  { n: 'Казанлъшка котловина', k: 'valley', dh: 130, reach: 25, seeds: [[25.40, 42.62], [25.2, 42.6]] },
  { n: 'Сливенска котловина', k: 'valley', dh: 160, reach: 25, seeds: [[26.25, 42.66]] },
  { n: 'Карнобатска котловина', k: 'valley', dh: 140, reach: 25, seeds: [[26.98, 42.65]] },
];

// ======================================================================================================================
// --fetch: Wikidata + bg Wikipedia for the peaks
// ======================================================================================================================
async function fetchPeaks() {
  const ids = PEAK_LIST.map((p) => 'wd:' + p[1]).join(' ');
  const q = `SELECT ?p ?bg ?h ?coord ?art WHERE { VALUES ?p { ${ids} } ?p wdt:P625 ?coord. OPTIONAL { ?p wdt:P2044 ?h }
    OPTIONAL { ?p rdfs:label ?bg FILTER(lang(?bg)="bg") } OPTIONAL { ?art schema:about ?p; schema:isPartOf <https://bg.wikipedia.org/> } }`;
  const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error('wikidata ' + r.status);
  const wd = await r.json();
  fs.writeFileSync(new URL('peaks-wikidata.json', SRC), JSON.stringify(wd, null, 1));
  const titles = [...new Set(wd.results.bindings.filter((b) => b.art).map((b) => decodeURIComponent(b.art.value.split('/wiki/')[1]).replace(/_/g, ' ')))];
  const pages = [];
  for (let i = 0; i < titles.length; i += 40) {
    const u = 'https://bg.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      format: 'json', formatversion: '2', redirects: '1', titles: titles.slice(i, i + 40).join('|') });
    let j;
    for (let wait = 5000; ; wait *= 2) { // the API asks bots to back off now and then
      const r = await fetch(u, { headers: UA }); const t = await r.text();
      try { j = JSON.parse(t); break; } catch { if (wait > 80000) throw new Error('bg wikipedia: ' + t.slice(0, 80)); await new Promise((ok) => setTimeout(ok, wait)); }
    }
    for (const p of j.query.pages) {
      const t = p.revisions?.[0]?.slots?.main?.content || '';
      const f = (k) => (t.match(new RegExp('\\|\\s*' + k + '\\s*=\\s*([^\\n|]*)')) || [])[1]?.trim() || null;
      pages.push({ title: p.title, h: f('височина'), lat: f('гео-ширина'), lon: f('гео-дължина') });
    }
  }
  fs.writeFileSync(new URL('peaks-bgwiki.json', SRC), JSON.stringify(pages, null, 1));
}

function peaks() {
  const wd = readJ(new URL('peaks-wikidata.json', SRC)).results.bindings, bgw = readJ(new URL('peaks-bgwiki.json', SRC));
  const notes = [];
  const out = PEAK_LIST.map(([n, q, m]) => {
    const b = wd.find((x) => x.p.value.endsWith('/' + q));
    if (!b) throw new Error('no wikidata for ' + n);
    const [lon, lat] = b.coord.value.match(/-?[\d.]+/g).map(Number);
    let h = b.h ? Math.round(+b.h.value) : null;
    const title = b.art && decodeURIComponent(b.art.value.split('/wiki/')[1]).replace(/_/g, ' ');
    const w = title && bgw.find((p) => p.title === title);
    const wh = w?.h && parseFloat(w.h.replace(',', '.').replace(/[^\d.]/g, ''));
    if (wh && (h == null || Math.abs(wh - h) >= 1)) { notes.push(`${n}: Wikidata ${h ?? '—'} m, bg Wikipedia ${wh} m → ${Math.round(wh)}`); h = Math.round(wh); }
    if (h == null) throw new Error('no height for ' + n);
    return { n, h, m, c: [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4], q };
  });
  return { list: out, notes };
}

// ======================================================================================================================
// Geometry helpers (lon/lat polygons, OSM relations)
// ======================================================================================================================
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
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
const pts = (g) => g.map((p) => [p.lon, p.lat]);
const rings = (lines) => join(lines).filter((l) => l.length > 3 && same(l[0], l[l.length - 1]));
function relPoly(rel) {
  const outer = rings(rel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => pts(m.geometry)));
  const inner = rings(rel.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => pts(m.geometry)));
  if (!outer.length) return [];
  const o = pc.union(...outer.map((r) => [[r]]));
  return inner.length ? pc.difference(o, ...inner.map((r) => [[r]])) : o;
}
const toMap = (mp) => mp.map((poly) => poly.map((r) => r.map(P)));

// Bulgaria's land: the OSM relation (it reaches 12 nautical miles out to sea) minus the sea behind the OSM coastline
function bulgariaLand() {
  const bgFull = relPoly(readJ(new URL('bg-rel.json', DATA)).elements[0]);
  const coast = join(readJ(new URL('coast.json', DATA)).elements.filter((e) => e.type === 'way').map((w) => pts(w.geometry)));
  const islands = coast.filter((l) => same(l[0], l[l.length - 1]) && l.length > 3);
  const shore = coast.filter((l) => !same(l[0], l[l.length - 1])).sort((a, b) => b.length - a.length)[0];
  const [sLon, sLat] = shore[0], [nLon, nLat] = shore[shore.length - 1];
  const seaRing = [...shore, [nLon, nLat + 2], [32, nLat + 2], [32, sLat - 2], [sLon, sLat - 2], shore[0]];
  let sea = pc.intersection([[seaRing]], [[[[27.2, 41.2], [29.4, 41.2], [29.4, 44.6], [27.2, 44.6], [27.2, 41.2]]]]);
  if (islands.length) sea = pc.difference(sea, ...islands.map((r) => [[r]]));
  return pc.difference(bgFull, sea);
}

// ======================================================================================================================
// Grid
// ======================================================================================================================
const RES = 2, GX0 = 1568, GY0 = 781, GX1 = 3056, GY1 = 1785; // half-unit cells over Bulgaria's box plus ~15 km
const GW = (GX1 - GX0) * RES, GH = (GY1 - GY0) * RES, N = GW * GH;
const cellOf = ([x, y]) => Math.floor((y - GY0) * RES) * GW + Math.floor((x - GX0) * RES);
const cellLL = (ll) => cellOf(P(ll));
const KM = (1000 / (111200 / K)) * RES; // cells per km (a map unit is ~0.37 km)
const cells = (km) => Math.max(1, Math.round(km * KM));
const cellKm2 = (1 / KM) ** 2;

async function heights() {
  const Z = 10, T = 256, dir = new URL('tiles/', DATA);
  const gx = (lon) => ((lon + 180) / 360) * 2 ** Z * T;
  const gy = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * T; };
  const [lonA, latA] = unP([GX0, GY0]), [lonB, latB] = unP([GX1, GY1]);
  const tx0 = Math.floor(gx(lonA) / T), tx1 = Math.floor(gx(lonB) / T), ty0 = Math.floor(gy(latA) / T), ty1 = Math.floor(gy(latB) / T);
  const MW = (tx1 - tx0 + 1) * T, MH = (ty1 - ty0 + 1) * T, mos = new Float32Array(MW * MH);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const f = new URL(`${Z}-${tx}-${ty}.png`, dir);
    if (!fs.existsSync(f)) {
      const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
      if (!r.ok) throw new Error(`tile ${tx},${ty}: ${r.status}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    const { data } = await sharp(fs.readFileSync(f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ox = (tx - tx0) * T, oy = (ty - ty0) * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const o = (j * T + i) * 3; mos[(oy + j) * MW + ox + i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768; }
  }
  const E = new Float32Array(N), colX = new Float64Array(GW);
  for (let c = 0; c < GW; c++) colX[c] = gx(unP([GX0 + (c + .5) / RES, 0])[0]) - tx0 * T - .5;
  for (let r = 0; r < GH; r++) {
    const Y = gy(unP([0, GY0 + (r + .5) / RES])[1]) - ty0 * T - .5, j = Math.floor(Y), v = Y - j;
    for (let c = 0; c < GW; c++) {
      const X = colX[c], i = Math.floor(X), u = X - i, o = j * MW + i;
      E[r * GW + c] = mos[o] * (1 - u) * (1 - v) + mos[o + 1] * u * (1 - v) + mos[o + MW] * (1 - u) * v + mos[o + MW + 1] * u * v;
    }
  }
  return E;
}

// ---- raster helpers ----
function boxBlur(src, r) {
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let y = 0; y < GH; y++) { let s = 0; const o = y * GW; for (let x = -r; x <= r; x++) s += src[o + Math.max(0, Math.min(GW - 1, x))];
    for (let x = 0; x < GW; x++) { a[o + x] = s / (2 * r + 1); s += src[o + Math.min(GW - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < GW; x++) { let s = 0; for (let y = -r; y <= r; y++) s += a[Math.max(0, Math.min(GH - 1, y)) * GW + x];
    for (let y = 0; y < GH; y++) { b[y * GW + x] = s / (2 * r + 1); s += a[Math.min(GH - 1, y + r + 1) * GW + x] - a[Math.max(0, y - r) * GW + x]; } }
  return b;
}
function runMinMax(src, dst, n, stride, off, r, isMin) { // van Herk / Gil-Werman
  const k = 2 * r + 1, g = new Float32Array(n + k), h = new Float32Array(n + k), f = isMin ? Math.min : Math.max, pad = isMin ? Infinity : -Infinity;
  const v = (i) => (i < r || i >= n + r ? pad : src[off + (i - r) * stride]);
  for (let i = 0; i < n + k; i++) g[i] = i % k === 0 ? v(i) : f(g[i - 1], v(i));
  for (let i = n + k - 1; i >= 0; i--) h[i] = i % k === k - 1 || i === n + k - 1 ? v(i) : f(h[i + 1], v(i));
  for (let i = 0; i < n; i++) dst[off + i * stride] = f(h[i], g[i + k - 1]);
}
function rank(src, r, isMin) {
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let y = 0; y < GH; y++) runMinMax(src, a, GW, 1, y * GW, r, isMin);
  for (let x = 0; x < GW; x++) runMinMax(a, b, GH, GW, x, r, isMin);
  return b;
}
// binary masks (Float32 0/1); round (chamfer-distance) structuring elements so outlines don't turn boxy
function chamfer(inside, W = GW, H = GH) { // distance (cells) from each inside cell to the nearest outside one
  const D = new Float32Array(W * H), S = Math.SQRT2;
  for (let i = 0; i < W * H; i++) D[i] = inside[i] > 0 ? 1e9 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!D[i]) continue;
    const l = x > 0 ? D[i - 1] : 0, u = y > 0 ? D[i - W] : 0, ul = x > 0 && y > 0 ? D[i - W - 1] : 0, ur = x < W - 1 && y > 0 ? D[i - W + 1] : 0;
    D[i] = Math.min(D[i], l + 1, u + 1, ul + S, ur + S); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!D[i]) continue;
    const r = x < W - 1 ? D[i + 1] : 0, d = y < H - 1 ? D[i + W] : 0, dr = x < W - 1 && y < H - 1 ? D[i + W + 1] : 0, dl = x > 0 && y < H - 1 ? D[i + W - 1] : 0;
    D[i] = Math.min(D[i], r + 1, d + 1, dr + S, dl + S); }
  return D;
}
const notM = (m) => m.map((v) => (v > 0 ? 0 : 1));
const erode = (m, r, W, H) => chamfer(m, W, H).map((d) => (d > r ? 1 : 0));
const dilate = (m, r, W, H) => notM(erode(notM(m), r, W, H));
const open = (m, r, W, H) => dilate(erode(m, r, W, H), r, W, H), close = (m, r, W, H) => erode(dilate(m, r, W, H), r, W, H);

// 4-connected components of cells where pred(i); returns [labels Int32Array, sizes]
function components(pred) {
  const lab = new Int32Array(N), sizes = [0], st = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (lab[i] || !pred(i)) continue;
    const id = sizes.length; let sp = 0, n = 0; st[sp++] = i; lab[i] = id;
    while (sp) {
      const j = st[--sp]; n++; const x = j % GW;
      if (x > 0 && !lab[j - 1] && pred(j - 1)) { lab[j - 1] = id; st[sp++] = j - 1; }
      if (x < GW - 1 && !lab[j + 1] && pred(j + 1)) { lab[j + 1] = id; st[sp++] = j + 1; }
      if (j >= GW && !lab[j - GW] && pred(j - GW)) { lab[j - GW] = id; st[sp++] = j - GW; }
      if (j < N - GW && !lab[j + GW] && pred(j + GW)) { lab[j + GW] = id; st[sp++] = j + GW; }
    }
    sizes.push(n);
  }
  return [lab, sizes];
}

// fill a polygon (map units, MultiPolygon) into a 0/1 mask: even-odd scanlines through cell centres
function rasterize(mp) {
  const m = new Float32Array(N), xs = [];
  const edges = mp.flatMap((poly) => poly.flatMap((r) => r.slice(1).map((p, i) => [r[i], p])));
  for (let row = 0; row < GH; row++) {
    const y = GY0 + (row + .5) / RES; xs.length = 0;
    for (const [[x1, y1], [x2, y2]] of edges) if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - GX0) * RES - .5)), c1 = Math.min(GW - 1, Math.floor((xs[k + 1] - GX0) * RES - .5));
      for (let c = c0; c <= c1; c++) m[row * GW + c] = 1;
    }
  }
  return m;
}

// ---- min-heap of cells keyed by Float32 priority ----
class Heap {
  constructor(cap) { this.k = new Float32Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k = new Float32Array(this.n * 2), v = new Int32Array(this.n * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
    let i = this.n++; const K_ = this.k, V = this.v;
    while (i) { const p = (i - 1) >> 1; if (K_[p] <= key) break; K_[i] = K_[p]; V[i] = V[p]; i = p; }
    K_[i] = key; V[i] = val;
  }
  pop() { // returns val; key in this.top
    const K_ = this.k, V = this.v, val = V[0]; this.top = K_[0];
    const key = K_[--this.n], v = V[this.n]; let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && K_[c + 1] < K_[c]) c++; if (K_[c] >= key) break; K_[i] = K_[c]; V[i] = V[c]; i = c; }
    K_[i] = key; V[i] = v; return val;
  }
}

// Priority flood from seeds: label[] gets the form index (+1). allowed(i, f) says whether form f may take cell i,
// cost(i, f) its priority there; priorities never fall along a path (the watershed rule).
// With cost = null it is a cost-distance race instead: each step costs 1 + climb·|Δh| (m), the cheapest seed wins, and
// no form goes further than reach(f) (in steps). upOnly: only climbing costs extra (plateaus may run downhill freely).
function flood(label, seeds, allowed, cost, climb, reach = () => Infinity, upOnly = false) {
  const h = new Heap(1 << 20), best = cost ? null : new Float32Array(N).fill(Infinity), owner = cost ? null : new Int32Array(N);
  for (const { i, f } of seeds) {
    if (!cost && label[i] === f + 1) { label[i] = 0; best[i] = 0; owner[i] = f + 1; h.push(0, i); } // a form growing on from its edge
    else if (!label[i] && (cost ? allowed(i, f) : true)) { if (cost) { label[i] = f + 1; h.push(cost(i, f), i); } else if (best[i] > 0) { best[i] = 0; owner[i] = f + 1; h.push(0, i); } }
    else if (label[i] !== f + 1) console.warn('seed of ' + FORMS[f].n + ' not placed (' + (label[i] ? 'taken by ' + FORMS[label[i] - 1].n : 'not allowed') + ')');
  }
  while (h.n) {
    const i = h.pop(), pr = h.top, x = i % GW;
    if (!cost) { if (pr > best[i] || label[i]) continue; label[i] = owner[i]; }
    const f = label[i] - 1;
    const nb = [x > 0 ? i - 1 : -1, x < GW - 1 ? i + 1 : -1, i - GW, i + GW];
    for (const j of nb) {
      if (j < 0 || j >= N || label[j] || !allowed(j, f)) continue;
      if (cost) { // a mountain with a floor doesn't climb out of a dip below it (keeps it off lower neighbouring ranges)
        if (FORMS[f].floor && Es[i] < FORMS[f].floor && Es[j] > Es[i]) continue;
        label[j] = f + 1; h.push(Math.max(pr, cost(j, f)), j); continue; }
      const d = Es[j] - Es[i], c = pr + 1 + climb * (upOnly ? Math.max(0, d) : Math.abs(d));
      if (c < best[j] && c <= reach(f)) { best[j] = c; owner[j] = f + 1; h.push(c, j); }
    }
  }
}

// ======================================================================================================================
// Outlines: trace label borders once per shared stretch, smooth, simplify, assemble rings
// ======================================================================================================================
function simplifyDP(p, tol) {
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

function outlines(lab, nForms, tol) {
  const CW = GW + 1; // corners
  const L = (r, c) => (r < 0 || c < 0 || r >= GH || c >= GW ? 0 : lab[r * GW + c]);
  // edges: h-edge (r,c) from corner (r,c) to (r,c+1), separates cell (r-1,c) [above] and (r,c) [below]
  //        v-edge (r,c) from corner (r,c) to (r+1,c), separates cell (r,c-1) [left] and (r,c) [right]
  const hE = new Uint8Array((GH + 1) * GW), vE = new Uint8Array(GH * CW);
  for (let r = 0; r <= GH; r++) for (let c = 0; c < GW; c++) if (L(r - 1, c) !== L(r, c)) hE[r * GW + c] = 1;
  for (let r = 0; r < GH; r++) for (let c = 0; c <= GW; c++) if (L(r, c - 1) !== L(r, c)) vE[r * CW + c] = 1;
  const deg = (r, c) => (c < GW && hE[r * GW + c] ? 1 : 0) + (c > 0 && hE[r * GW + c - 1] ? 1 : 0) + (r < GH && vE[r * CW + c] ? 1 : 0) + (r > 0 && vE[(r - 1) * CW + c] ? 1 : 0);
  const isNode = (r, c) => { const d = deg(r, c); if (d === 0) return false; if (d !== 2) return true;
    return new Set([L(r - 1, c - 1), L(r - 1, c), L(r, c - 1), L(r, c)]).size > 2; };
  // walking: from corner (r,c) along a direction; returns the steps available
  const steps = (r, c) => { const s = [];
    if (c < GW && hE[r * GW + c]) s.push(['h', r, c, 0, 1]);        // east
    if (c > 0 && hE[r * GW + c - 1]) s.push(['h', r, c - 1, 0, -1]); // west
    if (r < GH && vE[r * CW + c]) s.push(['v', r, c, 1, 0]);         // south
    if (r > 0 && vE[(r - 1) * CW + c]) s.push(['v', r - 1, c, -1, 0]); // north
    return s; };
  const used = { h: new Uint8Array(hE.length), v: new Uint8Array(vE.length) };
  const arcs = []; // {pts:[[x,y]...] in map units, left, right, a: start corner id, b: end corner id}
  const cornerXY = (r, c) => [GX0 + c / RES, GY0 + r / RES];
  function walk(r, c, first) {
    let [t, er, ec, dr, dc] = first; const pts = [cornerXY(r, c)];
    // labels: travelling east on h-edge: left = above (er-1,ec), right = below (er,ec); west: swapped
    //         travelling south on v-edge: left = right cell (er,ec), right = (er,ec-1); north: swapped
    const lr = (t, er, ec, dr, dc) => t === 'h' ? (dc > 0 ? [L(er - 1, ec), L(er, ec)] : [L(er, ec), L(er - 1, ec)])
      : (dr > 0 ? [L(er, ec), L(er, ec - 1)] : [L(er, ec - 1), L(er, ec)]);
    const [left, right] = lr(t, er, ec, dr, dc);
    const start = r * CW + c;
    for (;;) {
      used[t][t === 'h' ? er * GW + ec : er * CW + ec] = 1;
      // midpoint of the edge, then the far corner
      r += dr; c += dc;
      pts.push([(pts[pts.length - 1][0] + GX0 + c / RES) / 2, (pts[pts.length - 1][1] + GY0 + r / RES) / 2]);
      pts.push(cornerXY(r, c));
      if (isNode(r, c) || r * CW + c === start) break;
      // continue on the one unused edge that keeps the same left/right labels
      const nx = steps(r, c).find(([t2, r2, c2, dr2, dc2]) => !used[t2][t2 === 'h' ? r2 * GW + c2 : r2 * CW + c2] && (() => { const q = lr(t2, r2, c2, dr2, dc2); return q[0] === left && q[1] === right; })());
      if (!nx) break;
      [t, er, ec, dr, dc] = nx;
    }
    // drop the corner points between midpoints (keeps the two end corners): staircases become diagonals
    const p = pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % 2 === 1);
    arcs.push({ pts: p, left, right, a: start, b: r * CW + c });
  }
  for (let r = 0; r <= GH; r++) for (let c = 0; c <= GW; c++) if (isNode(r, c))
    for (const s of steps(r, c)) if (!used[s[0]][s[0] === 'h' ? s[1] * GW + s[2] : s[1] * CW + s[2]]) walk(r, c, s);
  for (let r = 0; r <= GH; r++) for (let c = 0; c < GW; c++) if (hE[r * GW + c] && !used.h[r * GW + c]) walk(r, c, ['h', r, c, 0, 1]);
  for (let r = 0; r < GH; r++) for (let c = 0; c <= GW; c++) if (vE[r * CW + c] && !used.v[r * CW + c]) walk(r, c, ['v', r, c, 1, 0]);
  // smooth (ends fixed) and simplify each arc once
  for (const a of arcs) {
    let p = a.pts; const closed = a.a === a.b;
    for (let it = 0; it < 2; it++) {
      const q = p.map((v) => v.slice());
      for (let i = 1; i < p.length - 1; i++) { q[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4; q[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4; }
      p = q;
    }
    a.pts = closed ? simplifyClosed(p, tol) : simplifyDP(p, tol);
  }
  // rings per form: arcs with the form on the left run forwards, on the right backwards
  const polys = [];
  for (let f = 1; f <= nForms; f++) {
    const segs = [];
    for (const a of arcs) { if (a.left === f) segs.push({ p: a.pts, a: a.a, b: a.b }); else if (a.right === f) segs.push({ p: a.pts.slice().reverse(), a: a.b, b: a.a }); }
    const ringsF = []; const byStart = new Map();
    segs.forEach((s, i) => { if (!byStart.has(s.a)) byStart.set(s.a, []); byStart.get(s.a).push(i); });
    const done = new Uint8Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
      if (done[i]) continue;
      let ring = [], cur = i; const start = segs[i].a;
      for (;;) {
        done[cur] = 1; ring = ring.concat(ring.length ? segs[cur].p.slice(1) : segs[cur].p);
        if (segs[cur].b === start) break;
        const nx = (byStart.get(segs[cur].b) || []).find((j) => !done[j]);
        if (nx === undefined) break;
        cur = nx;
      }
      if (ring.length > 3) { if (!same(ring[0], ring[ring.length - 1])) ring.push(ring[0]); ringsF.push(ring); }
    }
    polys.push(ringsF);
  }
  return polys;
}
function simplifyClosed(p, tol) { // split a loop at its farthest point so both halves keep their shape
  if (p.length < 8) return p;
  let far = 0, fd = 0; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
  return [...simplifyDP(p.slice(0, far + 1), tol).slice(0, -1), ...simplifyDP(p.slice(far), tol)];
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const inRing = (pt, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
  const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
function ringsToMulti(rs) { // outer rings (one orientation) with their holes
  if (!rs.length) return [];
  const sgn = Math.sign(ringArea(rs.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a))));
  const outers = rs.filter((r) => Math.sign(ringArea(r)) === sgn).map((r) => [r]);
  for (const h of rs.filter((r) => Math.sign(ringArea(r)) !== sgn)) {
    const o = outers.filter((o) => inRing(h[0], o[0])).sort((a, b) => Math.abs(ringArea(a[0])) - Math.abs(ringArea(b[0])))[0];
    if (o) o.push(h);
  }
  return outers;
}

// ======================================================================================================================
// main
// ======================================================================================================================
const args = process.argv.slice(2);
if (args.includes('--fetch')) await fetchPeaks();
const PV = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;

const { list: PEAKS, notes: peakNotes } = peaks();
const peakAt = Object.fromEntries(PEAKS.map((p) => [p.n, p.c]));

console.time('heights');
const E = await heights();
console.timeEnd('heights');
for (let i = 0; i < N; i++) if (!(E[i] > -1000)) E[i] = 0;
const Es = boxBlur(boxBlur(E, 2), 2); // ~0.9 km smoothing
const Em = boxBlur(boxBlur(boxBlur(E, 3), 3), 3); // ~1.9 km, for the mountain outline
// foot and top level: the lowest / highest ground within ~11 km, smoothed; local relief: max − min within ~2.5 km
const FOOT = cells(11), LRR = cells(1.25);
const foot = boxBlur(boxBlur(rank(Es, FOOT, true), FOOT >> 1), FOOT >> 1);
const top = boxBlur(boxBlur(rank(Es, FOOT, false), FOOT >> 1), FOOT >> 1);
const LR = (() => { const a = rank(Es, LRR, false), b = rank(Es, LRR, true); return a.map((v, i) => v - b[i]); })();
// mountain ground stands RELIEF above the foot: 30 % of the local top-to-foot range, kept between 130 and 250 m,
// so low ranges (Странджа, Сакар, Източни Родопи) count as mountains while the Danube plain's valleys don't
const relief = (i) => Math.max(130, Math.min(250, 0.3 * (top[i] - foot[i])));

// Bulgaria and the working area around it (forms may run a few km over the border, then get clipped)
const bgLL = bulgariaLand(), bgMap = toMap(bgLL);
const inBG = rasterize(bgMap), work = dilate(inBG, cells(5));
const land = (i) => work[i] > 0 && E[i] > 0.5;

// mountain ground: above the foot by RELIEF; holes under 25 km² filled, specks under 4 km² dropped, outline calmed
let M = new Float32Array(N); for (let i = 0; i < N; i++) M[i] = land(i) && Em[i] - foot[i] > relief(i) ? 1 : 0;
M = open(close(M, cells(0.8)), cells(0.8));
{ const [hl, hs] = components((i) => !M[i]); for (let i = 0; i < N; i++) if (!M[i] && hs[hl[i]] * cellKm2 < 6) M[i] = 1;
  const [ml, ms] = components((i) => M[i] > 0); for (let i = 0; i < N; i++) if (M[i] && ms[ml[i]] * cellKm2 < 4) M[i] = 0; }

// zones
// landforms-src/osm-landforms.json: the OSM relations used as zones, from Overpass (trimmed to their ways' geometry):
//   [out:json];rel(id:18155583,18306789,18627976,18629756);out geom;   (Дунавска равнина, Стара планина, Източни/Западни Родопи)
const osm = readJ(new URL('osm-landforms.json', SRC)).elements;
const zoneMask = (z) => {
  if (!z) return null;
  if (z.box) { const [lo0, la0, lo1, la1] = z.box; return rasterize([[[[lo0, la0], [lo1, la0], [lo1, la1], [lo0, la1], [lo0, la0]].map(P)]]); }
  const rel = osm.find((e) => e.type === 'relation' && e.id === z.osm);
  const m = rasterize(toMap(relPoly(rel)));
  return z.grow ? dilate(m, cells(z.grow)) : m;
};
const forms = FORMS.map((f) => ({ ...f, zone: zoneMask(f.zone) }));
const seedCells = (f, fi) => f.seeds.map((s) => {
  const ll = typeof s === 'string' ? peakAt[s] : s; if (!ll) throw new Error('unknown seed ' + s);
  let i = cellLL(ll);
  const x0 = i % GW, y0 = Math.floor(i / GW); let best = i;
  if (f.k === 'mountain' || f.k === 'plateau') { // snap to the highest cell within ~1.5 km
    const r = cells(1.5);
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) { const j = y * GW + x; if (E[j] > E[best]) best = j; }
  } else { // towns sit at valley edges: snap to the flattest cell within ~2.5 km
    const r = cells(2.5);
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) { const j = y * GW + x; if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r && !M[j] && E[j] > 0.5 && LR[j] + Es[j] * 0.05 < LR[best] + Es[best] * 0.05) best = j; }
  }
  i = best;
  return { i, f: fi, e: Es[i] };
});
const label = new Int32Array(N);
const okZone = (f, i) => !f.zone || f.zone[i] > 0;
// Предбалкан has no single summit: its seeds are the hilltops (highest cell within ~3 km, on mountain ground) of OSM's
// Стара планина that lie more than ~9 km north of the main ridge line
for (const f of forms) if (f.autoSeeds) {
  const ridge = f.autoSeeds.ridge.map(P), z = zoneMask({ osm: f.autoSeeds.osm }), r = cells(3), mx = rank(Es, r, false);
  const north = (x, y) => { for (let k = 0; k + 1 < ridge.length; k++) { const [x1, y1] = ridge[k], [x2, y2] = ridge[k + 1];
    if (x >= x1 && x <= x2) return y < y1 + ((x - x1) / (x2 - x1)) * (y2 - y1) - 9 / 0.3707; } return false; };
  for (let i = 0; i < N; i++) if (z[i] && M[i] && Es[i] >= mx[i] && Es[i] > 350) { const [x, y] = [GX0 + ((i % GW) + .5) / RES, GY0 + (((i / GW) | 0) + .5) / RES];
    if (north(x, y)) f.seeds.push(unP([x, y])); }
}

// round 1: plateaus, from their high points over ground above h0, by cost distance (valleys cost, so they part there)
{ const ids = forms.map((f, i) => (f.k === 'plateau' ? i : -1)).filter((i) => i >= 0), north = zoneMask({ box: [24.3, 42.95, 28.7, 44.3] });
  flood(label, ids.flatMap((fi) => seedCells(forms[fi], fi)), (i, fi) => land(i) && north[i] > 0 && Es[i] >= forms[fi].h0 && okZone(forms[fi], i), null, 0.3, (fi) => forms[fi].reach * KM, true);
  for (let i = 0; i < N; i++) if (label[i] && forms[label[i] - 1].hidden) label[i] = 0; }
// lowland rounds: outward from the seeds; the cost of a step grows with the climb, so neighbours meet on the thresholds
// between them. A form stays within dh of its seeds' heights and, if it has `flat`, on ground whose local relief is
// under flat metres (a низина is flat; the hills in and around it are left out)
const lowIds = forms.map((f, i) => (['valley', 'plain', 'lowland'].includes(f.k) ? i : -1)).filter((i) => i >= 0);
const lowSeeds = lowIds.flatMap((fi) => seedCells(forms[fi], fi)), lo = new Map(), hi = new Map();
for (const s of lowSeeds) { lo.set(s.f, Math.min(lo.get(s.f) ?? 1e9, s.e)); hi.set(s.f, Math.max(hi.get(s.f) ?? -1e9, s.e)); }
const seedSet = new Set(lowSeeds.map((s) => s.i));
const lowOK = (mountainsDone) => (i, fi) => { const f = forms[fi]; if (seedSet.has(i)) return true;
  // lowlands keep off mountain ground; plains take the hills in their zone that no mountain took, once the mountains
  // have had their turn
  const mtn = f.k === 'plain' && mountainsDone ? 0 : M[i];
  return land(i) && okZone(f, i) && !mtn && Es[i] >= lo.get(fi) - f.dh && Es[i] <= hi.get(fi) + f.dh && (!f.flat || LR[i] <= f.flat); };
// round 2: valleys, plains and lowlands together
const reach = (fi) => (forms[fi].reach ? forms[fi].reach * KM : Infinity);
flood(label, lowSeeds, lowOK(false), null, 0.3, reach);
// round 3: mountains, downhill from the summits over mountain ground
{ const ids = forms.map((f, i) => (f.k === 'mountain' ? i : -1)).filter((i) => i >= 0);
  flood(label, ids.flatMap((fi) => seedCells(forms[fi], fi)), (i, fi) => M[i] > 0 && land(i) && okZone(forms[fi], i), (i) => 4000 - Es[i]); }
// round 4: plains grow on from their edges over the hills nobody took
{ const edge = [];
  for (let i = GW; i < N - GW; i++) { const f = label[i]; if (!f || forms[f - 1].k !== 'plain') continue;
    if (!label[i - 1] || !label[i + 1] || !label[i - GW] || !label[i + GW]) edge.push({ i, f: f - 1 }); }
  flood(label, edge, lowOK(true), null, 0.3, (fi) => cells(6)); }

// tidy: cut thin tongues (opening), keep each form's big pieces, fill small holes, smooth with a majority filter
const nF = forms.length;
{
  const keep = new Int32Array(N), bb = Array.from({ length: nF + 1 }, () => [1e9, 1e9, -1, -1]);
  for (let i = 0; i < N; i++) if (label[i]) { const b = bb[label[i]], x = i % GW, y = (i / GW) | 0; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  for (let fi = 1; fi <= nF; fi++) {
    const [bx0, by0, bx1, by1] = bb[fi]; if (bx1 < 0) continue;
    const pad = 12, x0 = Math.max(0, bx0 - pad), y0 = Math.max(0, by0 - pad), x1 = Math.min(GW - 1, bx1 + pad), y1 = Math.min(GH - 1, by1 + pad), W = x1 - x0 + 1, H = y1 - y0 + 1;
    const m = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (label[(y0 + y) * GW + x0 + x] === fi) m[y * W + x] = 1;
    const r = cells(forms[fi - 1].o ?? (forms[fi - 1].k === 'mountain' ? 0.9 : 1.3)), o = open(m, r, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (o[y * W + x]) { const i = (y0 + y) * GW + x0 + x; if (label[i] === fi) keep[i] = fi; }
  }
  label.set(keep);
  // pieces: keep a form's largest piece, any other at least 30 % of its size and any holding one of its seeds or peaks
  // (so islands of a lowland among hills go)
  const piece = new Int32Array(N), st = new Int32Array(N); let np = 0; const pf = [0], ps = [0];
  for (let i = 0; i < N; i++) {
    if (!label[i] || piece[i]) continue; const f = label[i]; np++; let sp = 0, n = 0; st[sp++] = i; piece[i] = np;
    while (sp) { const j = st[--sp]; n++; const x = j % GW;
      for (const k of [x > 0 ? j - 1 : -1, x < GW - 1 ? j + 1 : -1, j - GW, j + GW]) if (k >= 0 && k < N && !piece[k] && label[k] === f) { piece[k] = np; st[sp++] = k; } }
    pf.push(f); ps.push(n);
  }
  const big = new Float64Array(nF + 1); for (let p = 1; p <= np; p++) big[pf[p]] = Math.max(big[pf[p]], ps[p]);
  const seeded = new Set();
  forms.forEach((f, fi) => { for (const s of f.seeds) { const ll = typeof s === 'string' ? peakAt[s] : s; const i = cellLL(ll); if (label[i] === fi + 1) seeded.add(piece[i]); } });
  for (const p of PEAKS) { const i = cellLL(p.c), fi = forms.findIndex((f) => f.n === p.m); if (label[i] === fi + 1) seeded.add(piece[i]); }
  for (let i = 0; i < N; i++) if (label[i]) { const p = piece[i]; if (ps[p] < big[pf[p]] * 0.3 && !seeded.has(p)) label[i] = 0; }
  // holes (unlabelled or other-labelled pockets) under 8 km² wholly inside one form join it
  const [hl, hs] = components((i) => label[i] === 0);
  const hf = new Int32Array(hs.length).fill(-1); // -1 unseen, 0 mixed/edge, f
  for (let i = 0; i < N; i++) { const h = hl[i]; if (!h) continue; const x = i % GW;
    if (x === 0 || x === GW - 1 || i < GW || i >= N - GW) { hf[h] = 0; continue; }
    for (const k of [i - 1, i + 1, i - GW, i + GW]) { const f = label[k]; if (!f) continue; if (hf[h] === -1) hf[h] = f; else if (hf[h] !== f) hf[h] = 0; } }
  for (let i = 0; i < N; i++) { const h = hl[i]; if (h && hf[h] > 0 && hs[h] * cellKm2 < 15) label[i] = hf[h]; }
  // gaps under 3 km² between two or more forms go to the form that borders them most (fewer junctions to trace)
  { const cnt = new Map();
    for (let i = GW; i < N - GW; i++) { const h = hl[i]; if (!h || hf[h] !== 0 || hs[h] * cellKm2 >= 3) continue;
      for (const k of [i - 1, i + 1, i - GW, i + GW]) { const f = label[k]; if (f && hl[k] !== h) { const key = h * 1000 + f; cnt.set(key, (cnt.get(key) || 0) + 1); } } }
    const best = new Map(); for (const [key, c] of cnt) { const h = Math.floor(key / 1000), f = key % 1000; if (!best.has(h) || c > best.get(h)[1]) best.set(h, [f, c]); }
    for (let i = 0; i < N; i++) { const b = hl[i] && best.get(hl[i]); if (b && !label[i]) label[i] = b[0]; } }
  // majority filter (5×5, twice) — only between labelled cells, so outer edges don't creep
  for (let it = 0; it < 2; it++) {
    const nl = label.slice();
    for (let y = 2; y < GH - 2; y++) for (let x = 2; x < GW - 2; x++) {
      const i = y * GW + x; if (!label[i]) continue; const cnt = new Map();
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const f = label[i + dy * GW + dx]; if (f) cnt.set(f, (cnt.get(f) || 0) + 1); }
      let bf = label[i], bc = cnt.get(bf) || 0; for (const [f, c] of cnt) if (c > bc) { bf = f; bc = c; }
      if (bc >= 13) nl[i] = bf;
    }
    label.set(nl);
  }
}

// outlines → clip to Bulgaria → paths; label point and tilt from the clipped raster
const TOL = 0.6;
const formRings = outlines(label, nF, TOL);
const r1 = (v) => Math.round(v * 10) / 10;
const pathOf = (mp) => mp.map((poly) => poly.map((r) => {
  const q = r.map(([x, y]) => [r1(x), r1(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (q.length > 1 && same(q[0], q[q.length - 1])) q.pop();
  return q.length < 3 ? '' : 'M' + q.map((p) => p[0] + ' ' + p[1]).join('L') + 'Z';
}).join('')).join('');

const LANDFORMS = [], report = [];
forms.forEach((f, fi) => {
  if (f.hidden) return;
  const mp = ringsToMulti(formRings[fi]);
  if (!mp.length) { report.push(`!! ${f.n}: empty`); return; }
  let clipped; try { clipped = pc.intersection(mp, bgMap); } catch (e) { report.push(`!! ${f.n}: clip failed ${e.message}`); return; }
  if (!clipped.length) { report.push(`!! ${f.n}: outside Bulgaria`); return; }
  // the form's cells inside Bulgaria: label point (pole of inaccessibility), tilt (main axis), top height
  const id = fi + 1; let n = 0, sx = 0, sy = 0, hmax = 0;
  for (let i = 0; i < N; i++) if (label[i] === id && inBG[i]) { n++; const x = i % GW, y = (i / GW) | 0; sx += x; sy += y; hmax = Math.max(hmax, E[i]); }
  if (!n) { report.push(`!! ${f.n}: no cells in Bulgaria`); return; }
  const mx = sx / n, my = sy / n; let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < N; i++) if (label[i] === id && inBG[i]) { const dx = (i % GW) - mx, dy = ((i / GW) | 0) - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr / 2 - Math.sqrt(tr * tr / 4 - det);
  let ang = (Math.atan2(l1 - cxx, cxy || 1e-9) * 180) / Math.PI; // direction of the main axis
  if (cxy === 0) ang = cxx >= cyy ? 0 : 90;
  ang = ((ang + 90) % 180 + 180) % 180 - 90;
  const elong = Math.sqrt(l1 / Math.max(l2, 1e-9));
  let angle = elong < 1.7 ? 0 : Math.round(Math.max(-60, Math.min(60, ang)) / 5) * 5;
  if (angle === -0) angle = 0;
  // pole: max distance to the outside, by a chamfer distance transform over the form ∩ Bulgaria
  const D = new Float32Array(N);
  for (let i = 0; i < N; i++) D[i] = label[i] === id && inBG[i] ? 1e9 : 0;
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = y * GW + x; if (D[i]) D[i] = Math.min(D[i], D[i - 1] + 1, D[i - GW] + 1, D[i - GW - 1] + 1.414, D[i - GW + 1] + 1.414); }
  for (let y = GH - 2; y > 0; y--) for (let x = GW - 2; x > 0; x--) { const i = y * GW + x; if (D[i]) D[i] = Math.min(D[i], D[i + 1] + 1, D[i + GW] + 1, D[i + GW + 1] + 1.414, D[i + GW - 1] + 1.414); }
  // prefer points near the middle of long forms: weight distance by closeness to the centroid along the main axis
  let best = -1, bv = -1;
  for (let i = 0; i < N; i++) if (D[i] > 0) { const dx = (i % GW) - mx, dy = ((i / GW) | 0) - my; const v = D[i] / (1 + Math.hypot(dx, dy) / (6 * Math.sqrt(l1 / n) + 1)); if (v > bv) { bv = v; best = i; } }
  const at = [r1(GX0 + ((best % GW) + .5) / RES), r1(GY0 + (((best / GW) | 0) + .5) / RES)];
  const pk = PEAKS.filter((p) => p.m === f.n).reduce((m, p) => Math.max(m, p.h), 0);
  const top = Math.round(Math.max(hmax, pk));
  LANDFORMS.push({ n: f.n, k: f.k, d: pathOf(clipped), at, angle, hmax: top });
  report.push(`${f.k.padEnd(8)} ${f.n.padEnd(30)} ${(n * cellKm2).toFixed(0).padStart(6)} km²  hmax ${top}  angle ${angle}`);
});
for (const p of PEAKS) {
  const f = LANDFORMS.find((l) => l.n === p.m); if (!f) { report.push(`!! peak ${p.n}: no form ${p.m}`); continue; }
  const got = label[cellLL(p.c)]; if (!got || forms[got - 1].n !== p.m) report.push(`.. peak ${p.n} (${p.m}) lies in ${got ? forms[got - 1].n : 'no form'}`);
}
// no two forms may overlap: check every pair whose boxes meet
{ const polys = LANDFORMS.map((f) => { const rs = f.d.split('Z').filter(Boolean).map((r) => r.slice(1).split('L').map((q) => q.split(' ').map(Number)));
    const b = rs.flat().reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9]);
    return { mp: ringsToMulti(rs.map((r) => [...r, r[0]])), b }; });
  let worst = 0, pair = '';
  for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
    const A = polys[a].b, B = polys[b].b; if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
    let ov = 0; try { for (const poly of pc.intersection(polys[a].mp, polys[b].mp)) poly.forEach((r, k) => { ov += (k ? -1 : 1) * Math.abs(ringArea(r)); }); } catch { ov = -1; }
    if (ov > worst || ov < 0) { worst = ov; pair = LANDFORMS[a].n + ' / ' + LANDFORMS[b].n; }
  }
  report.push(`overlap check: largest overlap ${worst.toFixed(3)} unit² (${pair || 'none'})`); }

const head = '/* generated by tools/build-landforms.mjs: relief forms of Bulgaria, outlined from Terrain Tiles heights (z10). Each form is\n' +
  '   the ground its seeds (summits, plateau tops, towns) win in priority floods: mountains = ground standing 130–250 m above the local\n' +
  '   foot level, filled downhill from the summits so neighbours meet in the valleys and passes; plateaus = ground above their floor\n' +
  '   height; valleys, plains and lowlands = the low ground, filled from their towns by cost distance. Zones from OpenStreetMap\n' +
  '   (Родопи, Стара планина, Дунавска равнина). Clipped to Bulgaria (OSM); no two forms overlap. at = label point (pole of\n' +
  '   inaccessibility), angle = label tilt (degrees) along the long axis, hmax = top height (m). Do not edit. */\n';
const ser = (o) => '{' + Object.entries(o).map(([k, v]) => k + ':' + (typeof v === 'string' ? "'" + v.replace(/'/g, "\\'") + "'" : JSON.stringify(v))).join(', ') + '}';
fs.writeFileSync(new URL('landforms.js', ROOT), head + 'const LANDFORMS=[\n' + LANDFORMS.map(ser).join(',\n') + '];\n');
fs.writeFileSync(new URL('peaks.js', ROOT), '/* generated by tools/build-landforms.mjs: the highest and best-known summits of Bulgaria\'s mountains. c = [lon, lat] and h (m)\n' +
  '   from Wikidata (P625, P2044), heights checked against the bg Wikipedia infobox (bg Wikipedia wins where they differ); m = the\n' +
  '   mountain in landforms.js, q = Wikidata id. Do not edit. */\nconst PEAKS=[\n' + PEAKS.map(ser).join(',\n') + '];\n');
console.log(report.join('\n'));
if (peakNotes.length) console.log('peak heights:\n  ' + peakNotes.join('\n  '));
console.log(`landforms.js: ${LANDFORMS.length} forms, ${(fs.statSync(new URL('landforms.js', ROOT)).size / 1024).toFixed(0)} KB; peaks.js: ${PEAKS.length} peaks`);

// ======================================================================================================================
// --preview DIR: the forms over the heights, as PNGs (whole country + close-ups)
// ======================================================================================================================
if (PV) {
  fs.mkdirSync(PV, { recursive: true });
  const COL = { mountain: '#8b2d1a', plateau: '#7a5a00', plain: '#1d6b2a', lowland: '#0b5f8a', valley: '#6a1d8a' };
  const views = [['all', GX0, GY0, GX1, GY1, 1], ['sw', 1600, 1150, 2250, 1750, 2.2], ['w', 1600, 900, 2400, 1350, 1.8], ['e', 2300, 900, 3056, 1450, 1.8], ['se', 2250, 1250, 3056, 1750, 1.8], ['c', 2000, 1050, 2650, 1450, 2.2]];
  for (const [name, x0, y0, x1, y1, s] of views) {
    const W = Math.round((x1 - x0) * s), H = Math.round((y1 - y0) * s), img = Buffer.alloc(W * H * 3);
    const T = [[-1e9, [170, 205, 230]], [0.5, [150, 195, 140]], [200, [195, 215, 150]], [500, [235, 225, 170]], [1000, [220, 190, 140]], [1500, [195, 155, 110]], [2000, [165, 125, 95]], [2500, [140, 110, 100]]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = x0 + (x + .5) / s, gy = y0 + (y + .5) / s, i = cellOf([gx, gy]); const e = E[i] ?? 0;
      let c = T[0][1]; for (const [h, cc] of T) if (e >= h) c = cc;
      const sh = e > 0 ? Math.max(.65, Math.min(1.25, 1 + ((E[i - 1] - E[i + 1]) + (E[i - GW] - E[i + GW])) / 160)) : 1;
      const o = (y * W + x) * 3, um = M[i] && !label[i] && ((x + y) & 3) === 0; // unclaimed mountain ground: dotted
      for (let k = 0; k < 3; k++) img[o + k] = um ? 40 : Math.min(255, c[k] * sh);
    }
    const tf = `transform="scale(${s}) translate(${-x0} ${-y0})"`;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g ${tf}>`;
    svg += `<path d="${pathOf(bgMap)}" fill="none" stroke="#000" stroke-width="${1.2 / s}"/>`;
    LANDFORMS.forEach((f, k) => { svg += `<path d="${f.d}" fill="hsl(${(k * 137) % 360},70%,50%)" fill-opacity=".22" stroke="${COL[f.k]}" stroke-width="${1.6 / s}" fill-rule="evenodd"/>`; });
    for (const p of PEAKS) { const [x, y] = P(p.c); svg += `<path d="M${x} ${y - 3.5 / s * 2}l${3 / s * 2} ${6 / s * 2}h${-6 / s * 2}z" fill="#000"/><text x="${x + 5 / s}" y="${y + 4 / s}" font-size="${10 / s}" font-family="Arial">${p.n} ${p.h}</text>`; }
    for (const f of LANDFORMS) svg += `<text x="${f.at[0]}" y="${f.at[1]}" transform="rotate(${f.angle} ${f.at[0]} ${f.at[1]})" text-anchor="middle" font-size="${(name === 'all' ? 13 : 12) / s}" font-family="Arial" font-weight="bold" fill="${COL[f.k]}" stroke="#fff" stroke-width="${2.5 / s}" paint-order="stroke">${f.n}</text>`;
    svg += '</g></svg>';
    await sharp(img, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(PV + '/' + name + '.png');
  }
  // mask debug: mountain ground
  const W = GW / 2, H = GH / 2, img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = 2 * y * GW + 2 * x, o = (y * W + x) * 3, f = label[i];
    const col = f ? [(f * 97) % 200 + 40, (f * 57) % 200 + 40, (f * 31) % 200 + 40] : M[i] ? [90, 60, 50] : E[i] > 0 ? [235, 235, 225] : [180, 210, 235];
    img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(PV + '/labels.png');
}
