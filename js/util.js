/* Общие утилиты лендинга и приложения: язык, числа, избранное, иконки. */
(function () {
  const LS_LANG = 'ap.lang';
  const LS_FAV = 'ap.favs';
  const GEL_RATE = 2.7;
  const LOCALE = 'uk-UA'; // --num-locale: один на лендинг и приложение

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  let lang = safeGet(LS_LANG) || 'ru';
  const listeners = [];

  const U = {
    GEL_RATE,
    get lang() { return lang; },
    setLang(l) { lang = l; safeSet(LS_LANG, l); document.documentElement.lang = l; listeners.forEach(f => f(l)); },
    onLang(f) { listeners.push(f); },
    t(key, vars) {
      const d = window.I18N[lang] || window.I18N.ru;
      let s = d[key] != null ? d[key] : (window.I18N.ru[key] != null ? window.I18N.ru[key] : key);
      if (vars) Object.keys(vars).forEach(k => { s = s.replace('{' + k + '}', vars[k]); });
      return s;
    },
    /* Intl.NumberFormat по локали проекта: тысячи — NBSP, десятичный — запятая (R-TYPE-16). */
    num(n, min, max) {
      const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min || 0, maximumFractionDigits: max == null ? (min || 0) : max });
      return nf.format(n).replace(/\s/g, ' ');
    },
    area(n, list) { return U.num(n, list ? 2 : 0, list ? 2 : 1) + ' ' + (lang === 'en' ? 'm²' : 'м²'); },
    price(n) { return U.num(Math.round(n)); },
    gel(usd) { return Math.round(usd * GEL_RATE / 10) * 10; },
    /* Лендинг: символ валюты перед числом, разряды по локали («От $33 300») */
    priceLanding(n) { return U.t('land.price.from') + '$' + U.num(Math.round(n)); },
    /* Избранное — localStorage по ключу комплекса, без авторизации (R-UX-32) */
    fav: {
      list() { try { return JSON.parse(safeGet(LS_FAV) || '[]'); } catch (e) { return []; } },
      has(id) { return U.fav.list().includes(id); },
      toggle(id) {
        const l = U.fav.list(); const i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1); else l.push(id);
        safeSet(LS_FAV, JSON.stringify(l)); return i < 0;
      },
      clear() { safeSet(LS_FAV, '[]'); },
      count() { return U.fav.list().length; }
    },
    el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(k => {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      });
      (children || []).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      return e;
    },
    debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; },
    toast(msg) {
      let t = document.querySelector('.toast');
      if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add('is-on');
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), 2000);
    }
  };

  /* Реестр иконок (глава 09, §9.2): контур 24/1.4 currentColor; MI — залитые в фиксированных позициях. */
  const O = (d, extra) => `<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${d}</svg>`;
  const F = (d, size) => `<svg class="icon icon-fill" width="${size || 24}" height="${size || 24}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  U.icons = {
    close: O('<path d="M18 6L6 18"/><path d="M6 6L18 18"/>'),
    closeMI: F('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', 21),
    burger: O('<path d="M4 6H20"/><path d="M4 12H20"/><path d="M4 18H20"/>'),
    chevronLeft: O('<path d="M14 6L8 12L14 18"/>'),
    handle: O('<path d="M13 6L7 12L13 18"/>', ' stroke-width="2"'),
    heart: O('<path d="M12 20.5C12 20.5 3.5 15.4 3.5 9.3C3.5 6.9 5.3 5 7.7 5C9.4 5 10.9 5.9 12 7.3C13.1 5.9 14.6 5 16.3 5C18.7 5 20.5 6.9 20.5 9.3C20.5 15.4 12 20.5 12 20.5Z"/>'),
    heartBorderMI: F('M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z', 20),
    heartFillMI: F('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', 20),
    heartFill24: F('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', 24),
    eyeMI: F('M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z', 20),
    tune: F('M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z', 21),
    phone: F('M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z', 20),
    arrowBack: F('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'),
    arrowForward: F('M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z'),
    caret: F('M7 10l5 5 5-5z', 16),
    caretUp: F('M7 14l5-5 5 5z', 21),
    caretDown: F('M7 10l5 5 5-5z', 21),
    kbdLeft: F('M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z'),
    expandMore: F('M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'),
    view3d: O('<ellipse cx="12" cy="14.5" rx="9" ry="4"/><path d="M21 14.5L19 12.5M21 14.5L19 16.5"/><text x="12" y="10.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">360</text>'),
    layers: O('<path d="M12 3L21 8L12 13L3 8Z"/><path d="M3 12L12 17L21 12"/><path d="M3 16L12 21L21 16"/>'),
    grid: O('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    fullscreen: O('<path d="M4 9V5C4 4.45 4.45 4 5 4H9"/><path d="M15 4H19C19.55 4 20 4.45 20 5V9"/><path d="M20 15V19C20 19.55 19.55 20 19 20H15"/><path d="M9 20H5C4.45 20 4 19.55 4 19V15"/>'),
    zoomOut: O('<circle cx="11" cy="11" r="7"/><path d="M21 21L16 16"/><path d="M8 11H14"/>', ' stroke-width="2"'),
    zoomIn: O('<circle cx="11" cy="11" r="7"/><path d="M21 21L16 16"/><path d="M8 11H14"/><path d="M11 8V14"/>', ' stroke-width="2"'),
    pdf: `<svg class="icon icon-action" width="13" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 1H8.5L12 4.5V12.5C12 13 11.6 13.4 11 13.4H3C2.4 13.4 2 13 2 12.5V2C2 1.4 2.4 1 3 1Z"/><path d="M8.5 1V4.5H12"/><path d="M5 8H9"/><path d="M5 10.5H9"/></svg>`,
    link: `<svg class="icon icon-action" width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8.5C6.9 9.7 8.6 9.9 9.7 8.9L11.9 6.9C13 5.9 13 4.2 12 3.2C11 2.2 9.3 2.1 8.3 3.1L7.2 4.1"/><path d="M9 5.5C8.1 4.3 6.4 4.1 5.3 5.1L3.1 7.1C2 8.1 2 9.8 3 10.8C4 11.8 5.7 11.9 6.7 10.9L7.8 9.9"/></svg>`,
    heartSm: `<svg class="icon icon-action" width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 12.5C7.5 12.5 1.5 9 1.5 4.9C1.5 3.3 2.7 2 4.3 2C5.6 2 6.7 2.7 7.5 3.8C8.3 2.7 9.4 2 10.7 2C12.3 2 13.5 3.3 13.5 4.9C13.5 9 7.5 12.5 7.5 12.5Z"/></svg>`,
    heartSmFill: `<svg class="icon icon-action" width="15" height="14" viewBox="0 0 15 14" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 12.5C7.5 12.5 1.5 9 1.5 4.9C1.5 3.3 2.7 2 4.3 2C5.6 2 6.7 2.7 7.5 3.8C8.3 2.7 9.4 2 10.7 2C12.3 2 13.5 3.3 13.5 4.9C13.5 9 7.5 12.5 7.5 12.5Z"/></svg>`,
    statusGrid: `<svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true"><rect x="1" y="2" width="9" height="9" rx="2" fill="var(--status-available)"/><rect x="12" y="2" width="9" height="9" rx="2" fill="var(--status-reserved)"/><rect x="1" y="13" width="9" height="9" rx="2" fill="var(--status-sold)"/><rect x="12" y="13" width="9" height="9" rx="2" fill="var(--status-available)"/></svg>`,
    floorAttr: O('<path d="M4 20H9V15H14V10H19V5"/><path d="M4 20V16"/>'),
    areaAttr: O('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12L12 4"/><path d="M4 20L20 4"/><path d="M12 20L20 12"/>'),
    roomsAttr: O('<path d="M6 20V4H16V20"/><path d="M16 20H18"/><path d="M6 20H4"/><circle cx="13.5" cy="12" r=".8" fill="currentColor"/>'),
    viewAttr: O('<path d="M3 15C6 12 9 12 12 15C15 18 18 18 21 15"/><path d="M3 10C6 7 9 7 12 10C15 13 18 13 21 10"/>'),
    check: O('<path d="M5 12L10 17L19 7"/>'),
    mail: O('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7L12 13L21 7"/>'),
    pin: O('<path d="M12 21C12 21 5 14.5 5 9.5C5 5.9 8.1 3 12 3C15.9 3 19 5.9 19 9.5C19 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    phoneOutline: O('<path d="M6.5 3.5H9.5L11 7.5L9 9C10 11.5 12.5 14 15 15L16.5 13L20.5 14.5V17.5C20.5 18.6 19.6 19.5 18.5 19.5C10.8 19.5 4.5 13.2 4.5 5.5C4.5 4.4 5.4 3.5 6.5 3.5Z"/>'),
    chat: O('<path d="M4 5H20V16H9L5 19.5V16H4Z"/>'),
    compass(size) {
      const s = size || 75;
      return `<svg class="compass-svg" width="${s}" height="${s}" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="40" cy="40" r="36"/><circle cx="40" cy="40" r="2" fill="currentColor"/><path d="M40 4V10"/><path d="M40 22L44 36L40 32L36 36Z" fill="currentColor" stroke="none"/><path d="M40 58L36 44L40 48L44 44Z"/><text x="40" y="20" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="currentColor" stroke="none">N</text><text x="70" y="43" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="currentColor" stroke="none">E</text><text x="40" y="74" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="currentColor" stroke="none">S</text><text x="10" y="43" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="currentColor" stroke="none">W</text></svg>`;
    }
  };
  window.U = U;
  document.documentElement.lang = lang;
})();
