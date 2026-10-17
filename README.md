# Български Лев

Детска игра за география на България. Обръщаш карта от ветрилото, разглеждаш снимките и фактите и намираш мястото на приказната карта. Колкото по-близо, толкова повече точки (3, 2 или 1). Намерените места се събират в албум.

**Играй:** https://aleksandrenko.github.io/balgarski-lev/
**Идеи и проучване:** https://aleksandrenko.github.io/balgarski-lev/ideas.html

## Какво има вътре

- `index.html` — играта
- `ideas.html` — проучване, идеи и визуални посоки
- `map.js` — рисува картата на canvas (релеф, гори, планини, реки, морета)
- `geo.js` — граници, реки и езера
- `places.js` — 26 места: вид, ниво, описание и факти
- `labels.js` — табелките върху картата (региони, морета, съседи); добави ред, за да сложиш табелка на град или друго място
- `photos.js`, `photos/` — снимките и кой ги е направил
- `intro.svg`, `lion.json` — началната илюстрация и анимацията на лъва (Lottie)

Не е нужна компилация: всичко е обикновен HTML, CSS и JavaScript.

## Данни

- Граници на България и областите: [geoBoundaries](https://www.geoboundaries.org) (CC BY 4.0)
- Съседни държави, реки и езера: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Снимки: Wikimedia Commons, вижте [CREDITS.md](CREDITS.md)
- Шрифтове: Google Fonts (Nunito, Caveat, Kurale, Cormorant)
- Анимация: [lottie-web](https://github.com/airbnb/lottie-web) от cdnjs
