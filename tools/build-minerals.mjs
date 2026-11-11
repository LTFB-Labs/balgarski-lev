// Builds ../minerals.js: mineral deposits of Bulgaria for the map's minerals layer.
// Points are hand-picked from OpenStreetMap mine/quarry features and Wikidata (P625),
// checked against the USGS Minerals Yearbook "Bulgaria 2019" (structure of the mineral industry table).
// Basin outlines for Maritsa-iztok and Pernik are convex hulls of the OSM open-pit polygons, fetched live.
// Run: node tools/build-minerals.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const UA = { 'User-Agent': 'minerals-build/1.0' };
const OSM = (id) => 'OSM ' + id + ' (© OpenStreetMap contributors, ODbL)';
const WD = (q) => 'Wikidata ' + q;
const USGS = 'USGS MYB Bulgaria 2019';

const MINERAL_KINDS = {
  coal: { n: 'Въглища', color: '#333333' },
  copper: { n: 'Мед', color: '#c56a2d' },
  gold: { n: 'Злато', color: '#d4a72c' },
  leadzinc: { n: 'Олово и цинк', color: '#6f7f95' },
  iron: { n: 'Желязо', color: '#8b3a2a' },
  manganese: { n: 'Манган', color: '#7a4f8a' },
  salt: { n: 'Сол', color: '#9fc3d6' },
  oilgas: { n: 'Нефт и газ', color: '#1f5f5b' },
  uranium: { n: 'Уран', color: '#6c9a1f' },
  stone: { n: 'Скални материали (мрамор, гранит, варовик)', color: '#a39e93' },
  clay: { n: 'Глини и зеолити (каолин, бентонит, зеолит)', color: '#d9c7a0' },
};

// c: [lon, lat] of the mine / pit / field itself. active: worked today (per USGS 2019 unless noted).
const MINERALS = [
  // --- coal ---
  { n: 'Марица-изток', k: 'coal', sub: 'лигнитни въглища (открити рудници)', c: [26.0207, 42.2208], active: true, src: OSM('way/137246419') + '; ' + WD('Q12286816') + '; ' + USGS, areaFrom: ['way/137246419', 'way/137246422', 'way/137246424'] },
  { n: 'Пернишки басейн (рудник „Република“)', k: 'coal', sub: 'кафяви въглища', c: [23.0846, 42.6289], active: true, src: OSM('way/1054251058') + '; ' + USGS + ' (Otkrit Vagledobiv, Pernik coal basin)', areaFrom: ['way/1054251058', 'way/124105239', 'way/124105760', 'way/124105640', 'way/124105330', 'way/124105448', 'way/124105716'] },
  { n: 'Бобов дол', k: 'coal', sub: 'кафяви въглища', c: [23.0124, 42.3707], active: true, src: OSM('way/124105282') + '; ' + USGS + ' (Vagledobiv Bobov Dol)' },
  { n: 'Бели брег', k: 'coal', sub: 'лигнитни въглища', c: [22.8552, 42.8702], active: true, src: OSM('way/124105657') + '; ' + WD('Q131360224') + '; ' + USGS },
  { n: 'Станянци', k: 'coal', sub: 'лигнитни въглища', c: [22.9248, 43.0555], active: true, src: OSM('way/124105267') + '; ' + USGS },
  { n: 'Чукурово', k: 'coal', sub: 'лигнитни въглища (Софийски басейн)', c: [23.5872, 42.5368], active: true, src: OSM('way/124105260') + '; ' + WD('Q12286802') + '; ' + USGS },
  { n: 'Черно море (Бургаски басейн)', k: 'coal', sub: 'кафяви въглища', c: [27.5335, 42.6013], active: true, src: OSM('way/124105623') + '; ' + USGS },
  { n: 'Ораново (Пирински басейн)', k: 'coal', sub: 'кафяви въглища', c: [23.1344, 41.8998], active: false, src: OSM('way/124105491') },
  { n: 'Балканбас', k: 'coal', sub: 'черни каменни въглища', c: [25.9610, 42.7717], active: true, src: OSM('way/379729180') + ' (рудник Шешкинград); bg.wikipedia „Балканбас“; ' + USGS + ' (Balkan 2000, SE of Tvarditsa)',
    area: [[25.7600, 42.7380], [25.8800, 42.7520], [25.9600, 42.7620], [26.0050, 42.7590], [26.0080, 42.7730], [25.9600, 42.7820], [25.8800, 42.7720], [25.7650, 42.7580]] },
  { n: 'Добруджански басейн', k: 'coal', sub: 'черни (коксуващи) въглища, неразработен — на 1000–1500 м дълбочина', c: [28.2833, 43.4833], active: false, src: WD('Q25486895') + ' (бившето с. Македонка, над находището); bg.wikipedia „Гурково (област Добрич)“; ' + WD('Q25484747'),
    areaEllipse: { c: [28.2300, 43.4950], rx: 0.11, ry: 0.07 } },
  // --- copper ---
  { n: 'Асарел', k: 'copper', sub: 'медна руда (открит рудник)', c: [24.1455, 42.5444], active: true, src: OSM('way/124105802') + '; ' + WD('Q16252032') + '; ' + USGS },
  { n: 'Елаците', k: 'copper', sub: 'медна руда със злато (открит рудник)', c: [24.0292, 42.7542], active: true, src: OSM('relation/18451229') + '; ' + USGS },
  { n: 'Медет', k: 'copper', sub: 'медна руда (закрит 1994)', c: [24.1890, 42.6038], active: false, src: OSM('way/1549627263') + '; bg.wikipedia „Асарел-Медет“' },
  { n: 'Радка', k: 'copper', sub: 'медна руда (закрит рудник)', c: [24.2898, 42.4006], active: false, src: OSM('way/200360355') },
  { n: 'Елшица', k: 'copper', sub: 'медна руда (закрит рудник)', c: [24.2190, 42.3498], active: false, src: OSM('way/124105233') },
  { n: 'Цар Асен', k: 'copper', sub: 'медна руда (закрит рудник)', c: [24.3360, 42.3543], active: false, src: OSM('way/124105629') },
  { n: 'Зидарово (Бургаски медни мини)', k: 'copper', sub: 'медна руда', c: [27.4157, 42.3403], active: true, src: OSM('way/124105380') + ' (кариера край с. Зидарово, ' + WD('Q1011852') + '); ' + USGS + ' (Zidarovo Mine)' },
  // --- gold ---
  { n: 'Челопеч', k: 'gold', sub: 'медно-златна руда (подземен рудник)', c: [24.0739, 42.6955], active: true, src: OSM('way/853545188') + '; ' + WD('Q16257864') + '; ' + USGS },
  { n: 'Ада тепе (Крумовград)', k: 'gold', sub: 'злато (открит рудник)', c: [25.6573, 41.4336], active: true, src: OSM('way/1131099944') + '; ' + USGS + ' (Krumovgrad / Ada Tepe)' },
  // --- lead and zinc ---
  { n: 'Мадан', k: 'leadzinc', sub: 'оловно-цинкова руда', c: [24.9243, 41.4877], active: true, src: OSM('node/3103588858') + ' (шахта); ' + USGS + ' (Gorubso)' },
  { n: 'Рудозем', k: 'leadzinc', sub: 'оловно-цинкова руда', c: [24.8551, 41.4813], active: true, src: OSM('node/3103586097') + ' (шахта); ' + USGS + ' (Dimov Dol Mine, near Rudozem)' },
  { n: 'Лъки (рудник Джурково)', k: 'leadzinc', sub: 'оловно-цинкова руда', c: [24.8198, 41.8015], active: false, src: OSM('way/723172047') },
  { n: 'Маджарово', k: 'leadzinc', sub: 'оловно-цинкова руда (закрит рудник)', c: [25.8718, 41.6294], active: false, src: OSM('way/124105781') },
  // --- iron ---
  { n: 'Кремиковци', k: 'iron', sub: 'желязна руда (закрит рудник)', c: [23.4721, 42.7843], active: false, src: OSM('way/124105227') },
  // --- manganese ---
  { n: 'Оброчище (Варненско находище)', k: 'manganese', sub: 'манганова руда (спрян добив)', c: [28.0086, 43.4157], active: false, src: OSM('way/144243117') + ' (resource=mangan_ore); ' + USGS + ' (Euromangan, Obrochishte mine at Tsarkva, production halted)' },
  { n: 'Пожарево', k: 'manganese', sub: 'манганова руда (закрит рудник)', c: [23.1102, 42.7592], active: false, src: OSM('way/124105315') },
  // --- salt ---
  { n: 'Провадийско находище (Мирово)', k: 'salt', sub: 'каменна сол (добив чрез разтваряне)', c: [27.4689, 43.1317], active: true, src: OSM('relation/16229653') + ' (Провадийски солни мини)' },
  { n: 'Бургаски солници', k: 'salt', sub: 'морска сол', c: [27.4831, 42.5456], active: true, src: OSM('relation/4273480') },
  { n: 'Поморийски солници', k: 'salt', sub: 'морска сол', c: [27.6282, 42.6165], active: true, src: OSM('relation/6244864') },
  // --- oil and gas ---
  { n: 'Долни Дъбник', k: 'oilgas', sub: 'нефт и газ', c: [24.4485, 43.4147], active: true, src: OSM('way/603794364') + ' (Проучване и добив на нефт и газ АД); ' + WD('Q21781978') + '; ' + USGS },
  { n: 'Тюленово', k: 'oilgas', sub: 'нефт (първото находище в България, 1951)', c: [28.5782, 43.4924], active: true, src: WD('Q2990510') + ' (с. Тюленово); ' + USGS + ' (Tjulenovo oilfield)' },
  { n: 'Галата', k: 'oilgas', sub: 'природен газ (в морето)', c: [28.1932, 43.0446], active: false, src: WD('Q16839528') + '; ' + USGS + ' (Galata, Kaliakra, Kavarna fields)' },
  { n: 'Девенци', k: 'oilgas', sub: 'природен газ', c: [24.1628, 43.3211], active: false, src: WD('Q5266880') },
  // --- uranium (all historic, mining stopped 1992) ---
  { n: 'Бухово', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [23.5452, 42.8013], active: false, src: OSM('way/723042415') },
  { n: 'Елешница', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [23.6269, 41.8610], active: false, src: OSM('way/124105490') },
  { n: 'Сборище', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [25.9909, 42.6939], active: false, src: OSM('way/584763629') },
  { n: 'Смолян (Герзовица)', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [24.5449, 41.5713], active: false, src: OSM('way/722987372') },
  { n: 'Белозем', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [25.0473, 42.1780], active: false, src: OSM('way/722998005') },
  { n: 'Барутин', k: 'uranium', sub: 'уранова руда (закрит рудник)', c: [24.1504, 41.5911], active: false, src: OSM('way/124105798') },
  // --- stone ---
  { n: 'Илинденци', k: 'stone', sub: 'пирински мрамор', c: [23.3014, 41.6878], active: true, src: OSM('way/124105237') + ' (кариера над с. Илинденци, ' + WD('Q2458283') + ')' },
  { n: 'Лиляново', k: 'stone', sub: 'гранит', c: [23.3675, 41.6535], active: true, src: OSM('way/918485306') },
  { n: 'Нановица', k: 'stone', sub: 'мрамор', c: [24.1469, 43.0398], active: true, src: OSM('way/596594338') },
  { n: 'Каменец', k: 'stone', sub: 'скален материал (каменоломна)', c: [26.7579, 42.3329], active: true, src: OSM('way/124105247') },
  { n: 'Девня (кариера „Люляка“)', k: 'stone', sub: 'варовик (за цимент и сода)', c: [27.5839, 43.2682], active: true, src: OSM('way/124105250') + '; ' + USGS + ' (Devnya Cement)' },
  // --- clay and zeolite ---
  { n: 'Каолиново', k: 'clay', sub: 'каолин', c: [27.1180, 43.6073], active: true, src: OSM('way/124105246') + '; ' + USGS + ' (Kaolin EAD quarries, Kaolinovo municipality)' },
  { n: 'Ветово', k: 'clay', sub: 'каолин и кварцов пясък', c: [26.2497, 43.6877], active: true, src: OSM('way/124105436') + ' (кариера до с. Ветово, ' + WD('Q404746') + ')' },
  { n: 'Тетово', k: 'clay', sub: 'каолин', c: [26.3440, 43.8156], active: true, src: OSM('way/124105496') },
  { n: 'Пропаст (Кърджали)', k: 'clay', sub: 'бентонит', c: [25.3990, 41.6408], active: true, src: OSM('way/1135773699') + ' (кариера до с. Пропаст, ' + WD('Q1084575') + '); ' + USGS + ' (Imerys bentonite, Kardzhali)' },
  { n: 'Бели пласт', k: 'clay', sub: 'зеолит', c: [25.4282, 41.7752], active: true, src: WD('Q1081497') + ' (с. Бели пласт); ' + USGS + ' (Imerys zeolites, Kardzhali)' },
  { n: 'Голобрадово', k: 'clay', sub: 'зеолит', c: [25.6714, 41.6454], active: true, src: OSM('way/1344841026') + ' (кариера до с. Голобрадово, ' + WD('Q2013504') + ')' },
];

const r4 = (x) => Math.round(x * 1e4) / 1e4;

async function fetchWays(refs) {
  const body = refs.map((r) => { const [t, id] = r.split('/'); return `${t}(${id});`; }).join('');
  const q = `[out:json][timeout:90];(${body});out geom;`;
  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    const txt = await res.text();
    try {
      const d = JSON.parse(txt);
      const pts = [];
      for (const e of d.elements) {
        if (e.geometry) for (const g of e.geometry) pts.push([g.lon, g.lat]);
        if (e.members) for (const m of e.members) if (m.geometry) for (const g of m.geometry) pts.push([g.lon, g.lat]);
      }
      return pts;
    } catch { await new Promise((r) => setTimeout(r, 10000 * (i + 1))); }
  }
  throw new Error('Overpass failed for ' + refs.join(','));
}

function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Drop hull vertices that add least area until at most n remain.
function simplify(poly, n) {
  const p = [...poly];
  const tri = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  while (p.length > n) {
    let best = 0, bv = Infinity;
    for (let i = 0; i < p.length; i++) { const v = tri(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]); if (v < bv) { bv = v; best = i; } }
    p.splice(best, 1);
  }
  return p;
}

function ellipse({ c, rx, ry }, n = 14) {
  return Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]; });
}

for (const m of MINERALS) {
  if (m.areaFrom) { m.area = simplify(hull(await fetchWays(m.areaFrom)), 16); delete m.areaFrom; await new Promise((r) => setTimeout(r, 3000)); }
  if (m.areaEllipse) { m.area = ellipse(m.areaEllipse); delete m.areaEllipse; }
  m.c = m.c.map(r4);
  if (m.area) m.area = m.area.map((q) => q.map(r4));
}

// Sanity checks.
for (const m of MINERALS) {
  if (!MINERAL_KINDS[m.k]) throw new Error('bad kind ' + m.k);
  for (const [lon, lat] of [m.c, ...(m.area || [])]) if (lon < 22.3 || lon > 29.0 || lat < 41.2 || lat > 44.3) throw new Error('out of Bulgaria: ' + m.n);
}

const header = '/* Mineral resources of Bulgaria for the map\'s minerals layer. Generated by tools/build-minerals.mjs.\n' +
  '   Sources: OpenStreetMap mine/quarry features (© OpenStreetMap contributors, ODbL); Wikidata P625;\n' +
  '   USGS Minerals Yearbook, Bulgaria 2019 (https://pubs.usgs.gov/myb/vol3/2019/myb3-2019-bulgaria.pdf); bg.wikipedia.org.\n' +
  '   c = [lon, lat] of the mine itself; active = worked today; area = rough outline of an extended basin. */\n';
const kinds = 'const MINERAL_KINDS={\n' + Object.entries(MINERAL_KINDS).map(([k, v]) => `  ${k}:${JSON.stringify(v)},`).join('\n') + '\n};\n';
const list = 'const MINERALS=[\n' + MINERALS.map((m) => '  ' + JSON.stringify(m) + ',').join('\n') + '\n];\n';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'minerals.js');
fs.writeFileSync(out, header + kinds + list);
const counts = {};
for (const m of MINERALS) counts[m.k] = (counts[m.k] || 0) + 1;
console.log('wrote', out, MINERALS.length, 'entries', counts);
