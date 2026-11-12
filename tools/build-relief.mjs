// node build-relief.mjs → ../img/real-relief.webp (shading) + real-heights.webp (height colours) + real-depth.webp (deep sea)
// The accurate map's relief: hill shading lit from the north-west plus two soft brown height steps (above 700 m and
// above 1500 m, as on the history map), one white-based image that index.html multiplies over the land.
// Heights: Terrain Tiles on AWS (Mapzen terrarium, z8, ~450 m per pixel here), cached in tools/data/tiles/.
import fs from 'fs';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url);
const REAL = JSON.parse(fs.readFileSync(new URL('real-map.js', ROOT), 'utf8').replace(/^[\s\S]*?const REAL=/, '').replace(/;\s*$/, ''));
// height colours as on a school physical map: green lowlands, yellow hills, browns deepening every 500 m, so Rila and Pirin
// (near 2900 m) read darker than Stara planina (2376 m) however steep its shaded slopes look; [from metres, colour]
const TINTS = [[-1e9, [178, 205, 146]], [200, [208, 220, 160]], [500, [236, 224, 170]], [1000, [224, 192, 138]],
  [1500, [200, 156, 104]], [2000, [170, 120, 78]], [2500, [140, 94, 62]]];
const SHADE = .42; // how dark the shaded slopes get
const DEEP = [62, 112, 140], DEEP_FROM = 120, DEEP_TO = 400, DEEP_ALPHA = 120; // the deep sea's blue, where it starts and is full, its strength
const EXAG = 1.6; // vertical exaggeration for the shading
const TILE = 256;
const lonOf = (x) => x / (REAL.cx * REAL.k) + REAL.lon0, latOf = (y) => REAL.lat1 - y / REAL.k;

// one image over the whole map
await render({ x0: 0, y0: 0, x1: REAL.W, y1: REAL.H, scale: .75, z: 8, file: 'img/real-relief.webp' });

async function render({ x0, y0, x1, y1, scale: SCALE, z: Z, file: name }) {
const OW = Math.round((x1 - x0) * SCALE), OH = Math.round((y1 - y0) * SCALE);
const gx = (lon) => ((lon + 180) / 360) * 2 ** Z * TILE;
const gy = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * TILE; };

// ---- fetch and stitch the tiles that cover the frame ----
const tx0 = Math.floor(gx(lonOf(x0)) / TILE), tx1 = Math.floor(gx(lonOf(x1)) / TILE);
const ty0 = Math.floor(gy(latOf(y0)) / TILE), ty1 = Math.floor(gy(latOf(y1)) / TILE);
const MW = (tx1 - tx0 + 1) * TILE, MH = (ty1 - ty0 + 1) * TILE, elev = new Float32Array(MW * MH);
const dir = new URL('./data/tiles/', import.meta.url); fs.mkdirSync(dir, { recursive: true });
let fetched = 0;
const want = [];
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) want.push([tx, ty]);
const missing = want.filter(([tx, ty]) => !fs.existsSync(new URL(`${Z}-${tx}-${ty}.png`, dir)));
await Promise.all(Array.from({ length: 16 }, async () => { // 16 downloads at a time
  for (let t; (t = missing.shift());) {
    const [tx, ty] = t, r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!r.ok) throw new Error(`tile ${tx},${ty}: ${r.status}`);
    fs.writeFileSync(new URL(`${Z}-${tx}-${ty}.png`, dir), Buffer.from(await r.arrayBuffer())); fetched++;
  }
}));
for (const [tx, ty] of want) {
  const f = new URL(`${Z}-${tx}-${ty}.png`, dir);
  const { data } = await sharp(fs.readFileSync(f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ox = (tx - tx0) * TILE, oy = (ty - ty0) * TILE;
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    const o = (j * TILE + i) * 3; elev[(oy + j) * MW + ox + i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
  }
}
const sample = (X, Y) => { // bilinear, in mosaic pixels
  const x = Math.max(0, Math.min(MW - 1.001, X)), y = Math.max(0, Math.min(MH - 1.001, Y)), i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, o = j * MW + i;
  return elev[o] * (1 - u) * (1 - v) + elev[o + 1] * u * (1 - v) + elev[o + MW] * (1 - u) * v + elev[o + MW + 1] * u * v;
};

// ---- heights on the output grid ----
const h = new Float32Array(OW * OH), floor = new Float32Array(OW * OH), colX = new Float64Array(OW);
for (let x = 0; x < OW; x++) colX[x] = gx(lonOf(x0 + (x + .5) / SCALE)) - tx0 * TILE;
for (let y = 0; y < OH; y++) { const my = gy(latOf(y0 + (y + .5) / SCALE)) - ty0 * TILE; for (let x = 0; x < OW; x++) { const e = sample(colX[x], my); h[y * OW + x] = Math.max(0, e); floor[y * OW + x] = Math.min(0, e); } }
// a calmer copy for the height steps, so they are soft shapes, not pixel noise
const blur = (src, r) => { const a = new Float32Array(src.length), b = new Float32Array(src.length);
  for (let y = 0; y < OH; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * OW + Math.max(0, Math.min(OW - 1, x))];
    for (let x = 0; x < OW; x++) { a[y * OW + x] = s / (2 * r + 1); s += src[y * OW + Math.min(OW - 1, x + r + 1)] - src[y * OW + Math.max(0, x - r)]; } }
  for (let x = 0; x < OW; x++) { let s = 0; for (let y = -r; y <= r; y++) s += a[Math.max(0, Math.min(OH - 1, y)) * OW + x];
    for (let y = 0; y < OH; y++) { b[y * OW + x] = s / (2 * r + 1); s += a[Math.min(OH - 1, y + r + 1) * OW + x] - a[Math.max(0, y - r) * OW + x]; } }
  return b; };
const calm = blur(blur(h, 2), 2);

// ---- shade → grey (multiplied over the map), height → colour (laid on the land) ----
const tint = Buffer.alloc(OW * OH * 3);

const mPerPx = 1000 * 111.2 / (REAL.k * SCALE); // metres per output pixel north–south (east–west is the same: the projection is true to scale)
const L = [-1, -1, 1.4].map((v, _, a) => v / Math.hypot(...a)); // light from the north-west, high
const out = Buffer.alloc(OW * OH * 3);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const o = y * OW + x, l = h[y * OW + Math.max(0, x - 1)], r = h[y * OW + Math.min(OW - 1, x + 1)], u = h[Math.max(0, y - 1) * OW + x], d = h[Math.min(OH - 1, y + 1) * OW + x];
  const dx = ((r - l) / (2 * mPerPx)) * EXAG, dy = ((d - u) / (2 * mPerPx)) * EXAG, n = Math.hypot(dx, dy, 1);
  const lit = (-dx * L[0] - dy * L[1] + L[2]) / n, flat = L[2]; // lit on flat ground = flat, so plains stay white
  let k = Math.min(1, 1 - SHADE * Math.max(0, flat - lit) / flat);
  out[o * 3] = out[o * 3 + 1] = out[o * 3 + 2] = 255 * k;
  const c = TINTS.findLast(([m]) => calm[o] > m)[1]; tint[o * 3] = c[0]; tint[o * 3 + 1] = c[1]; tint[o * 3 + 2] = c[2];
}
const tfile = new URL(name.replace('relief', 'heights'), ROOT);
await sharp(tint, { raw: { width: OW, height: OH, channels: 3 } }).webp({ quality: 82 }).toFile(tfile.pathname);
const file = new URL(name, ROOT); fs.mkdirSync(new URL('img/', ROOT), { recursive: true });
await sharp(out, { raw: { width: OW, height: OH, channels: 3 } }).webp({ quality: 80 }).toFile(file.pathname);
// the deep sea: one darker blue step past the edge of the shelf, faded in over DEEP_FROM–DEEP_TO metres below the surface
// and smoothed wide, so it is a soft shape; transparent elsewhere, index.html lays it on the sea under the coast ripples
const deep = blur(blur(floor, 4), 4), dout = Buffer.alloc(OW * OH * 4);
for (let o = 0; o < OW * OH; o++) {
  const a = Math.max(0, Math.min(1, (-deep[o] - DEEP_FROM) / (DEEP_TO - DEEP_FROM)));
  dout[o * 4] = DEEP[0]; dout[o * 4 + 1] = DEEP[1]; dout[o * 4 + 2] = DEEP[2]; dout[o * 4 + 3] = Math.round(a * DEEP_ALPHA);
}
const dfile = new URL(name.replace('relief', 'depth'), ROOT);
await sharp(dout, { raw: { width: OW, height: OH, channels: 4 } }).webp({ quality: 80, alphaQuality: 70 }).toFile(dfile.pathname);
console.log(`${name.replace('relief', 'depth')} ${(fs.statSync(dfile).size / 1024).toFixed(0)} KB`);
console.log(`${name} ${OW}×${OH} ${(fs.statSync(file).size / 1024).toFixed(0)} KB · ${fetched} tiles fetched, ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} used`);
}
