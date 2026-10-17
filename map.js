/* Fantasy map renderer for Bulgaria: one heightfield, two looks ("ink" and "paint"). Needs GEO from geo.js. */
window.BGMap = (function () {
  const { W, H, k, cx, lon0, lat1 } = GEO;
  const P = (lon, lat) => [(lon - lon0) * cx * k, (lat1 - lat) * k];
  const U = (x, y) => [x / (cx * k) + lon0, lat1 - y / k];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const R = rng(seed), perm = new Uint8Array(512), g = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; g[i] = R(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const sm = (t) => t * t * (3 - 2 * t);
    const v = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const h = (a, b) => g[perm[(a & 255) + perm[b & 255]]];
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      const u = sm(xf), w = sm(yf);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
    return (x, y, oct = 4) => { let t = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += v(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2.03; } return t / n; };
  }
  const n1 = makeNoise(7), n2 = makeNoise(19), n3 = makeNoise(33), n4 = makeNoise(51), n5 = makeNoise(88);

  const ringTo = (c, r) => { c.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) c.lineTo(r[i], r[i + 1]); c.closePath(); };
  const BG = new Path2D(); GEO.bg.forEach((r) => ringTo(BG, r));
  const NB = new Path2D(); GEO.nb.forEach((n) => n.r.forEach((r) => { if (r.length >= 6) ringTo(NB, r); }));
  const LAND = new Path2D(); LAND.addPath(BG); LAND.addPath(NB);
  const OBL = new Path2D(); GEO.obl.forEach((o) => o.r.forEach((r) => ringTo(OBL, r)));
  const HT = document.createElement('canvas').getContext('2d');
  const inBG = (x, y) => HT.isPointInPath(BG, x, y);
  const inLand = (x, y) => HT.isPointInPath(LAND, x, y);

  /* ---------- relief: ridges as [lon,lat] polylines with height h and width w (map units) ---------- */
  const RIDGES = [
    { h: .45, w: 22, p: [[22.4, 43.62], [22.75, 43.42], [23.1, 43.25], [23.45, 43.06], [23.8, 42.93]] },
    { h: .74, w: 22, p: [[23.8, 42.93], [24.2, 42.84], [24.6, 42.76], [25.0, 42.72], [25.5, 42.74]] },
    { h: .95, w: 12, p: [[24.92, 42.71]] },
    { h: .42, w: 20, p: [[25.5, 42.74], [25.9, 42.76], [26.3, 42.8], [26.8, 42.84], [27.3, 42.85], [27.85, 42.8]] },
    { h: .32, w: 15, p: [[23.75, 42.6], [24.2, 42.58], [24.7, 42.55], [25.2, 42.52], [25.75, 42.47], [26.05, 42.45]] },
    { h: .72, w: 13, p: [[23.22, 42.6], [23.3, 42.52]] },
    { h: .35, w: 18, p: [[22.55, 42.65], [22.9, 42.42]] },
    { h: 1.0, w: 24, p: [[23.08, 42.2], [23.35, 42.15], [23.6, 42.18], [23.85, 42.12]] },
    { h: .96, w: 17, p: [[23.3, 41.92], [23.4, 41.77], [23.5, 41.62], [23.56, 41.48]] },
    { h: .6, w: 38, p: [[23.95, 41.97], [24.4, 41.86], [24.9, 41.72], [25.4, 41.6]] },
    { h: .5, w: 30, p: [[24.0, 41.68], [24.6, 41.55], [25.2, 41.46], [25.8, 41.4]] },
    { h: .3, w: 24, p: [[25.5, 41.6], [26.0, 41.45], [26.2, 41.3]] },
    { h: .55, w: 14, p: [[22.42, 42.26], [22.72, 42.15]] },
    { h: .5, w: 10, p: [[22.95, 41.37], [23.3, 41.37]] },
    { h: .28, w: 26, p: [[27.15, 42.13], [27.6, 42.08], [27.98, 41.98]] },
    { h: .24, w: 14, p: [[26.1, 42.0], [26.5, 41.95]] },
    { h: .17, w: 30, p: [[23.0, 43.35], [24.2, 43.1], [25.5, 43.0], [26.5, 43.1]] },
    { h: .45, w: 34, p: [[21.95, 43.6], [22.15, 42.8], [22.1, 42.3]] },
    { h: .5, w: 34, p: [[24.0, 41.3], [24.7, 41.2], [25.3, 41.15]] },
    { h: .45, w: 26, p: [[22.15, 41.9], [22.4, 41.45], [22.7, 41.1]] },
    { h: .35, w: 30, p: [[22.6, 40.95], [23.4, 40.9]] }
  ].map((r) => ({ h: r.h, w: r.w, p: r.p.map((q) => P(q[0], q[1])) }));
  RIDGES.forEach((r) => { const xs = r.p.map((q) => q[0]), ys = r.p.map((q) => q[1]), m = r.w * 3; r.bb = [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m]; });
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
  }
  const C = 3, GW = Math.ceil(W / C) + 2, GH = Math.ceil(H / C) + 2;
  const E = new Float32Array(GW * GH), M = new Float32Array(GW * GH), IB = new Uint8Array(GW * GH), IL = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i * C, y = j * C; let e = 0;
    for (const r of RIDGES) {
      if (x < r.bb[0] || x > r.bb[2] || y < r.bb[1] || y > r.bb[3]) continue;
      let d = 1e9; const p = r.p;
      if (p.length === 1) d = Math.hypot(x - p[0][0], y - p[0][1]);
      else for (let s = 0; s < p.length - 1; s++) d = Math.min(d, segDist(x, y, p[s][0], p[s][1], p[s + 1][0], p[s + 1][1]));
      const v = r.h * Math.exp(-(d * d) / (r.w * r.w)); if (v > e) e = v;
    }
    const nz = n1(x / 55, y / 55, 5);
    e = e * (0.62 + 0.75 * nz) + 0.05 * (n2(x / 22, y / 22, 3) - 0.5);
    const o = j * GW + i; E[o] = Math.max(0, e); M[o] = n3(x / 110, y / 110, 3);
    IB[o] = inBG(x, y) ? 1 : 0; IL[o] = IB[o] || inLand(x, y) ? 1 : 0;
  }
  const at = (A, x, y) => {
    const fx = x / C, fy = y / C, i = Math.max(0, Math.min(GW - 2, Math.floor(fx))), j = Math.max(0, Math.min(GH - 2, Math.floor(fy))), u = fx - i, v = fy - j;
    const o = j * GW + i; return A[o] * (1 - u) * (1 - v) + A[o + 1] * u * (1 - v) + A[o + GW] * (1 - u) * v + A[o + GW + 1] * u * v;
  };
  const elev = (x, y) => at(E, x, y), moist = (x, y) => at(M, x, y);
  const SH = new Float32Array(GW * GH);
  (function () {
    const L = [-0.62, -0.58, 0.53], ll = Math.hypot(...L), flat = L[2] / ll, Z = 42;
    for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
      const o = j * GW + i, dx = (E[o + 1] - E[o - 1]) / (2 * C), dy = (E[o + GW] - E[o - GW]) / (2 * C);
      const nx = -dx * Z, ny = -dy * Z, nl = Math.hypot(nx, ny, 1);
      SH[o] = ((nx * L[0] + ny * L[1] + L[2]) / (nl * ll)) / flat;
    }
  })();

  /* distance (in cells, capped) from each land cell to open water, for beaches and coastal tint */
  const DS = new Uint8Array(GW * GH).fill(255);
  (function () {
    const q = [];
    for (let o = 0; o < GW * GH; o++) if (!IL[o]) { DS[o] = 0; q.push(o); }
    for (let h = 0; h < q.length; h++) {
      const o = q[h], d = DS[o]; if (d >= 8) continue;
      const i = o % GW, nbs = [i > 0 ? o - 1 : -1, i < GW - 1 ? o + 1 : -1, o - GW, o + GW];
      for (const n of nbs) if (n >= 0 && n < GW * GH && DS[n] > d + 1) { DS[n] = d + 1; q.push(n); }
    }
  })();
  const seaDist = (x, y) => DS[Math.min(GH - 1, Math.max(0, Math.round(y / C))) * GW + Math.min(GW - 1, Math.max(0, Math.round(x / C)))];
  const clamp0 = (v, a, b) => (v < a ? a : v > b ? b : v);
  function forestInfo(x, y) {
    const e = elev(x, y), m = moist(x, y), [lon, lat] = U(x, y);
    let base = e > 0.3 && e < 0.64 ? 0.95 : e > 0.1 && e <= 0.3 ? 0.78 : e <= 0.1 ? 0.05 : 0;
    if (lon > 26.15 && lon < 27.35 && lat > 43.3 && lat < 43.78) base = Math.max(base, 0.72);
    if (lon > 27.0 && lat < 42.3 && lat > 41.95) base = Math.max(base, 0.88);
    const c = n4(x / 30, y / 30, 3) + (m - 0.5) * 0.35;
    return { e, m, dens: base * clamp0((c - 0.34) / 0.14, 0, 1) };
  }

  /* ---------- colour helpers ---------- */
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; return mix(c0, c1, (t - t0) / (t1 - t0)); } return stops[stops.length - 1][1]; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const INK_LO = hex('#e3c98a'), INK_HI = hex('#f1e0ae'), INK_MT = hex('#cfb07a');
  const PAINT_STOPS = [[0, null], [0.12, hex('#86b84c')], [0.24, hex('#65a03e')], [0.38, hex('#4c7a33')], [0.52, hex('#76684a')], [0.68, hex('#8c7c68')], [0.8, hex('#bdb7ac')], [0.9, hex('#f2f2ee')], [2, hex('#ffffff')]];
  function terrainCanvas(theme) {
    const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
    const g = cv.getContext('2d'), id = g.createImageData(GW, GH), d = id.data;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const o = j * GW + i, e = E[o], m = M[o], s = SH[o] || 1, x = i * C, y = j * C;
      let col;
      if (theme === 'ink') {
        col = mix(INK_LO, INK_HI, clamp(m * 1.4 - 0.2, 0, 1));
        col = mix(col, INK_MT, clamp((e - 0.2) * 1.6, 0, 0.8));
        const f = clamp(1 + (s - 1) * 0.7, 0.76, 1.12); col = col.map((v) => v * f);
        const sp = 1 + (n4(x / 6, y / 6, 2) - 0.5) * 0.08; col = col.map((v) => v * sp);
      } else {
        const north = clamp((y - 250) / -120 + 0.5, 0, 1);
        const lo = mix(mix(hex('#9cc35a'), hex('#c3bb62'), clamp(m * 1.3 - 0.15, 0, 1) * 0.9), mix(hex('#c9b866'), hex('#b3a352'), m), north * 0.7);
        const FIELDS = [hex('#d2bf68'), hex('#8fb050'), hex('#bfa556'), hex('#a9b964'), hex('#c9c27e')];
        const fq = Math.floor(n5(x / 13 + 40, y / 13, 1) * 9) % 5;
        PAINT_STOPS[0][1] = mix(lo, FIELDS[fq], clamp(0.4 - e * 3, 0, 0.4) * (IB[o] ? 1 : 0.5)); col = ramp(PAINT_STOPS, e);
        const f = clamp(1 + (s - 1) * 1.0, 0.68, 1.22); col = col.map((v) => v * f);
        const sp = 1 + (n4(x / 5, y / 5, 2) - 0.5) * 0.14 + (n5(x / 30, y / 30, 2) - 0.5) * 0.12; col = col.map((v) => v * sp);
        const fi = forestInfo(x, y).dens; col = mix(col, hex(e > 0.34 ? '#26502a' : '#3a6a2a'), fi * 0.62);
        const dsea = DS[o]; if (dsea <= 2 && dsea > 0) col = mix(col, hex('#efdc9c'), dsea === 1 ? 0.85 : 0.45);
        if (!IB[o]) { const gr = (col[0] + col[1] + col[2]) / 3; col = mix(col, [gr, gr, gr], 0.3).map((v) => v * 0.8); }
      }
      d[o * 4] = clamp(col[0], 0, 255); d[o * 4 + 1] = clamp(col[1], 0, 255); d[o * 4 + 2] = clamp(col[2], 0, 255); d[o * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0); return cv;
  }
  function grain(kind) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), id = g.createImageData(256, 256), R = rng(5);
    for (let i = 0; i < 256 * 256; i++) { const v = kind === 'mul' ? 215 + R() * 40 : 100 + R() * 56; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return cv;
  }

  /* ---------- features ---------- */
  const CITIES = [
    ['София', 23.32, 42.70, 3, 12, -10], ['Пловдив', 24.75, 42.15, 2, 10, 4], ['Варна', 27.91, 43.21, 2, 10, -6], ['Бургас', 27.47, 42.50, 2, 10, 6],
    ['Русе', 25.97, 43.85, 2, 10, 4], ['Стара Загора', 25.63, 42.43, 1, 8, 4], ['Плевен', 24.62, 43.42, 1, 8, 4], ['Велико Търново', 25.63, 43.08, 1, 8, 4],
    ['Видин', 22.88, 43.99, 1, 8, 4], ['Благоевград', 23.10, 42.02, 1, -8, 4], ['Шумен', 26.93, 43.27, 1, -8, 14], ['Смолян', 24.70, 41.58, 1, 8, 4],
    ['Хасково', 25.56, 41.93, 1, 8, 4], ['Добрич', 27.83, 43.57, 1, 8, 4], ['Сливен', 26.32, 42.68, 1, 8, 4], ['Враца', 23.55, 43.21, 1, 8, 4]
  ].map(([n, lon, lat, s, dx, dy]) => { const [x, y] = P(lon, lat); return { n, x, y, s, dx, dy }; });
  const city = (n) => CITIES.find((c) => c.n === n);
  const ROADS = [['Видин', 'Враца', 'София'], ['София', 'Пловдив', 'Хасково'], ['Пловдив', 'Стара Загора', 'Сливен', 'Бургас', 'Варна'], ['София', 'Плевен', 'Велико Търново', 'Шумен', 'Варна'],
    ['Русе', 'Велико Търново', 'Стара Загора'], ['София', 'Благоевград'], ['Пловдив', 'Смолян'], ['Варна', 'Добрич']];
  const REGIONS = [
    ['СТАРА ПЛАНИНА', 24.55, 42.98, -6, 21, 6], ['РИЛА', 23.47, 42.33, 0, 16, 5], ['ПИРИН', 23.66, 41.7, 0, 15, 5], ['РОДОПИ', 24.95, 41.83, -4, 22, 9],
    ['СТРАНДЖА', 27.45, 42.2, 0, 14, 5], ['СРЕДНА ГОРА', 24.55, 42.47, -3, 12, 4], ['ДОБРУДЖА', 27.55, 43.78, 0, 15, 6], ['ЛУДОГОРИЕ', 26.6, 43.55, 0, 12, 4],
    ['ДУНАВСКА РАВНИНА', 24.4, 43.58, -2, 15, 5], ['ТРАКИЙСКА НИЗИНА', 25.35, 42.25, -2, 13, 5]
  ].map(([t, lon, lat, a, s, sp]) => { const [x, y] = P(lon, lat); return { t, x, y, a, s, sp }; });
  const NEIGH = [['РУМЪНИЯ', 25.6, 44.47, 0], ['СЪРБИЯ', 22.13, 43.25, -90], ['С. МАКЕДОНИЯ', 22.3, 41.62, -90], ['ГЪРЦИЯ', 23.9, 41.05, 0], ['ТУРЦИЯ', 27.05, 41.45, 0]]
    .map(([t, lon, lat, a]) => { const [x, y] = P(lon, lat); return { t, x, y, a }; });
  const riverW = (r, theme) => r.n === 'Danube' ? (theme === 'ink' ? 7 : 6) : ['Evros', 'Strymnas', 'Mesta', 'Olt', 'Levi Iskar', 'Arda', 'Yantra', 'Tundzha', 'Kamchiya', 'Maritsa'].includes(r.n) ? 2.7 : 1.7;

  /* ---------- drawing helpers ---------- */
  function smooth(c, p) {
    c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    c.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  function spaced(c, text, x, y, o) {
    c.save(); c.translate(x, y); c.rotate(((o.a || 0) * Math.PI) / 180); c.font = o.font; c.textBaseline = 'middle';
    const chars = [...text], ws = chars.map((ch) => c.measureText(ch).width), sp = o.sp || 0;
    const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1); let cx0 = -total / 2;
    for (let pass = 0; pass < 2; pass++) {
      let xx = cx0;
      chars.forEach((ch, i) => {
        if (pass === 0 && o.stroke) { c.lineJoin = 'round'; c.lineWidth = o.lw || 3; c.strokeStyle = o.stroke; c.strokeText(ch, xx, 0); }
        if (pass === 1) { if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.blur || 4; } c.fillStyle = o.fill; c.fillText(ch, xx, 0); }
        xx += ws[i] + sp;
      });
    }
    c.restore();
  }
  function hexGrid(c, R0, style) {
    c.save(); c.clip(BG); c.strokeStyle = style; c.lineWidth = 0.7; c.beginPath();
    const s3 = Math.sqrt(3);
    for (let r = -1; r * R0 * 1.5 < H + R0; r++) for (let q = -1; q * R0 * s3 < W + R0; q++) {
      const x = q * R0 * s3 + (r % 2 ? (R0 * s3) / 2 : 0), y = r * R0 * 1.5;
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6, px = x + R0 * Math.cos(a), py = y + R0 * Math.sin(a); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath();
    }
    c.stroke(); c.restore();
  }
  function vignette(c, col, inner) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.max(W, H) * inner, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  /* ---------- sprites ---------- */
  const spriteCache = {};
  function sprites(theme) {
    if (spriteCache[theme]) return spriteCache[theme];
    const R = rng(theme === 'ink' ? 11 : 23), out = [];
    const near = (x, y, r) => CITIES.some((c) => Math.hypot(c.x - x, c.y - y) < r * (c.s + 1));
    const ms = theme === 'ink' ? 13 : 15;
    for (let row = 0, y = 0; y < H; row++, y += ms * 0.7) for (let x = row % 2 ? ms / 2 : 0; x < W; x += ms) {
      const jx = x + (R() - 0.5) * ms * 1.1, jy = y + (R() - 0.5) * ms * 0.9;
      if (!inBG(jx, jy) || near(jx, jy, 8)) continue;
      const e = elev(jx, jy);
      if (e > 0.48 && R() < Math.min(0.95, (e - 0.42) * 3.4)) out.push({ t: 'm', x: jx, y: jy, e, v: R() });
    }
    const ts = theme === 'ink' ? 5.4 : 5.6;
    for (let row = 0, y = 0; y < H; row++, y += ts * 0.8) for (let x = row % 2 ? ts / 2 : 0; x < W; x += ts) {
      const jx = x + (R() - 0.5) * ts, jy = y + (R() - 0.5) * ts * 0.8;
      if (!inBG(jx, jy) || near(jx, jy, 7)) continue;
      const { e, dens } = forestInfo(jx, jy);
      const kind = e > 0.36 || (e > 0.3 && R() < 0.5) ? 'p' : 'd';
      if (R() < dens * (theme === 'ink' ? 1 : 1.08)) out.push({ t: kind, x: jx, y: jy, e, v: R(), au: n5(jx / 40, jy / 40, 2) > 0.63 });
    }
    if (theme !== 'ink') {
      for (let row = 0, y = 0; y < H; row++, y += 12) for (let x = row % 2 ? 8 : 0; x < W; x += 16) {
        const jx = x + (R() - 0.5) * 12, jy = y + (R() - 0.5) * 8;
        if (!inBG(jx, jy) || near(jx, jy, 8)) continue;
        const { e, dens } = forestInfo(jx, jy);
        if (e > 0.17 && e < 0.48 && dens < 0.5 && R() < 0.55) out.push({ t: 'h', x: jx, y: jy, e, v: R() });
      }
    }
    out.sort((a, b) => a.y - b.y);
    return (spriteCache[theme] = out);
  }

  const fieldCache = {};
  function fields() {
    if (fieldCache.f) return fieldCache.f;
    const R = rng(41), out = [];
    const near = (x, y, r) => CITIES.some((c) => Math.hypot(c.x - x, c.y - y) < r * (c.s + 1));
    for (let row = 0, y = 0; y < H; row++, y += 11) for (let x = row % 2 ? 7 : 0; x < W; x += 14) {
      const jx = x + (R() - 0.5) * 6, jy = y + (R() - 0.5) * 5;
      if (!inBG(jx, jy) || near(jx, jy, 5) || seaDist(jx, jy) < 4) continue;
      const { e, dens } = forestInfo(jx, jy); if (e > 0.13 || dens > 0.12 || R() < 0.3) continue;
      const [lon, lat] = U(jx, jy);
      let pal = ['#8fb456', '#a7c063', '#d2bc62', '#7d9a3e', '#c2b45c'];
      if (lon > 27.15 && lat > 43.35) pal = ['#f0bf2a', '#e9b324', '#dcc15a', '#9cb84f', '#f3cc3c'];
      else if (lon > 24.65 && lon < 25.75 && lat > 42.53 && lat < 42.74) pal = ['#e48aac', '#d96c98', '#ef9fbe', '#9cbb59'];
      else if (lat > 43.2) pal = ['#d9bd5c', '#c9a94a', '#a2b85a', '#e0c870', '#bf9a48'];
      out.push({ x: jx, y: jy, w: 11 + R() * 7, h: 8 + R() * 5, a: (n2(jx / 80, jy / 80, 1) - 0.5) * 1.2 + (R() - 0.5) * 0.25, col: pal[Math.floor(R() * pal.length)], st: R() < 0.7 });
    }
    return (fieldCache.f = out);
  }
  function drawField(c, f) {
    c.save(); c.translate(f.x, f.y); c.rotate(f.a);
    c.fillStyle = f.col; c.globalAlpha = 0.72; c.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); c.globalAlpha = 1;
    if (f.st) { c.strokeStyle = 'rgba(70,50,10,.22)'; c.lineWidth = 0.7; c.beginPath(); for (let yy = -f.h / 2 + 2; yy < f.h / 2; yy += 2.4) { c.moveTo(-f.w / 2 + 1, yy); c.lineTo(f.w / 2 - 1, yy); } c.stroke(); }
    c.strokeStyle = 'rgba(80,60,20,.35)'; c.lineWidth = 0.6; c.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
    c.restore();
  }
  function inkPine(c, x, y, h, v) {
    const w = h * 0.42, dark = v < 0.5 ? '#2c5543' : '#335f4a', light = v < 0.5 ? '#4f7e62' : '#5b8a69';
    c.fillStyle = 'rgba(60,40,15,.2)'; c.beginPath(); c.ellipse(x + 2, y, w * 0.9, h * 0.11, 0, 0, 7); c.fill();
    const pts = [[0, -h], [w * 0.55, -h * 0.58], [w * 0.33, -h * 0.58], [w, -h * 0.13], [0, -h * 0.13]];
    c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(x + a, y + b) : c.moveTo(x + a, y + b))); for (let i = pts.length - 2; i > 0; i--) c.lineTo(x - pts[i][0], y + pts[i][1]); c.closePath();
    c.fillStyle = dark; c.fill(); c.strokeStyle = '#1b2a20'; c.lineWidth = 0.55; c.stroke();
    c.beginPath(); c.moveTo(x, y - h); c.lineTo(x - w * 0.55, y - h * 0.58); c.lineTo(x - w * 0.33, y - h * 0.58); c.lineTo(x - w, y - h * 0.13); c.lineTo(x, y - h * 0.13); c.closePath();
    c.fillStyle = light; c.fill();
    c.fillStyle = '#3b2a17'; c.fillRect(x - 0.5, y - h * 0.13, 1, h * 0.13);
  }
  function inkLeaf(c, x, y, r, v) {
    c.fillStyle = 'rgba(60,40,15,.18)'; c.beginPath(); c.ellipse(x + 2, y, r * 1.3, r * 0.3, 0, 0, 7); c.fill();
    const blobs = [[-r * 0.6, -r * 0.9, r * 0.75], [r * 0.6, -r * 0.9, r * 0.75], [0, -r * 1.55, r * 0.8]];
    c.beginPath(); blobs.forEach(([a, b, rr]) => { c.moveTo(x + a + rr, y + b); c.arc(x + a, y + b, rr, 0, 7); });
    c.fillStyle = v < 0.5 ? '#6e9a72' : '#7da67c'; c.fill(); c.strokeStyle = '#1f2f22'; c.lineWidth = 0.55; c.stroke();
    c.fillStyle = 'rgba(255,250,220,.25)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 1.75, r * 0.32, 0, 7); c.fill();
  }
  /* irregular peak outline shared by both looks: left profile up to apex, right profile down, plus ridge foot */
  function peakShape(x, y, e, seed, big) {
    const R = rng(seed), s = (big ? 13 : 10) + e * (big ? 31 : 24) + R() * 6, w = s * (1.05 + R() * 0.55);
    const ax = x + (R() - 0.5) * w * 0.3, ay = y - s, lx = x - w * 0.6, rx = x + w * 0.6;
    const L = [[lx, y]], Rt = [];
    for (let i = 1; i < 4; i++) { const t = i / 4; L.push([lx + (ax - lx) * t + (R() - 0.5) * s * 0.14, y - s * t * (0.9 + R() * 0.2)]); }
    L.push([ax, ay]);
    const twin = R() < 0.35;
    for (let i = 1; i < 4; i++) { const t = i / 4; let py = ay + s * t + (R() - 0.65) * s * 0.18; if (twin && i === 1) py = ay + s * 0.12; Rt.push([ax + (rx - ax) * t + (R() - 0.5) * s * 0.12, Math.min(y, py)]); }
    Rt.push([rx, y]);
    return { s, w, ax, ay, L, Rt, mx: ax + w * 0.06 + (R() - 0.5) * w * 0.1, R };
  }
  function inkMountain(c, x, y, e, v) {
    const m = peakShape(x, y, e, Math.floor(x * 13 + y * 7), false), { s, w, ax, ay, L, Rt, mx, R } = m;
    c.fillStyle = 'rgba(70,45,15,.22)'; c.beginPath(); c.ellipse(x + w * 0.25, y + 1, w * 0.7, s * 0.12, 0, 0, 7); c.fill();
    c.beginPath(); L.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.lineTo(mx, y); c.closePath(); c.fillStyle = '#f2e4ba'; c.fill();
    c.beginPath(); c.moveTo(ax, ay); Rt.forEach(([a, b]) => c.lineTo(a, b)); c.lineTo(mx, y); c.closePath(); c.fillStyle = '#c9a874'; c.fill();
    c.save(); c.clip(); c.strokeStyle = 'rgba(60,38,15,.6)'; c.lineWidth = 0.55;
    for (let i = 1; i < 10; i++) { const t = i / 10, sx = ax + (mx - ax) * t, sy = ay + (y - ay) * t; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + w * 0.4, sy + s * 0.32); c.stroke(); }
    c.restore();
    c.strokeStyle = 'rgba(60,38,15,.45)'; c.lineWidth = 0.5;
    for (let i = 0; i < 2; i++) { const t = 0.35 + i * 0.25, px = L[1][0] + (ax - L[1][0]) * t, py = L[1][1] + (ay - L[1][1]) * t; c.beginPath(); c.moveTo(px, py); c.lineTo(px + w * 0.06, py + s * 0.22); c.stroke(); }
    if (e > 0.7) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - s * 0.22, ay + s * 0.3); c.lineTo(ax - s * 0.08, ay + s * 0.24); c.lineTo(ax + s * 0.02, ay + s * 0.36); c.lineTo(ax + s * 0.12, ay + s * 0.25); c.lineTo(ax + s * 0.2, ay + s * 0.3); c.closePath(); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = 'rgba(60,38,15,.5)'; c.lineWidth = 0.4; c.stroke(); }
    c.beginPath(); L.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); Rt.forEach(([a, b]) => c.lineTo(a, b));
    c.strokeStyle = '#2e1f0d'; c.lineWidth = 0.95; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(mx - w * 0.05, ay + s * 0.5, mx, y - s * 0.08); c.lineWidth = 0.55; c.stroke();
  }
  const AUT = ['#e8a33c', '#d9662b', '#f0c64a', '#c2482a'], GRN = [['#b2e264', '#47912c'], ['#9ad455', '#367a26'], ['#c2e874', '#559e32']];
  function paintTree(c, x, y, h, v, kind, au) {
    c.fillStyle = 'rgba(20,35,10,.3)'; c.beginPath(); c.ellipse(x + 2.4, y, h * 0.42, h * 0.12, 0, 0, 7); c.fill();
    if (kind === 'p') {
      const w = h * 0.36;
      c.fillStyle = '#4a2f17'; c.fillRect(x - 0.8, y - h * 0.16, 1.6, h * 0.16);
      for (let i = 0; i < 3; i++) {
        const top = y - h + i * h * 0.26, bot = top + h * 0.44, ww = w * (0.62 + i * 0.2);
        c.beginPath(); c.moveTo(x, top); c.lineTo(x + ww, bot); c.lineTo(x - ww, bot); c.closePath(); c.fillStyle = v < 0.5 ? '#21492a' : '#28532c'; c.fill();
        c.beginPath(); c.moveTo(x, top); c.lineTo(x - ww, bot); c.lineTo(x - ww * 0.1, bot); c.closePath(); c.fillStyle = v < 0.5 ? '#3f7a3a' : '#4b8a42'; c.fill();
      }
    } else {
      const r = h * 0.34, cy = y - r * 1.25, pal = au ? null : GRN[Math.floor(v * 3)];
      c.fillStyle = '#4a2f17'; c.fillRect(x - 0.9, y - r * 0.6, 1.8, r * 0.6);
      const blob = (bx, by, rr, k) => {
        const g = c.createRadialGradient(bx - rr * 0.4, by - rr * 0.5, rr * 0.1, bx, by, rr * 1.1);
        if (au) { const a1 = AUT[(k + Math.floor(v * 4)) % 4]; g.addColorStop(0, '#fbe08a'); g.addColorStop(0.35, a1); g.addColorStop(1, '#7a3214'); }
        else { g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); }
        c.fillStyle = g; c.beginPath(); c.arc(bx, by, rr, 0, 7); c.fill();
      };
      blob(x - r * 0.55, cy + r * 0.2, r * 0.75, 0); blob(x + r * 0.55, cy + r * 0.25, r * 0.72, 1); blob(x, cy - r * 0.35, r * 0.8, 2);
      c.fillStyle = 'rgba(255,255,220,.28)'; c.beginPath(); c.arc(x - r * 0.3, cy - r * 0.6, r * 0.22, 0, 7); c.fill();
    }
  }
  function paintHill(c, x, y, e, v) {
    const w = 9 + v * 7 + e * 10, h = w * (0.45 + v * 0.15);
    c.fillStyle = 'rgba(25,35,10,.25)'; c.beginPath(); c.ellipse(x + w * 0.2, y + 0.5, w * 0.62, h * 0.18, 0, 0, 7); c.fill();
    const g = c.createLinearGradient(x - w * 0.5, y - h, x + w * 0.5, y);
    g.addColorStop(0, e > 0.35 ? '#b9b07a' : '#b5cf72'); g.addColorStop(0.55, e > 0.35 ? '#7c7a45' : '#6f9a3c'); g.addColorStop(1, e > 0.35 ? '#4d4a26' : '#3f6424');
    c.beginPath(); c.moveTo(x - w * 0.55, y); c.bezierCurveTo(x - w * 0.4, y - h * 1.1, x + w * 0.25, y - h * 1.15, x + w * 0.55, y); c.closePath(); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(40,50,15,.35)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x - w * 0.55, y); c.bezierCurveTo(x - w * 0.4, y - h * 1.1, x + w * 0.25, y - h * 1.15, x + w * 0.55, y); c.stroke();
  }
  function paintMountain(c, x, y, e, v) {
    const m = peakShape(x, y, e, Math.floor(x * 11 + y * 5), true), { s, w, ax, ay, L, Rt, mx } = m;
    const green = e < 0.6;
    c.fillStyle = 'rgba(25,20,8,.3)'; c.beginPath(); c.ellipse(x + w * 0.2, y + 1, w * 0.72, s * 0.14, 0, 0, 7); c.fill();
    let g = c.createLinearGradient(ax, ay, x - w * 0.5, y);
    g.addColorStop(0, green ? '#c3cf8c' : '#ead8b0'); g.addColorStop(1, green ? '#5d7c34' : '#8a6a44');
    c.beginPath(); L.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.lineTo(mx, y); c.closePath(); c.fillStyle = g; c.fill();
    g = c.createLinearGradient(ax, ay, x + w * 0.5, y);
    g.addColorStop(0, green ? '#6e8a42' : '#7b5a3a'); g.addColorStop(1, green ? '#2f4419' : '#3a2818');
    c.beginPath(); c.moveTo(ax, ay); Rt.forEach(([a, b]) => c.lineTo(a, b)); c.lineTo(mx, y); c.closePath(); c.fillStyle = g; c.fill();
    c.save(); c.clip(); c.strokeStyle = 'rgba(20,12,5,.28)'; c.lineWidth = 0.8;
    for (let i = 1; i < 6; i++) { const t = i / 6, sx = ax + (mx - ax) * t, sy = ay + (y - ay) * t; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + w * 0.3, sy + s * 0.36); c.stroke(); }
    c.restore();
    if (e > 0.68) {
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - s * 0.27, ay + s * 0.36); c.lineTo(ax - s * 0.11, ay + s * 0.3); c.lineTo(ax - s * 0.02, ay + s * 0.44); c.lineTo(ax + s * 0.1, ay + s * 0.32); c.lineTo(ax + s * 0.24, ay + s * 0.4); c.closePath();
      c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - s * 0.02, ay + s * 0.44); c.lineTo(ax + s * 0.1, ay + s * 0.32); c.lineTo(ax + s * 0.24, ay + s * 0.4); c.closePath(); c.fillStyle = '#b9c7d6'; c.fill();
    }
    c.strokeStyle = 'rgba(35,22,8,.5)'; c.lineWidth = 0.6; c.beginPath(); L.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); Rt.forEach(([a, b]) => c.lineTo(a, b)); c.stroke();
  }
  function cloud(c, x, y, s, R) {
    for (let i = 0; i < 9; i++) {
      const px = x + (R() - 0.5) * s * 2.4, py = y + (R() - 0.5) * s * 0.7, r = s * (0.45 + R() * 0.55);
      const g = c.createRadialGradient(px - r * 0.2, py - r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(245,248,252,.7)'); g.addColorStop(1, 'rgba(230,238,248,0)');
      c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
    }
  }

  /* ---------- decorations ---------- */
  function rhumbs(c, ox, oy, col) {
    c.save(); c.strokeStyle = col; c.lineWidth = 0.7;
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(a) * 2000, oy + Math.sin(a) * 2000); c.stroke(); }
    c.restore();
  }
  function inkCompass(c, x, y, r) {
    c.save(); c.strokeStyle = 'rgba(225,240,230,.7)'; c.lineWidth = 1;
    [r, r * 0.92, r * 0.42].forEach((rr) => { c.beginPath(); c.arc(x, y, rr, 0, 7); c.stroke(); });
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, l = i % 9 === 0 ? 0.84 : 0.88; c.beginPath(); c.moveTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l); c.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); c.stroke(); }
    const pt = (a, len, wd, lc, dc) => {
      const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len, lx = x + Math.cos(a - Math.PI / 2) * wd, ly = y + Math.sin(a - Math.PI / 2) * wd, rx = x + Math.cos(a + Math.PI / 2) * wd, ry = y + Math.sin(a + Math.PI / 2) * wd;
      c.beginPath(); c.moveTo(x, y); c.lineTo(lx, ly); c.lineTo(tx, ty); c.closePath(); c.fillStyle = lc; c.fill();
      c.beginPath(); c.moveTo(x, y); c.lineTo(rx, ry); c.lineTo(tx, ty); c.closePath(); c.fillStyle = dc; c.fill();
    };
    for (let i = 0; i < 8; i++) pt((i / 8) * Math.PI * 2 + Math.PI / 8, r * 0.6, r * 0.08, 'rgba(160,200,200,.75)', 'rgba(70,120,125,.85)');
    for (let i = 0; i < 4; i++) pt((i / 4) * Math.PI * 2 - Math.PI / 2 + Math.PI / 4, r * 0.7, r * 0.1, '#a9c7c4', '#4f8486');
    for (let i = 0; i < 4; i++) pt((i / 4) * Math.PI * 2 - Math.PI / 2, r * 1.0, r * 0.13, '#d8ebe6', '#6f9c9c');
    c.fillStyle = '#e6f2ee'; c.beginPath(); c.arc(x, y, r * 0.06, 0, 7); c.fill();
    c.font = `600 ${r * 0.2}px "Cormorant Unicase", serif`; c.fillStyle = 'rgba(230,242,236,.9)'; c.textAlign = 'center'; c.textBaseline = 'middle';
    [['С', 0, -1.18], ['И', 1.18, 0], ['Ю', 0, 1.18], ['З', -1.18, 0]].forEach(([t, a, b]) => c.fillText(t, x + a * r, y + b * r));
    c.restore();
  }
  function ribbon(c, x, y, text, size, gold) {
    c.save(); c.font = `600 ${size}px Kurale, "Cormorant Garamond", serif`;
    const tw = c.measureText(text).width, hw = tw / 2 + size * 0.7, hh = size * 0.78, tail = size * 0.9;
    const pg = c.createLinearGradient(0, y - hh, 0, y + hh); pg.addColorStop(0, gold ? '#fbe9b8' : '#f6e6bc'); pg.addColorStop(1, gold ? '#d8b56a' : '#d4b67a');
    const tailShape = (sx) => { c.beginPath(); c.moveTo(x + sx * hw * 0.9, y - hh * 0.55); c.lineTo(x + sx * (hw + tail), y - hh * 0.55); c.lineTo(x + sx * (hw + tail * 0.6), y + hh * 0.2); c.lineTo(x + sx * (hw + tail), y + hh * 0.95); c.lineTo(x + sx * hw * 0.9, y + hh * 0.95); c.closePath(); c.fillStyle = '#b8955a'; c.fill(); c.strokeStyle = '#5a3d17'; c.lineWidth = 0.8; c.stroke(); };
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 4; c.shadowOffsetY = 1.5;
    tailShape(-1); tailShape(1);
    c.beginPath(); c.moveTo(x - hw, y - hh); c.quadraticCurveTo(x, y - hh - size * 0.25, x + hw, y - hh); c.lineTo(x + hw, y + hh * 0.7); c.quadraticCurveTo(x, y + hh * 0.7 - size * 0.25, x - hw, y + hh * 0.7); c.closePath();
    c.fillStyle = pg; c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = gold ? '#8a6420' : '#6b4a22'; c.lineWidth = gold ? 1.6 : 0.9; c.stroke();
    c.fillStyle = '#3d2810'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - size * 0.12);
    c.restore();
  }
  function metalCompass(c, x, y, r) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
    let g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
    g.addColorStop(0, '#e5e8ec'); g.addColorStop(0.55, '#9aa1a9'); g.addColorStop(1, '#4b5158');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = '#2a3036'; c.beginPath(); c.arc(x, y, r * 0.78, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r * 0.86, 0, 7); c.stroke();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.fillStyle = '#c7ccd2'; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92, 1.6, 0, 7); c.fill(); }
    const pt = (a, len, wd, lc, dc) => {
      const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a - Math.PI / 2) * wd, y + Math.sin(a - Math.PI / 2) * wd); c.lineTo(tx, ty); c.closePath(); c.fillStyle = lc; c.fill();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a + Math.PI / 2) * wd, y + Math.sin(a + Math.PI / 2) * wd); c.lineTo(tx, ty); c.closePath(); c.fillStyle = dc; c.fill();
    };
    for (let i = 0; i < 4; i++) pt((i / 4) * Math.PI * 2 + Math.PI / 4, r * 0.7, r * 0.12, '#d7dbe0', '#7d858e');
    for (let i = 0; i < 4; i++) pt((i / 4) * Math.PI * 2 - Math.PI / 2, i === 0 ? r * 1.45 : r * 1.12, r * 0.15, i === 0 ? '#f2d58a' : '#eef1f4', i === 0 ? '#a77d2a' : '#8b939c');
    g = c.createRadialGradient(x - 2, y - 2, 1, x, y, r * 0.16); g.addColorStop(0, '#7fe3d6'); g.addColorStop(1, '#0f6b63');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.15, 0, 7); c.fill(); c.strokeStyle = '#d9b45a'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  function goldFrame(c, W = GEO.W, H = GEO.H) {
    const F = 20;
    const g = c.createLinearGradient(0, 0, W, H);
    ['#7a5a20', '#e9c873', '#a87a2a', '#f3dc93', '#8a6424', '#e6c26a', '#7a5a20'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    c.save(); c.lineWidth = F; c.strokeStyle = g; c.strokeRect(F / 2, F / 2, W - F, H - F);
    c.lineWidth = 1.6; c.strokeStyle = '#3a2a10'; c.strokeRect(F + 0.8, F + 0.8, W - 2 * F - 1.6, H - 2 * F - 1.6); c.strokeRect(0.8, 0.8, W - 1.6, H - 1.6);
    c.strokeStyle = 'rgba(255,240,200,.55)'; c.lineWidth = 1; c.strokeRect(4, 4, W - 8, H - 8);
    c.fillStyle = 'rgba(80,55,15,.55)';
    for (let x = 30; x < W - 30; x += 14) { c.beginPath(); c.arc(x, F / 2, 2, 0, 7); c.arc(x, H - F / 2, 2, 0, 7); c.fill(); }
    for (let y = 30; y < H - 30; y += 14) { c.beginPath(); c.arc(F / 2, y, 2, 0, 7); c.arc(W - F / 2, y, 2, 0, 7); c.fill(); }
    const corner = (tx, ty, sx, sy) => {
      c.save(); c.translate(tx, ty); c.scale(sx, sy);
      const lg = c.createLinearGradient(0, 0, 110, 110); lg.addColorStop(0, '#f6e1a0'); lg.addColorStop(0.5, '#c4943a'); lg.addColorStop(1, '#7a5a20');
      c.fillStyle = lg; c.strokeStyle = '#3e2a0c'; c.lineWidth = 1.1;
      const leaf = (flip) => {
        c.save(); if (flip) { c.transform(0, 1, 1, 0, 0, 0); }
        c.beginPath(); c.moveTo(18, 4); c.bezierCurveTo(50, -6, 92, 2, 118, 16); c.bezierCurveTo(104, 22, 96, 30, 86, 26); c.bezierCurveTo(70, 20, 50, 24, 34, 32); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.arc(118, 24, 8, -Math.PI / 2, Math.PI * 1.2); c.stroke();
        c.beginPath(); c.moveTo(36, 22); c.bezierCurveTo(56, 14, 80, 14, 100, 18); c.strokeStyle = 'rgba(62,42,12,.6)'; c.stroke(); c.strokeStyle = '#3e2a0c';
        c.restore();
      };
      leaf(false); leaf(true);
      c.beginPath(); c.arc(22, 22, 22, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.arc(22, 22, 13, 0, 7); c.fillStyle = '#7a5a20'; c.fill(); c.stroke();
      c.beginPath(); c.arc(22, 22, 6, 0, 7); c.fillStyle = '#f3dc93'; c.fill(); c.stroke();
      c.restore();
    };
    corner(0, 0, 1, 1); corner(W, 0, -1, 1); corner(0, H, 1, -1); corner(W, H, -1, -1);
    c.restore();
  }

  /* ---------- charm: castles, boats, sea life (painted look) ---------- */
  function castle(c, x, y, sc, hill) {
    c.save(); c.translate(x, y); c.scale(sc, sc);
    if (hill) { const g = c.createLinearGradient(-16, -10, 16, 4); g.addColorStop(0, '#a9c964'); g.addColorStop(1, '#3f6424'); c.fillStyle = g; c.beginPath(); c.moveTo(-18, 4); c.bezierCurveTo(-12, -9, 12, -9, 18, 4); c.closePath(); c.fill(); c.translate(0, -6); }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(2, 3, 15, 3.5, 0, 0, 7); c.fill();
    const wall = (wx, wy, ww, wh) => { c.fillStyle = '#efe6d2'; c.fillRect(wx, wy, ww, wh); c.fillStyle = '#cbbd9e'; c.fillRect(wx + ww * 0.6, wy, ww * 0.4, wh); c.strokeStyle = '#3d2a14'; c.lineWidth = 0.7; c.strokeRect(wx, wy, ww, wh); };
    const merlons = (wx, wy, ww) => { for (let i = 0; i < ww; i += 3) { c.fillStyle = '#efe6d2'; c.fillRect(wx + i, wy - 2, 1.8, 2); c.strokeRect(wx + i, wy - 2, 1.8, 2); } };
    const tower = (tx, ty, tw, th) => { wall(tx, ty, tw, th); c.beginPath(); c.moveTo(tx - 1.2, ty); c.lineTo(tx + tw / 2, ty - th * 0.6); c.lineTo(tx + tw + 1.2, ty); c.closePath(); c.fillStyle = '#b3402a'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(tx + tw / 2, ty); c.lineTo(tx + tw / 2, ty - th * 0.6); c.lineTo(tx + tw + 1.2, ty); c.closePath(); c.fillStyle = '#8a2e1e'; c.fill(); };
    wall(-9, -9, 18, 10); merlons(-9, -9, 18);
    tower(-14, -14, 6, 15); tower(8, -14, 6, 15); tower(-3, -20, 6, 12);
    c.fillStyle = '#3d2a14'; c.beginPath(); c.moveTo(-2.2, 1); c.lineTo(-2.2, -3); c.arc(0, -3, 2.2, Math.PI, 0); c.lineTo(2.2, 1); c.closePath(); c.fill();
    c.strokeStyle = '#3d2a14'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(0, -27); c.lineTo(0, -33); c.stroke();
    c.fillStyle = '#ffffff'; c.fillRect(0, -33, 5, 1.1); c.fillStyle = '#2f8a3f'; c.fillRect(0, -31.9, 5, 1.1); c.fillStyle = '#d23a2a'; c.fillRect(0, -30.8, 5, 1.1);
    c.restore();
  }
  function ship(c, x, y, s, flip) {
    c.save(); c.translate(x, y); c.scale(flip ? -s : s, s);
    c.strokeStyle = 'rgba(235,250,255,.55)'; c.lineWidth = 1.1; c.lineCap = 'round';
    [[18, 2, 30], [22, 5, 40], [16, -1, 22]].forEach(([dx, dy, l]) => { c.beginPath(); c.moveTo(dx, dy); c.quadraticCurveTo(dx + l * 0.5, dy + 2, dx + l, dy - 1); c.stroke(); });
    c.fillStyle = 'rgba(0,20,50,.35)'; c.beginPath(); c.ellipse(0, 3, 16, 2.6, 0, 0, 7); c.fill();
    const hg = c.createLinearGradient(0, -4, 0, 3); hg.addColorStop(0, '#8a5328'); hg.addColorStop(1, '#4a2a12');
    c.beginPath(); c.moveTo(-15, -4); c.lineTo(15, -4); c.quadraticCurveTo(12, 3, 8, 3); c.lineTo(-10, 3); c.quadraticCurveTo(-14, 1, -15, -4); c.closePath(); c.fillStyle = hg; c.fill(); c.strokeStyle = '#2e1a0a'; c.lineWidth = 0.7; c.stroke();
    c.fillStyle = '#d9b45a'; c.fillRect(-14, -3.4, 28, 0.9);
    c.strokeStyle = '#3a2410'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1, -4); c.lineTo(-1, -30); c.moveTo(8, -4); c.lineTo(8, -20); c.stroke();
    const sail = (x0, top, bot, wd) => { const g = c.createLinearGradient(x0 - wd, 0, x0 + wd, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d2bf'); c.beginPath(); c.moveTo(x0 - wd, top); c.quadraticCurveTo(x0 + wd * 0.2, (top + bot) / 2, x0 - wd, bot); c.lineTo(x0 + wd, bot); c.quadraticCurveTo(x0 + wd * 1.5, (top + bot) / 2, x0 + wd, top); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(60,45,25,.6)'; c.lineWidth = 0.6; c.stroke(); };
    sail(-1, -27, -16, 6.5); sail(-1, -15, -6, 8); sail(8, -18, -7, 5);
    c.fillStyle = '#d23a2a'; c.beginPath(); c.moveTo(-1, -30); c.lineTo(-7, -28.5); c.lineTo(-1, -27); c.closePath(); c.fill();
    c.restore();
  }
  function dolphin(c, x, y, s, flip) {
    c.save(); c.translate(x, y); c.scale(flip ? -s : s, s);
    c.strokeStyle = 'rgba(235,250,255,.7)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(-11, 1, 5, 1.6, 0, 0, 7); c.ellipse(11, 1, 5, 1.6, 0, 0, 7); c.stroke();
    const g = c.createLinearGradient(0, -14, 0, 2); g.addColorStop(0, '#7f9fb8'); g.addColorStop(1, '#3d5a75');
    c.beginPath(); c.moveTo(-12, 1); c.bezierCurveTo(-8, -16, 8, -16, 12, -2); c.lineTo(15, 0); c.lineTo(11, 1); c.bezierCurveTo(7, -10, -6, -10, -9, 1); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = '#26394c'; c.lineWidth = 0.7; c.stroke();
    c.beginPath(); c.moveTo(-1, -11.5); c.lineTo(2, -16); c.lineTo(4, -11); c.closePath(); c.fillStyle = '#3d5a75'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-12, 1); c.lineTo(-16, -2); c.lineTo(-15, 3); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(9, -5, 0.9, 0, 7); c.fill();
    c.fillStyle = 'rgba(235,250,255,.8)'; [[-14, -4], [-16, -7], [-13, -8]].forEach(([a, b]) => { c.beginPath(); c.arc(a, b, 0.8, 0, 7); c.fill(); });
    c.restore();
  }
  function stork(c, x, y, s, flap) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.strokeStyle = '#d9502a'; c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-6, 0.6); c.lineTo(-12, 1.6); c.stroke();
    c.fillStyle = '#ffffff'; c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.5;
    const wy = flap ? -7 : -4;
    c.beginPath(); c.moveTo(-2, -0.5); c.quadraticCurveTo(-4, wy - 2, -1, wy - 5); c.quadraticCurveTo(1, wy - 2, 2, -0.5); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-2, 0.5); c.quadraticCurveTo(-4, -wy + 1, -1, -wy + 4); c.quadraticCurveTo(1, -wy + 1, 2, 0.5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#1d1d1d'; c.beginPath(); c.moveTo(-1, wy - 5); c.quadraticCurveTo(-2.4, wy - 3, -1.6, wy - 1.6); c.lineTo(0.6, wy - 2.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-1, -wy + 4); c.quadraticCurveTo(-2.4, -wy + 2, -1.6, -wy + 0.6); c.lineTo(0.6, -wy + 1.5); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(1, 0, 5.5, 1.8, 0, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(7, -0.2, 1.4, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = '#e0602f'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(8.2, -0.2); c.lineTo(12.5, 0.4); c.stroke();
    c.restore();
  }
  function serpent(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    const body = '#2fa08f', dark = '#1c6a60', belly = '#bfe9c9';
    [[-18, 6], [-4, 7], [10, 6]].forEach(([hx, r]) => { c.strokeStyle = 'rgba(230,250,255,.6)'; c.lineWidth = 1; c.beginPath(); c.ellipse(hx, 0.5, r + 3, 1.8, 0, 0, 7); c.stroke(); });
    const hump = (hx, r) => { c.beginPath(); c.arc(hx, 0, r, Math.PI, 0); c.arc(hx, 0, r - 3.2, 0, Math.PI, true); c.closePath(); const g = c.createLinearGradient(hx, -r, hx, 0); g.addColorStop(0, '#5cc7b1'); g.addColorStop(1, dark); c.fillStyle = g; c.fill(); c.strokeStyle = '#0f3d37'; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = '#f2c75c'; for (let a = 0.25; a < 1; a += 0.25) { const ang = Math.PI + a * Math.PI; c.beginPath(); c.moveTo(hx + Math.cos(ang) * r, Math.sin(ang) * r); c.lineTo(hx + Math.cos(ang) * (r + 2.2), Math.sin(ang) * (r + 2.2)); c.lineTo(hx + Math.cos(ang + 0.15) * r, Math.sin(ang + 0.15) * r); c.closePath(); c.fill(); } };
    hump(-18, 6); hump(-4, 7);
    c.beginPath(); c.moveTo(-27, 0); c.quadraticCurveTo(-31, -4, -29, -7); c.quadraticCurveTo(-28, -3, -24, 0); c.closePath(); c.fillStyle = body; c.fill(); c.strokeStyle = '#0f3d37'; c.stroke();
    c.beginPath(); c.moveTo(7, 0); c.quadraticCurveTo(8, -12, 15, -14); c.quadraticCurveTo(20, -14, 21, -10); c.quadraticCurveTo(17, -9, 13, -10); c.quadraticCurveTo(11, -5, 11, 0); c.closePath();
    c.fillStyle = body; c.fill(); c.stroke();
    c.fillStyle = belly; c.beginPath(); c.moveTo(11, 0); c.quadraticCurveTo(11, -5, 13, -9.6); c.lineTo(14, -9); c.quadraticCurveTo(12.6, -5, 12.8, 0); c.closePath(); c.fill();
    c.fillStyle = '#f2c75c'; c.beginPath(); c.moveTo(14, -13.6); c.lineTo(13, -18); c.lineTo(16, -14); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(17, -12, 1.6, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(17.5, -12, 0.8, 0, 7); c.fill();
    c.strokeStyle = '#d9502a'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(21, -10); c.lineTo(23.5, -9.2); c.moveTo(21, -10); c.lineTo(23.2, -10.8); c.stroke();
    c.restore();
  }

  /* ---------- main render ---------- */
  const terrCache = {}, grains = {};
  async function fontsReady() {
    if (!document.fonts) return;
    const want = ['700 20px "Cormorant Unicase"', '600 20px "Cormorant Unicase"', '600 14px Kurale', 'italic 600 20px "Cormorant Garamond"'];
    await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, 'БЪЛГАРИЯ'))), new Promise((r) => setTimeout(r, 2500))]);
  }
  /* opt: a pixel width (whole map, framed) or {cw, ch, s, ox, oy, frame, compass} to place the map inside a screen-sized canvas */
  async function render(canvas, theme, opt) {
    await fontsReady();
    let cw, ch, s, ox = 0, oy = 0, frame = true, compassOn = true, labels = true, fade = false;
    if (typeof opt === 'number') { s = opt / W; cw = Math.round(W * s); ch = Math.round(H * s); }
    else { ({ cw, ch, s, ox, oy } = opt); frame = opt.frame !== false; compassOn = opt.compass !== false; labels = opt.cityLabels !== false; fade = !!opt.fade; }
    canvas.width = cw; canvas.height = ch;
    const c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0);
    const covers = ox <= 0.5 && oy <= 0.5 && ox + W * s >= cw - 0.5 && oy + H * s >= ch - 0.5;
    if (!covers) { const bgc = fade ? (theme === 'ink' ? '#0f3a40' : '#0f4f8c') : c.createLinearGradient(0, 0, 0, ch); if (!fade) { bgc.addColorStop(0, theme === 'ink' ? '#0d3136' : '#0b2552'); bgc.addColorStop(1, theme === 'ink' ? '#071c20' : '#06142f'); } c.fillStyle = bgc; c.fillRect(0, 0, cw, ch); }
    c.setTransform(s, 0, 0, s, ox, oy); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.save(); if (!covers) { c.beginPath(); if (!fade && c.roundRect) c.roundRect(0, 0, W, H, 16); else c.rect(0, 0, W, H); c.clip(); }
    const terr = terrCache[theme] || (terrCache[theme] = terrainCanvas(theme));
    const ink = theme === 'ink';
    const gr = grains[theme] || (grains[theme] = c.createPattern(grain(ink ? 'mul' : 'ov'), 'repeat'));
    const compass = ink ? P(28.78, 42.55) : [988, 102];

    // sea
    let g = c.createRadialGradient(W * 0.55, H * 0.5, 50, W * 0.55, H * 0.5, W * 0.75);
    if (ink) { g.addColorStop(0, '#2b7175'); g.addColorStop(1, '#0f3a40'); } else { g.addColorStop(0, '#2a9ad8'); g.addColorStop(1, '#0f4f8c'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (ink) rhumbs(c, compass[0], compass[1], 'rgba(210,235,228,.16)');
    else {
      const R = rng(77);
      for (let i = 0; i < 90; i++) { const x = R() * W, y = R() * H, r = 40 + R() * 130, b = c.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, R() < 0.5 ? 'rgba(90,185,245,.22)' : 'rgba(4,25,75,.25)'); b.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = b; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
      c.lineCap = 'round';
      for (let i = 0; i < 3200; i++) {
        let x = R() * W, y = R() * H; if (inLand(x, y)) continue;
        c.beginPath(); c.moveTo(x, y); const len = 6 + R() * 18, curl = (R() - 0.5) * 0.5;
        let a = n1(x / 90, y / 90, 2) * Math.PI * 6;
        for (let st = 0; st < len; st++) { a += curl; x += Math.cos(a) * 1.7; y += Math.sin(a) * 1.7; c.lineTo(x, y); }
        c.strokeStyle = R() < 0.7 ? `rgba(220,242,255,${0.05 + R() * 0.11})` : `rgba(4,22,62,${0.08 + R() * 0.12})`; c.lineWidth = 0.6 + R() * 1.8; c.stroke();
      }
    }
    // coastal shallows
    c.save(); c.lineJoin = 'round';
    if (ink) {
      [[46, 'rgba(70,140,135,.35)'], [32, 'rgba(95,165,155,.35)'], [20, 'rgba(135,192,172,.38)'], [10, 'rgba(175,215,190,.35)']].forEach(([w, col]) => { c.lineWidth = w; c.strokeStyle = col; c.stroke(LAND); });
    } else {
      c.shadowColor = 'rgba(110,220,255,.95)'; c.shadowBlur = 50; c.fillStyle = '#2a86c8'; c.fill(LAND); c.fill(LAND); c.shadowColor = 'transparent';
      [[22, 'rgba(120,215,245,.35)'], [12, 'rgba(170,235,250,.4)'], [5, 'rgba(235,252,255,.55)']].forEach(([w, col]) => { c.lineWidth = w; c.strokeStyle = col; c.stroke(LAND); });
    }
    c.restore();
    // land
    c.save(); c.shadowColor = ink ? 'rgba(0,20,20,.55)' : 'rgba(0,20,50,.5)'; c.shadowBlur = 10; c.fillStyle = ink ? '#e3c98a' : '#7ea544'; c.fill(LAND); c.restore();
    c.save(); c.clip(LAND); c.drawImage(terr, 0, 0, GW * C, GH * C);
    if (ink) [[26, .07], [16, .08], [8, .1]].forEach(([w, a]) => { c.lineWidth = w; c.strokeStyle = `rgba(105,70,25,${a})`; c.stroke(LAND); });
    c.restore();
    // rivers and lakes
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of GEO.rv) {
      const w = riverW(r, theme); c.beginPath(); smooth(c, r.p);
      if (ink) { c.strokeStyle = '#22312b'; c.lineWidth = w + 2.2; c.stroke(); c.strokeStyle = '#3c8b88'; c.lineWidth = w; c.stroke(); if (w > 2) { c.strokeStyle = 'rgba(150,210,200,.55)'; c.lineWidth = w * 0.3; c.stroke(); } }
      else { c.strokeStyle = 'rgba(30,110,120,.75)'; c.lineWidth = w + 1.6; c.stroke(); c.strokeStyle = '#4ccad6'; c.lineWidth = w + 0.4; c.stroke(); c.strokeStyle = 'rgba(200,250,250,.75)'; c.lineWidth = w * 0.35; c.stroke(); }
    }
    for (const l of GEO.lk) { c.beginPath(); ringTo(c, l); c.fillStyle = ink ? '#3c8b88' : '#4ccad6'; c.fill(); c.strokeStyle = ink ? '#22312b' : 'rgba(30,110,120,.8)'; c.lineWidth = 1; c.stroke(); }
    c.restore();
    // neighbours recede
    c.save(); c.fillStyle = ink ? 'rgba(14,48,50,.5)' : 'rgba(15,30,60,.24)'; c.fill(NB); c.restore();
    if (ink) hexGrid(c, 24, 'rgba(85,60,25,.13)');
    // sprites
    const R2 = rng(99);
    if (!ink) {
      fields().forEach((f) => drawField(c, f));
      c.fillStyle = 'rgba(26,58,22,.42)';
      for (const sp of sprites(theme)) if (sp.t === 'p' || sp.t === 'd') { c.beginPath(); c.arc(sp.x, sp.y - 5, 7.5 + sp.v * 2, 0, 7); c.fill(); }
    }
    for (const sp of sprites(theme)) {
      if (ink) { if (sp.t === 'm') inkMountain(c, sp.x, sp.y, sp.e, sp.v); else if (sp.t === 'p') inkPine(c, sp.x, sp.y, 10 + sp.v * 5, sp.v); else inkLeaf(c, sp.x, sp.y, 3.6 + sp.v * 1.6, sp.v); }
      else { if (sp.t === 'm') paintMountain(c, sp.x, sp.y, sp.e, sp.v); else if (sp.t === 'h') paintHill(c, sp.x, sp.y, sp.e, sp.v); else paintTree(c, sp.x, sp.y, 11 + sp.v * 7, sp.v, sp.t, sp.au); }
    }
    if (!ink) {
      const at2 = (lon, lat) => P(lon, lat);
      ship(c, ...at2(28.75, 42.85), 1.05, false); ship(c, ...at2(28.3, 42.15), 0.8, true); ship(c, ...at2(25.0, 43.74), 0.55, true);
      dolphin(c, ...at2(28.6, 42.45), 0.9, false); dolphin(c, ...at2(28.78, 42.4), 0.7, false);
      serpent(c, ...at2(29.05, 41.75), 1.15);
      [[0, 0, 1, 1], [-14, -8, 0.85, 0], [-13, 9, 0.8, 0]].forEach(([dx, dy, sc, fl]) => { const [x, y] = at2(28.15, 43.0); stork(c, x + dx, y + dy, 1.25 * sc, fl); });
      c.save(); c.globalAlpha = 0.85; [[23.62, 42.08, 15], [23.36, 41.72, 14], [24.95, 42.66, 12], [23.0, 42.26, 10]].forEach(([lon, lat, sz]) => { const [x, y] = P(lon, lat); cloud(c, x, y, sz, R2); });
      c.globalAlpha = 0.5; [[22.25, 41.0, 26], [29.25, 41.1, 24], [22.15, 44.6, 22], [26.3, 44.65, 18]].forEach(([lon, lat, sz]) => { const [x, y] = P(lon, lat); cloud(c, x, y, sz, R2); }); c.restore();
    }
    // borders
    c.save(); c.lineJoin = 'round';
    if (ink) {
      c.strokeStyle = 'rgba(80,55,25,.35)'; c.lineWidth = 0.8; c.setLineDash([2, 3]); c.stroke(OBL); c.setLineDash([]);
      c.strokeStyle = '#2b1d0e'; c.lineWidth = 1.3; c.stroke(NB);
      c.strokeStyle = 'rgba(245,230,185,.45)'; c.lineWidth = 6; c.stroke(BG); c.strokeStyle = '#2b1d0e'; c.lineWidth = 2.2; c.stroke(BG);
    } else {
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.setLineDash([3, 4]); c.stroke(OBL);
      c.strokeStyle = 'rgba(25,30,15,.55)'; c.lineWidth = 1; c.setLineDash([]); c.stroke(NB);
      c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 3; c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; c.setLineDash([8, 5]); c.stroke(BG); c.setLineDash([]);
    }
    c.restore();
    // roads
    if (ink) {
      const R = rng(3); c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      for (const route of ROADS) {
        const pts = []; route.map(city).forEach((p, i, a) => { if (!i) return; const q = a[i - 1], n = Math.max(3, Math.round(Math.hypot(p.x - q.x, p.y - q.y) / 9)); const nx = -(p.y - q.y), ny = p.x - q.x, nl = Math.hypot(nx, ny);
          for (let s2 = i === 1 ? 0 : 1; s2 <= n; s2++) { const t = s2 / n, off = s2 === 0 || s2 === n ? 0 : (R() - 0.5) * 7; pts.push(q.x + (p.x - q.x) * t + (nx / nl) * off, q.y + (p.y - q.y) * t + (ny / nl) * off); } });
        c.beginPath(); smooth(c, pts); c.strokeStyle = 'rgba(235,215,160,.85)'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#4a321b'; c.lineWidth = 2; c.stroke();
      }
      c.restore();
    }
    // labels: neighbours, seas, regions
    NEIGH.forEach((n) => spaced(c, n.t, n.x, n.y, { a: n.a, font: `600 15px "Cormorant Unicase", serif`, sp: 6, fill: ink ? 'rgba(235,222,180,.55)' : 'rgba(255,255,255,.5)' }));
    const sea = (t, lon, lat, sz) => { const [x, y] = P(lon, lat); t.split(' ').forEach((w, i) => spaced(c, w, x, y + i * sz * 1.05, ink ? { font: `700 ${sz}px "Cormorant Unicase", serif`, sp: sz * 0.12, fill: '#f0dfae', stroke: '#2a1a0b', lw: 4.5, shadow: 'rgba(0,0,0,.5)', blur: 6 } : { font: `italic 600 ${sz}px "Cormorant Garamond", serif`, sp: sz * 0.35, fill: 'rgba(225,240,255,.78)', shadow: 'rgba(0,20,60,.8)', blur: 6 })); };
    sea('ЧЕРНО МОРЕ', 28.86, 43.45, 34);
    REGIONS.forEach((r) => spaced(c, r.t, r.x, r.y, ink ? { a: r.a, font: `700 ${r.s}px "Cormorant Unicase", serif`, sp: r.sp, fill: '#f3e6bf', stroke: '#2a1d10', lw: 3.4 } : { a: r.a, font: `italic 600 ${r.s + 3}px "Cormorant Garamond", serif`, sp: r.sp, fill: 'rgba(255,255,255,.95)', stroke: 'rgba(20,15,5,.45)', lw: 3, shadow: 'rgba(0,0,0,.9)', blur: 6 }));
    { const [x, y] = P(24.25, 43.86); spaced(c, 'р. Дунав', x, y, ink ? { a: -2, font: `italic 600 14px "Cormorant Garamond", serif`, sp: 2, fill: '#d9efe8', stroke: '#16302c', lw: 3 } : { a: -2, font: `italic 600 14px "Cormorant Garamond", serif`, sp: 2, fill: '#e6f6ff', shadow: '#000', blur: 4 }); }
    // cities
    for (const ct of CITIES) {
      if (ink) {
        c.save(); const R0 = [0, 3.2, 6, 9][ct.s];
        c.fillStyle = '#2a1a0b'; c.beginPath(); c.arc(ct.x, ct.y, R0, 0, 7); c.fill();
        c.fillStyle = '#f3e6bf'; c.beginPath(); c.arc(ct.x, ct.y, ct.s === 1 ? 1.4 : R0 * 0.52, 0, 7); c.fill(); c.restore();
        const sz = [0, 13, 18, 24][ct.s];
        if (labels) { c.save(); c.font = `700 ${sz}px "Cormorant Unicase", serif`; c.textBaseline = 'middle'; c.textAlign = ct.dx < 0 ? 'right' : 'left'; c.lineJoin = 'round';
        c.lineWidth = sz > 14 ? 4.5 : 3.2; c.strokeStyle = '#2a1a0b'; c.strokeText(ct.n, ct.x + ct.dx, ct.y + ct.dy); c.fillStyle = '#f3e6bf'; c.fillText(ct.n, ct.x + ct.dx, ct.y + ct.dy); c.restore(); }
      } else {
        if (ct.s >= 2 || ct.n === 'Велико Търново') castle(c, ct.x, ct.y + 4, ct.s === 3 ? 1.05 : 0.8, ct.n === 'Велико Търново');
        else {
        c.save(); const sc = [0, 0.8, 1.05, 1.35][ct.s]; c.translate(ct.x, ct.y); c.scale(sc, sc);
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(1, 2, 9, 3, 0, 0, 7); c.fill();
        [[-5, 0, 6, 7], [3, -1, 7, 9]].forEach(([hx, hy, hw, hh]) => { c.fillStyle = '#f2ead8'; c.fillRect(hx - hw / 2, hy - hh * 0.6, hw, hh * 0.6); c.fillStyle = '#b3402a'; c.beginPath(); c.moveTo(hx - hw / 2 - 1, hy - hh * 0.6); c.lineTo(hx, hy - hh); c.lineTo(hx + hw / 2 + 1, hy - hh * 0.6); c.closePath(); c.fill(); c.strokeStyle = '#3d2a14'; c.lineWidth = 0.6; c.strokeRect(hx - hw / 2, hy - hh * 0.6, hw, hh * 0.6); });
        c.restore(); }
        if (!labels) continue;
        if (ct.s >= 2) ribbon(c, ct.x + (ct.dx < 0 ? -1 : 1) * (ct.n.length * 4.2 + 22), ct.y + 2, ct.n, ct.s === 3 ? 15 : 12.5, false);
        else spaced(c, ct.n, ct.x + (ct.dx < 0 ? -1 : 1) * (ct.n.length * 3.3 + 9), ct.y + 1, { font: `600 12px Kurale, serif`, fill: '#fff8e6', stroke: 'rgba(40,25,8,.85)', lw: 3 });
      }
    }
    // compass, frame, finish
    if (compassOn) { if (ink) inkCompass(c, compass[0], compass[1], 66); else { metalCompass(c, compass[0], compass[1], 54); ribbon(c, compass[0] - 6, compass[1] + 62, 'БЪЛГАРИЯ', 22, true); } }
    vignette(c, ink ? 'rgba(5,25,28,.55)' : 'rgba(3,15,40,.5)', 0.42);
    c.save(); c.globalAlpha = ink ? 0.5 : 0.22; c.globalCompositeOperation = ink ? 'multiply' : 'overlay'; c.fillStyle = gr; c.fillRect(0, 0, W, H); c.restore();
    if (!covers && fade) {
      const bg = ink ? '15,58,64' : '15,79,140', F2 = 90;
      [[0, 0, F2, 0, 0, 0, F2, H], [W, 0, W - F2, 0, W - F2, 0, F2, H], [0, 0, 0, F2, 0, 0, W, F2], [0, H, 0, H - F2, 0, H - F2, W, F2]].forEach(([x0, y0, x1, y1, rx, ry, rw, rh]) => {
        const lg = c.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, `rgba(${bg},1)`); lg.addColorStop(1, `rgba(${bg},0)`); c.fillStyle = lg; c.fillRect(rx, ry, rw, rh);
      });
    }
    c.restore();
    if (!ink && frame) goldFrame(c);
  }

  const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  return { W, H, P, U, inBG, inLand, smooth, render, hav, goldFrame, rng };
})();
