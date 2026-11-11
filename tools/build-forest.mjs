// node build-forest.mjs → ../img/real-forest.webp
// The forests: ESA WorldCover 2021 class 10 "tree cover" (10 m from Sentinel-1/2, CC BY 4.0), read from its 3° × 3°
// cloud-optimised GeoTIFFs on AWS at the overview of ~320 m per pixel, painted dark green on a transparent image over the
// whole map. index.html lays it on the land, under the relief, so the hill shading falls on the woods too.
import fs from 'fs';
import sharp from 'sharp';
import { fromUrl } from 'geotiff';

const ROOT = new URL('../', import.meta.url);
const REAL = JSON.parse(fs.readFileSync(new URL('real-map.js', ROOT), 'utf8').replace(/^[\s\S]*?const REAL=/, '').replace(/;\s*$/, ''));
const SCALE = .75; // output pixels per map unit, as the relief
const OVERVIEW = 5; // 36000 / 2^5 = 1125 pixels per 3°
const GREEN = [38, 92, 44], ALPHA = 70; // the woods' colour and how strongly it covers the parchment
const OW = Math.round(REAL.W * SCALE), OH = Math.round(REAL.H * SCALE);
const lonOf = (x) => x / (REAL.cx * REAL.k) + REAL.lon0, latOf = (y) => REAL.lat1 - y / REAL.k;
const lon0 = lonOf(0), lon1 = lonOf(REAL.W), lat0 = latOf(REAL.H), lat1 = latOf(0);

const tiles = new Map(); // "N42E024" → { data, n }
const name = (la, lo) => `${la < 0 ? 'S' : 'N'}${String(Math.abs(la)).padStart(2, '0')}${lo < 0 ? 'W' : 'E'}${String(Math.abs(lo)).padStart(3, '0')}`;
const jobs = [];
for (let la = Math.floor(lat0 / 3) * 3; la < lat1; la += 3) for (let lo = Math.floor(lon0 / 3) * 3; lo < lon1; lo += 3) jobs.push([la, lo]);
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let j; (j = jobs.shift());) {
    const [la, lo] = j, id = name(la, lo);
    const url = `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${id}_Map.tif`;
    if (!(await fetch(url, { method: 'HEAD' })).ok) continue; // open sea: no tile
    const im = await (await fromUrl(url)).getImage(OVERVIEW);
    const [data] = await im.readRasters();
    tiles.set(id, { data, n: im.getWidth() });
  }
}));

const out = Buffer.alloc(OW * OH * 4), mask = new Float32Array(OW * OH);
for (let y = 0; y < OH; y++) {
  const lat = latOf((y + .5) / SCALE), la = Math.floor(lat / 3) * 3;
  for (let x = 0; x < OW; x++) {
    const lon = lonOf((x + .5) / SCALE), lo = Math.floor(lon / 3) * 3, t = tiles.get(name(la, lo)); if (!t) continue;
    const i = Math.min(t.n - 1, Math.floor(((lon - lo) / 3) * t.n)), j = Math.min(t.n - 1, Math.floor(((la + 3 - lat) / 3) * t.n));
    mask[y * OW + x] = t.data[j * t.n + i] === 10 ? 1 : 0;
  }
}
// soften the edges by one pixel, so the woods have no stair steps
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < OH && xx >= 0 && xx < OW) { s += mask[yy * OW + xx]; n++; } }
  const o = (y * OW + x) * 4; out[o] = GREEN[0]; out[o + 1] = GREEN[1]; out[o + 2] = GREEN[2]; out[o + 3] = Math.round((s / n) * ALPHA);
}
const file = new URL('img/real-forest.webp', ROOT);
await sharp(out, { raw: { width: OW, height: OH, channels: 4 } }).webp({ quality: 80, alphaQuality: 80 }).toFile(file.pathname);
let share = 0; for (const v of mask) share += v;
console.log(`img/real-forest.webp ${OW}×${OH} ${(fs.statSync(file).size / 1024).toFixed(0)} KB · ${tiles.size} WorldCover tiles · ${(share / mask.length * 100).toFixed(1)}% of the map is forest`);
