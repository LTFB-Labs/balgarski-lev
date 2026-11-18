// @ts-check
// Български Лев inside LevAcademy: the shell loads this module in its sandboxed frame and calls mount().
// The game stays the same: its page (index.html) is put into the frame with a <base> at the game's folder, the
// album and the layers (window.LEV_STORAGE) are kept by the shell for this child instead of the browser, and the
// first found place and every full category give a badge in the child's profile. Opened alone (index.html) the
// game does not use this file.
import { defineApp } from '../core/academy-core/app.js';

const base = new URL('.', import.meta.url);
const ALBUM = 'opoznai-bg-found';

/** A classic script, in order. @param {{ src?: string, text?: string }} what */
function addScript({ src, text }) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    if (text !== undefined) { script.textContent = text; document.body.append(script); resolve(undefined); return; }
    Object.assign(script, { src: new URL(/** @type {string} */ (src), base).href, async: false });
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${src} не се зареди`));
    document.body.append(script);
  });
}

/** places.js declares `const PLACES` and `const CATS`: global, but not on window. @returns {any} */
// @ts-ignore: defined by places.js
const places = () => (typeof PLACES === 'undefined' ? [] : PLACES);
// @ts-ignore: defined by places.js
const cats = () => (typeof CATS === 'undefined' ? {} : CATS);

/** @param {string | null} json */
const parse = (json) => { try { return JSON.parse(json || '{}') || {}; } catch { return {}; } };

export default defineApp({
  id: 'balgarski-lev',
  name: 'Български Лев',
  description: 'Обърни карта и намери мястото на картата на България.',
  icon: '/avatars/03.webp',
  route: 'balgarski-lev',
  contract: 2,
  permissions: ['user', 'storage', 'badges'],

  async mount(el, core) {
    const w = /** @type {any} */ (window);

    // The game's page: styles from its <head>, the markup from its <body>; its scripts run below, in order.
    const page = new DOMParser().parseFromString(await (await fetch(new URL('index.html', base))).text(), 'text/html');
    document.head.prepend(Object.assign(document.createElement('base'), { href: base.href }));
    for (const node of page.head.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style')) document.head.append(node);
    document.documentElement.lang = 'bg';
    document.title = page.title;
    const scripts = [...page.body.querySelectorAll('script')].map((s) => (s.src ? { src: s.getAttribute('src') || '' } : { text: s.textContent || '' }));
    page.body.querySelectorAll('script').forEach((script) => script.remove());
    el.replaceWith(...page.body.childNodes);

    // The album and the layers: read from the shell once, then kept in memory; every change goes to the shell too.
    const user = await core.getUser();
    const memory = new Map((await core.appData.all('progress')).map((row) => /** @type {any} */ (row)).map((row) => [row.id, row.value]));
    w.LEV_STORAGE = {
      /** @param {string} key */
      getItem: (key) => memory.get(key) ?? null,
      /** @param {string} key @param {string} value */
      setItem(key, value) {
        const before = parse(memory.get(key) ?? null);
        memory.set(key, value);
        core.appData.put('progress', { id: key, value }).catch((error) => console.warn('Напредъкът не се записа:', error));
        if (key === ALBUM && user && 'badges' in user) giveBadges(before, parse(value));
      },
    };

    /** @param {string} code @param {string} name @param {string} icon @param {string} reason */
    const grant = (code, name, icon, reason) => core.grantUserBadge({ code, name, icon, reason, description: 'Български Лев' })
      .catch((error) => console.warn('Значката не се даде:', error));

    /** The first found place and every full category give badges. @param {any} before @param {any} after */
    function giveBadges(before, after) {
      if (!Object.keys(before).length && Object.keys(after).length) grant('first-place', 'Първо място', 'core:medal-bronze', 'Намери първото си място на картата');
      for (const [cat, { label }] of Object.entries(cats())) {
        const all = places().filter((/** @type {any} */ p) => p.cat === cat);
        const full = (/** @type {any} */ album) => all.length > 0 && all.every((/** @type {any} */ p) => album[p.id]);
        if (!full(before) && full(after)) grant(`all-${cat}`, `Всички: ${label}`, 'core:trophy', `Намери всички места от „${label}“`);
      }
    }

    for (const script of scripts) await addScript(script);
  },
});
