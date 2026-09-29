/* Состояние подбора переживает перезагрузку: язык, вид (3D/этажи/2D), этаж, фильтры,
   избранное и факт «cookie-баннер принят» - в cookie (SameSite=Lax, 180 дней) с зеркалом
   в localStorage. Файл подключён раньше util.js/app.js (см. select.html), поэтому к их
   выполнению window.STATE уже готов. */
(function () {
  const DAYS = 180;
  const KEYS = {
    lang: 'ap.lang',  // тот же ключ, что уже пишет util.js (U.setLang/U.lang) — здесь только зеркалим в cookie
    fav: 'ap.favs',      // тот же ключ, что уже пишет util.js (U.fav) — зеркалим в cookie
    view: 'ap.state.view',
    floor: 'ap.state.floor',
    filters: 'ap.state.filters',
    consent: 'ap.cookieConsent'
  };

  function setCookie(name, value) {
    try {
      const d = new Date(); d.setTime(d.getTime() + DAYS * 24 * 60 * 60 * 1000);
      document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
    } catch (e) {}
  }
  function getCookie(name) {
    try {
      const esc = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
      const m = document.cookie.match(new RegExp('(?:^|; )' + esc + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* localStorage - источник истины, когда он доступен и непуст; cookie - резерв. Обе стороны
     синхронятся при записи (set), при чтении берём ту, что есть. */
  function get(key) {
    const ls = lsGet(KEYS[key]);
    if (ls != null) return ls;
    const ck = getCookie(KEYS[key]);
    if (ck != null) lsSet(KEYS[key], ck); // нашли только в cookie (напр. localStorage чистили) — подтягиваем зеркало обратно
    return ck;
  }
  function set(key, value) {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    lsSet(KEYS[key], v);
    setCookie(KEYS[key], v);
  }
  function getJSON(key, fallback) {
    const raw = get(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  // Язык и избранное уже пишутся в localStorage самим util.js (U.setLang/U.fav.toggle/.clear) -
  // здесь только зеркалим их значение в cookie; app.js зовёт mirrorLang()/mirrorFav() из своих
  // обработчиков смены языка/избранного (см. onLang-листенер и toggleFav в app.js).
  function mirrorLang() { const v = lsGet(KEYS.lang); if (v != null) setCookie(KEYS.lang, v); }
  function mirrorFav() { const v = lsGet(KEYS.fav); if (v != null) setCookie(KEYS.fav, v); }

  // На загрузке: если localStorage пуст (первый визит в этом браузере, но cookie есть, напр.
  // после чистки localStorage), подтягиваем lang/fav из cookie обратно в localStorage, чтобы
  // U.lang/U.fav.* сразу увидели восстановленное значение при своей инициализации.
  if (lsGet(KEYS.lang) == null) { const c = getCookie(KEYS.lang); if (c != null) lsSet(KEYS.lang, c); }
  if (lsGet(KEYS.fav) == null) { const c = getCookie(KEYS.fav); if (c != null) lsSet(KEYS.fav, c); }

  window.STATE = {
    restore() {
      return { view: get('view') || null, floor: getJSON('floor', null), filters: getJSON('filters', null) };
    },
    saveView(v) { set('view', v); },
    saveFloor(f) { if (f != null) set('floor', f); },
    saveFilters(f) { set('filters', f); },
    consentGiven() { return get('consent') === '1'; },
    giveConsent() { set('consent', '1'); },
    mirrorLang,
    mirrorFav
  };
})();
