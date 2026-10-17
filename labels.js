/* Signs placed over the map. Each sign: t (text), lon/lat (where it sits), kind, optional a (tilt in degrees).
   kind: 'region' (parchment ribbon), 'city' (small ribbon with a pin), 'sea' (handwritten), 'river' (handwritten), 'country' (spaced caps).
   Add or remove lines to put signs on cities and other places. */
const MAP_LABELS = [
  { t: 'Дунавска равнина', lon: 24.4, lat: 43.58, kind: 'region', a: -3 },
  { t: 'Стара планина', lon: 24.55, lat: 42.98, kind: 'region', a: -4 },
  { t: 'Средна гора', lon: 24.6, lat: 42.47, kind: 'region', a: -2 },
  { t: 'Тракийска низина', lon: 25.4, lat: 42.24, kind: 'region', a: -3 },
  { t: 'Рила', lon: 23.47, lat: 42.33, kind: 'region', a: -3 },
  { t: 'Пирин', lon: 23.62, lat: 41.68, kind: 'region', a: -4 },
  { t: 'Родопи', lon: 24.95, lat: 41.83, kind: 'region', a: -4 },
  { t: 'Странджа', lon: 27.45, lat: 42.2, kind: 'region', a: -2 },
  { t: 'Добруджа', lon: 27.6, lat: 43.8, kind: 'region', a: -5 },
  { t: 'Лудогорие', lon: 26.6, lat: 43.58, kind: 'region', a: -3 },
  { t: 'Черно море', lon: 28.95, lat: 43.3, kind: 'sea', a: -6 },
  { t: 'р. Дунав', lon: 24.25, lat: 43.9, kind: 'river', a: -4 },
  { t: 'Румъния', lon: 25.6, lat: 44.5, kind: 'country' },
  { t: 'Сърбия', lon: 22.13, lat: 43.25, kind: 'country', a: -78 },
  { t: 'С. Македония', lon: 22.3, lat: 41.62, kind: 'country', a: -78 },
  { t: 'Гърция', lon: 23.9, lat: 41.05, kind: 'country' },
  { t: 'Турция', lon: 27.05, lat: 41.45, kind: 'country' }
  // Примерна табелка на град: { t: 'София', lon: 23.32, lat: 42.70, kind: 'city' },
];
