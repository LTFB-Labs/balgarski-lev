# Български Лев

Детска игра за география на България. Обръщаш карта от ветрилото, разглеждаш снимките и фактите и намираш мястото на картата. Колкото по-близо, толкова повече точки (3, 2 или 1). В играта има 106 места: градове, природа, история и култура. Намерените места се събират в албум.

**Играй:** https://ltfb-labs.github.io/balgarski-lev/
**Идеи и проучване:** https://ltfb-labs.github.io/balgarski-lev/ideas.html

## Какво има вътре

- `index.html` — играта
- `ideas.html` — проучване, идеи и визуални посоки
- `real-map.js` — картата: граници, области, бряг, реки и езера в истинска проекция (вярна по мащаб на 42,7° с.ш.); генерира се от `tools/`
- `img/real-heights.webp`, `img/real-relief.webp`, `img/real-forest.webp`, `img/real-depth.webp` — слоевете: височинни цветове, сенки на релефа, гори и дълбоко море
- `map.js`, `geo.js` — старата проекция и граници; ползват ги `ideas.html` и помощните функции на играта
- `places.js` — 106 места: вид, ниво, описание и факти
- `photos.js`, `photos/` — снимките и кой ги е направил

Картата е точна: местата стоят на истинските си координати. Влачи я (накланя се като лист хартия), приближавай с колелцето или с два пръста.

Играта не се компилира: всичко е обикновен HTML, CSS и JavaScript. Картата се генерира веднъж:

```sh
cd tools && npm install && ./fetch-data.sh && npm run real-map && npm run relief && npm run forest
```

## Данни

- Граници на България, областите, брегът, реките, езерата и язовирите: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL; `real-map.js` е производна база данни под същия лиценз)
- Гори: © ESA WorldCover 2021 (CC BY 4.0), класът „дървесна покривка“
- Почви: Harmonized World Soil Database v2.0 (FAO & IIASA 2023, CC BY-NC-SA 3.0 IGO), типовете по „Атлас на почвите в България“ (1998)
- Градове: Wikidata (CC0); пътища: OpenStreetMap (ODbL)
- Забележителности: 100-те национални туристически обекта (БТС, по bg Уикипедия) и други известни места, координати от Wikidata (CC0)
- Полезни изкопаеми: OpenStreetMap (ODbL), Wikidata, USGS Minerals Yearbook Bulgaria 2019
- Животни: докладите на България по чл. 17 от Директивата за местообитанията (EEA, CC BY 4.0) и наблюдения от GBIF (CC BY)
- Съседни държави, реки и езера далеч от България: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Релеф: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, AWS Open Data; източници: SRTM, GMTED, ETOPO1 и др.)
- Снимки: Wikimedia Commons, вижте [CREDITS.md](CREDITS.md)
- Шрифтове: Google Fonts (Nunito, Caveat, Kurale, Cormorant)
