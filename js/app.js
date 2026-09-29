/* Приложение подбора квартир: рельс + сцена (3D-спиннер / планы этажей / шахматка), страница объекта,
   избранное, RU/EN, hash-роутинг, синхронная подсветка одной current_entity во всех видах (R-UX-21). */
(function () {
  const D = window.DATA, UNITS = D.units.slice().sort((a, b) => a.floor - b.floor || a.slot - b.slot);
  const byId = {}; UNITS.forEach(u => { byId[u.id] = u; });
  const q = s => document.querySelector(s), qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = U.el, t = k => U.t(k);
  const FLOORS = Array.from(new Set(UNITS.map(u => u.floor))).sort((a, b) => a - b);
  const SLOTS = 12;
  const PAGE = 10;
  const isMobile = () => window.matchMedia('(max-width: 959px)').matches;

  /* --- кадры спиннера: 3 рендера; полигоны — только на фасадном кадре 0 --- */
  const FRAMES = [
    { src: 'assets/img/facade.webp', w: 1226, h: 1502, anchor: 'bottom', polys: true },
    { src: 'assets/img/tower-day.webp', w: 1600, h: 893, anchor: 'center', polys: false },
    { src: 'assets/img/tower-dusk.webp', w: 1600, h: 893, anchor: 'center', polys: false }
  ];
  // Ленивая загрузка: JPG кадра запрашивается только когда реально нужен (3D-вид активен),
  // первый кадр — сразу при входе в 3D, остальные два — фоном следом. На #/floors или #/
  // (2D) ни один из трёх файлов не должен уйти в сеть вообще.
  function ensureFrame(i) {
    const f = FRAMES[i]; if (!f || f.img) return;
    const img = new Image();
    img.onload = () => { if (state.view === '3d' && state.frame === i) drawScene(); drawPreview(); drawGallery(); };
    img.src = f.src; f.img = img;
  }
  function preloadFrames() { ensureFrame(state.frame); FRAMES.forEach((f, i) => { if (i !== state.frame) setTimeout(() => ensureFrame(i), 300); }); }
  const POLYS = PLANS.facadePolygons(UNITS);

  const minmax = k => [Math.min.apply(null, UNITS.map(u => u[k])), Math.max.apply(null, UNITS.map(u => u[k]))];
  const RANGES = { area: minmax('total'), floor: minmax('floor'), price: minmax('price'), living: minmax('living') };

  // восстановленное состояние (cookie/localStorage, см. js/state.js) - до первого рендера.
  // Вид восстанавливаем только 3d/2d: «floors» так и так несёт хэш #/floors, который браузер
  // сохраняет сам (route() ниже это уважает); этаж - если такой ещё существует на этом доме.
  const RESTORED = (window.STATE && window.STATE.restore()) || {};
  // Режим сцены: «floors» — полноценный маршрут (#/floors), он и восстанавливается между
  // визитами. «2d» — эфемерный переключатель сегмента без собственного #-маршрута (тот же «#/», что и
  // 3D) — не персистится и не восстанавливается, иначе один клик по 2D навсегда подменял бы
  // дефолтный «#/» шахматкой вместо ожидаемого 3D/floors (см. goView()).
  const state = {
    view: RESTORED.view === 'floors' ? 'floors' : '3d', frame: 0, floor: FLOORS.includes(RESTORED.floor) ? RESTORED.floor : FLOORS[0], hover: null, selected: null, shown: PAGE, showAll: false,
    filters: Object.assign({ area: null, floor: null, rooms: null, type: null, status: null, number: null, view: null, price: null, living: null }, RESTORED.filters || {}),
    extraOpen: false, chessSize: 1, favMode: false, unitTab: 'layouts', unitId: null, chessView: 'simple', sheet: null
  };

  /* ---------- фильтрация ---------- */
  // Тип, Статус, Номер, Вид из окна (2×2). «Стоимость, USD» и «Жилая площадь» убраны из UI
  // (hidden: true) — логика фильтрации по ним остаётся рабочей (matches()/activeCount() их
  // по-прежнему видят), просто без поля ввода; не удаляем на случай возврата к ним.
  const NUMBERS = Array.from(new Set(UNITS.map(u => u.number))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const FILTER_DEFS = [
    { key: 'price', kind: 'range', label: 'app.filter.price', field: 'price', step: 1000, dec: 0 },
    { key: 'rooms', kind: 'list', label: 'app.filter.rooms', field: 'type', options: ['studio', '1br', '2br', '3br'], opt: v => t('app.rooms.' + v) },
    { key: 'area', kind: 'range', label: 'app.filter.area', field: 'total', step: .1, dec: 1 },
    { key: 'floor', kind: 'range', label: 'app.filter.floor', field: 'floor', step: 1, dec: 0 },
    { key: 'type', kind: 'list', label: 'app.filter.type', field: 'type', options: ['studio', '1br', '2br', '3br'], opt: v => t('app.rooms.' + v), extra: true },
    { key: 'status', kind: 'list', label: 'app.filter.status', field: 'status', options: ['available', 'reserved', 'sold'], opt: v => t('app.status.' + v), extra: true },
    { key: 'number', kind: 'list', label: 'app.filter.number', field: 'number', options: NUMBERS, opt: v => v, extra: true, searchable: true },
    { key: 'view', kind: 'list', label: 'app.filter.view', field: 'view', options: ['sea', 'city', 'park'], opt: v => t('app.view.' + v), extra: true },
    { key: 'living', kind: 'range', label: 'app.filter.living', field: 'living', step: .1, dec: 1, extra: true, hidden: true }
  ];
  function matches(u) {
    const f = state.filters;
    for (const d of FILTER_DEFS) {
      const v = f[d.key]; if (!v) continue;
      if (d.kind === 'range') { if (u[d.field] < v[0] - 1e-9 || u[d.field] > v[1] + 1e-9) return false; }
      else if (v.length && !v.includes(u[d.field])) return false;
    }
    return true;
  }
  const filtered = () => UNITS.filter(matches);
  const activeCount = extraOnly => FILTER_DEFS.filter(d => (!extraOnly || d.extra) && state.filters[d.key] && (state.filters[d.key].length !== 0)).length;
  const anyFilter = () => activeCount(false) > 0;

  /* ---------- range-слайдер (двуручечный, кастомный) ---------- */
  function makeRange(min, max, step, value, onInput) {
    const dec = String(step).includes('.') ? 1 : 0;
    const root = el('div', { class: 'range' });
    const rail = el('div', { class: 'range__rail' }), track = el('div', { class: 'range__track' });
    const th = [0, 1].map(() => el('div', { class: 'range__thumb', role: 'slider', tabindex: '0' }, [el('i'), el('i'), el('i')]));
    root.append(rail, track, th[0], th[1]);
    let val = value ? value.slice() : [min, max];
    const pct = v => (max === min ? 0 : (v - min) / (max - min) * 100);
    function paint() { th[0].style.left = pct(val[0]) + '%'; th[1].style.left = pct(val[1]) + '%'; track.style.left = pct(val[0]) + '%'; track.style.width = (pct(val[1]) - pct(val[0])) + '%'; }
    function clamp(i, v) { v = Math.round(v / step) * step; v = Math.max(min, Math.min(max, v)); if (i === 0) v = Math.min(v, val[1]); else v = Math.max(v, val[0]); val[i] = +v.toFixed(dec); paint(); }
    th.forEach((h, i) => {
      h.addEventListener('pointerdown', e => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('is-drag');
        const r = root.getBoundingClientRect();
        const move = ev => { const p = (ev.clientX - r.left) / r.width; clamp(i, min + p * (max - min)); onInput(val); };
        const up = () => { h.classList.remove('is-drag'); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
      });
      h.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { clamp(i, val[i] - step); onInput(val); } if (e.key === 'ArrowRight') { clamp(i, val[i] + step); onInput(val); } });
    });
    paint();
    return { el: root, get: () => val.slice(), set: v => { val = v.slice(); paint(); } };
  }
  function rangePanel(def, applyMode) {
    const [min, max] = RANGES[def.key];
    const cur = state.filters[def.key] || [min, max];
    const wrap = el('div');
    const inFrom = el('input', { type: 'number', inputmode: 'decimal', step: def.step, min, max, value: cur[0] });
    const inTo = el('input', { type: 'number', inputmode: 'decimal', step: def.step, min, max, value: cur[1] });
    const sl = makeRange(min, max, def.step, cur, v => { inFrom.value = v[0]; inTo.value = v[1]; if (!applyMode) commit(); });
    function commit() { const v = sl.get(); state.filters[def.key] = (v[0] <= min && v[1] >= max) ? null : v; onFiltersChange(); }
    const sync = () => { const a = parseFloat(String(inFrom.value).replace(',', '.')), b = parseFloat(String(inTo.value).replace(',', '.')); sl.set([isNaN(a) ? min : Math.max(min, Math.min(a, max)), isNaN(b) ? max : Math.max(min, Math.min(b, max))]); if (!applyMode) commit(); };
    inFrom.addEventListener('change', sync); inTo.addEventListener('change', sync);
    wrap.append(sl.el, el('div', { class: 'range__inputs' }, [el('label', null, [t('app.range.from'), inFrom]), el('label', null, [t('app.range.to'), inTo])]));
    if (applyMode) {
      wrap.appendChild(el('div', { class: 'popover__btns' }, [
        el('button', { class: 'btn-text', type: 'button', text: t('app.range.clear'), onclick: () => { sl.set([min, max]); inFrom.value = min; inTo.value = max; state.filters[def.key] = null; onFiltersChange(); } }),
        el('button', { class: 'btn-apply', type: 'button', text: t('app.range.apply'), onclick: () => { sync(); commit(); closeFields(); } })
      ]));
    }
    return wrap;
  }

  /* ---------- поля фильтров (рельс) ---------- */
  function closeFields() { qa('.field.is-open').forEach(f => f.classList.remove('is-open')); }
  document.addEventListener('click', e => { if (!e.target.closest('.field')) closeFields(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFields(); closePopover(); closeModal(); closeSheet(); } });

  function fieldEl(def) {
    const [min, max] = RANGES[def.key] || [];
    const f = el('div', { class: 'field' });
    const v = state.filters[def.key];
    const filled = v && v.length !== 0;
    if (filled) f.classList.add('is-filled');
    let label = t(def.label);
    if (filled) label = def.kind === 'range' ? `${U.num(v[0], def.dec, def.dec)} – ${U.num(v[1], def.dec, def.dec)}` : v.map(def.opt).join(', ');
    const btn = el('button', { class: 'field__btn', type: 'button' }, [el('span', { class: 'val', text: label })]);
    btn.insertAdjacentHTML('beforeend', `<span class="caret">${U.icons.caret}</span>`);
    const clr = el('span', { class: 'clear', html: U.icons.close, onclick: e => { e.stopPropagation(); state.filters[def.key] = null; onFiltersChange(); } });
    btn.appendChild(clr);
    btn.addEventListener('click', () => { const open = f.classList.contains('is-open'); closeFields(); if (!open) f.classList.add('is-open'); });
    f.appendChild(btn);
    if (def.kind === 'range') {
      const pop = el('div', { class: 'popover' }, [el('div', { class: 'popover__title', text: t(def.label) })]);
      pop.appendChild(rangePanel(def, true)); f.appendChild(pop);
    } else {
      const menu = el('div', { class: 'menu menu--check' });
      if (def.searchable) {
        const search = el('div', { class: 'menu__search' }, [el('input', { type: 'text', class: 'menu__search-inp', placeholder: t(def.label) })]);
        const inp = search.querySelector('input');
        inp.addEventListener('click', e => e.stopPropagation());
        inp.addEventListener('input', () => {
          const query = inp.value.trim().toLowerCase();
          qa('.menu__item', menu).forEach(it => { it.hidden = !!query && !it.textContent.toLowerCase().includes(query); });
        });
        menu.appendChild(search);
      }
      const allSel = !!v && v.length === def.options.length;
      if (!def.searchable) menu.appendChild(el('button', { class: 'menu__all', type: 'button', onclick: () => {
        state.filters[def.key] = allSel ? null : def.options.slice(); onFiltersChange();
      } }, [el('span', { class: 'menu__box' + (allSel ? ' is-on' : ''), html: allSel ? U.icons.check : '' }), el('span', { text: t('app.filter.selectAll') })]));
      def.options.forEach(o => {
        const sel = !!v && v.includes(o);
        menu.appendChild(el('button', { class: 'menu__item' + (sel ? ' is-selected' : ''), type: 'button', onclick: () => {
          const cur = (state.filters[def.key] || []).slice(); const i = cur.indexOf(o); if (i >= 0) cur.splice(i, 1); else cur.push(o);
          state.filters[def.key] = cur.length ? cur : null; onFiltersChange();
        } }, [el('span', { class: 'menu__box' + (sel ? ' is-on' : ''), html: sel ? U.icons.check : '' }), el('span', { text: def.opt(o) })]));
      });
      f.appendChild(menu);
    }
    return f;
  }
  function renderFilters() {
    const box = q('#filters'); const open = qa('.field.is-open', box).map(f => f.getAttribute('data-key'));
    box.innerHTML = '';
    const base = FILTER_DEFS.filter(d => !d.extra), extra = FILTER_DEFS.filter(d => d.extra && !d.hidden);
    base.forEach(d => { const f = fieldEl(d); f.setAttribute('data-key', d.key); box.appendChild(f); });
    const n = activeCount(true);
    const more = el('button', { class: 'btn-more' + (state.extraOpen ? ' is-open' : ''), type: 'button', html: U.icons.tune + `<span>${t(state.extraOpen ? 'app.filter.less' : 'app.filter.more')} (${n})</span>`, onclick: () => { state.extraOpen = !state.extraOpen; renderFilters(); } });
    box.appendChild(more);
    if (state.extraOpen) extra.forEach(d => { const f = fieldEl(d); f.setAttribute('data-key', d.key); box.appendChild(f); });
    open.forEach(k => { const f = box.querySelector(`.field[data-key="${k}"]`); if (f) f.classList.add('is-open'); });
  }
  function onFiltersChange() {
    state.shown = PAGE;
    if (window.STATE) window.STATE.saveFilters(state.filters);
    renderFilters(); renderCounter(); renderCards(); applyFilterClasses(); renderTabbar(); renderSheetFoot();
    if (state.view === 'floors') renderFloorPlan();
  }
  function resetFilters() { Object.keys(state.filters).forEach(k => { state.filters[k] = null; }); onFiltersChange(); }

  /* ---------- счётчик и карточки ---------- */
  // Строка «Показано N из M» только на mobile (сам #counter скрыт на
  // десктопе через CSS), пустая корзина «ничего не найдено» + сброс фильтров остаётся всегда.
  function renderCounter() {
    const c = q('#counter'); const total = filtered().length;
    if (!total) { c.innerHTML = ''; c.append(el('span', { text: t('app.nothing') }), el('button', { class: 'btn-text', type: 'button', text: t('app.resetFilters'), onclick: resetFilters })); return; }
    if (!isMobile()) { c.innerHTML = ''; return; }
    c.innerHTML = `${t('app.counter.shown')} <b>${Math.min(state.shown, total)}</b> ${t('app.counter.of')} ${U.num(total)}`;
  }
  function badgeRow(u) {
    const b = el('div', { class: 'badges' }, [el('span', { class: 'badge badge--type', text: t('app.rooms.' + u.type) }), el('span', { class: 'badge badge--id', text: '# ' + u.number })]);
    if (u.status !== 'available') b.appendChild(el('span', { class: 'badge badge--' + u.status, text: t('app.status.' + u.status) }));
    return b;
  }
  function metaRow(u) {
    return el('div', { class: 'card__meta' }, [
      el('span', { class: 'meta', html: U.icons.floorAttr + `<span>${u.floor} ${t('app.floorShort')}</span>` }),
      el('span', { class: 'meta', html: U.icons.areaAttr + `<span>${U.area(u.total, true)}</span>` })
    ]);
  }

  const CAP_TYPE = { ru: { studio: 'Студия', '1br': '1-комн.', '2br': '2-комн.', '3br': '3-комн.' }, en: { studio: 'Studio', '1br': '1BR', '2br': '2BR', '3br': '3BR' } };
  function planImg(u, extraClass) {
    const img = el('img', { src: PLANS.unitPlanUri(u), alt: '' });
    const wrap = el('div', { class: 'plan-fig' + (extraClass ? ' ' + extraClass : '') }, [img]);
    return wrap;
  }
  function cardEl(u) {
    const c = el('a', { class: 'card' + (state.selected === u.id ? ' is-selected' : ''), href: '#/own/' + u.id, 'data-id': u.id });
    const img = planImg(u);
    const fav = U.fav.has(u.id);
    const acts = el('div', { class: 'card__actions' }, [
      el('button', { class: 'cact' + (fav ? ' is-active' : ''), type: 'button', 'aria-label': 'favorite', html: fav ? U.icons.heartFillMI : U.icons.heartBorderMI, onclick: e => { e.preventDefault(); e.stopPropagation(); toggleFav(u.id); } }),
      el('button', { class: 'cact', type: 'button', 'aria-label': 'show', html: U.icons.eyeMI, onclick: e => { e.preventDefault(); e.stopPropagation(); showOnScene(u.id); } })
    ]);
    c.append(el('div', { class: 'card__img' }, [img]), acts,
      el('div', { class: 'card__body' }, [badgeRow(u),
        el('div', { class: 'card__price', text: `${t('app.price.usd')}: ${U.price(u.price)}` }),
        el('div', { class: 'card__price', text: `${t('app.price.gel')}: ${U.price(U.gel(u.price))}` }),
        metaRow(u)]));
    c.addEventListener('mouseenter', () => setHover(u.id)); c.addEventListener('mouseleave', () => setHover(null));
    return c;
  }
  function renderCards() {
    const box = q('#results'); box.innerHTML = '';
    const list = filtered(); list.slice(0, state.shown).forEach(u => box.appendChild(cardEl(u)));
    const lm = q('#loadMore'); lm.textContent = t('app.loadMore'); lm.hidden = state.shown >= list.length;
  }
  q('#loadMore').addEventListener('click', () => { state.shown += PAGE; renderCards(); renderCounter(); });

  /* ---------- избранное ---------- */
  function toggleFav(id) {
    const added = U.fav.toggle(id); if (window.STATE) window.STATE.mirrorFav(); U.toast(t(added ? 'app.addedFav' : 'app.removedFav'));
    renderFavBtn(); renderCards(); renderTabbar(); if (state.favMode) renderFavList(); if (state.sheet === 'fav') renderSheet(); if (state.unitId) renderUnitActions();
  }
  function renderFavBtn() {
    const n = U.fav.count(); const b = q('#btnFav');
    b.innerHTML = (n ? U.icons.heartFill24 : U.icons.heart) + (n ? `<span class="badge-count">${n}</span>` : '');
    b.classList.toggle('is-active', n > 0);
  }
  function favListEl() {
    const wrap = el('div');
    const ids = U.fav.list();
    wrap.appendChild(el('div', { class: 'fav-head' }, [el('span', { text: `${t('app.favorites')} (${ids.length})` }), ids.length ? el('button', { class: 'btn-text', type: 'button', text: t('app.clear'), onclick: () => { U.fav.clear(); if (window.STATE) window.STATE.mirrorFav(); toggleFavRender(); } }) : null]));
    if (!ids.length) wrap.appendChild(el('div', { class: 'empty', text: t('app.fav.empty') }, [el('small', { text: t('app.fav.emptyHint') })]));
    else { const r = el('div', { class: 'results' }); ids.forEach(id => byId[id] && r.appendChild(cardEl(byId[id]))); wrap.appendChild(r); }
    return wrap;
  }
  function toggleFavRender() { renderFavBtn(); renderCards(); renderTabbar(); if (state.favMode) renderFavList(); if (state.sheet === 'fav') renderSheet(); }
  function renderFavList() { const b = q('#railFav'); b.innerHTML = ''; b.appendChild(favListEl()); }
  q('#btnFav').addEventListener('click', () => { state.favMode = !state.favMode; if (state.favMode) location.hash = '#/favorites'; else location.hash = state.view === 'floors' ? '#/floors' : '#/'; });

  /* ---------- сцена 3D ---------- */
  const canvas = q('#frameCanvas'), ctx = canvas.getContext('2d'), polysSvg = q('#polys'), scene3d = q('#scene3d');
  function coverRect(fw, fh, W, H, anchor) {
    const s = Math.max(W / fw, H / fh); const w = fw * s, h = fh * s;
    const x = (W - w) / 2, y = anchor === 'bottom' ? H - h : (H - h) / 2;
    return { x, y, w, h, s };
  }
  function drawFrame(cv, cx, fr, svg) {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cx.fillStyle = '#F4F6F9'; cx.fillRect(0, 0, W, H);
    if (fr.img && fr.img.complete && fr.img.naturalWidth) { const r = coverRect(fr.w, fr.h, W, H, fr.anchor); cx.drawImage(fr.img, r.x, r.y, r.w, r.h); }
    if (svg) { svg.setAttribute('viewBox', `0 0 ${fr.w} ${fr.h}`); svg.setAttribute('preserveAspectRatio', fr.anchor === 'bottom' ? 'xMidYMax slice' : 'xMidYMid slice'); }
  }
  function buildPolys(svg, cls) {
    svg.innerHTML = '';
    POLYS.forEach(p => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('class', 'unit' + (cls ? ' ' + cls : '')); r.setAttribute('data-id', p.id); r.setAttribute('data-status', p.u.status);
      r.setAttribute('x', p.x); r.setAttribute('y', p.y); r.setAttribute('width', p.w); r.setAttribute('height', p.h);
      svg.appendChild(r);
    });
  }
  const V2 = document.body.classList.contains('v2');
  const V3 = document.body.classList.contains('v3');
  function applyFloorSlice() {
    if (!V2) return;
    qa('.unit', polysSvg).forEach(r => r.classList.toggle('is-floor', byId[r.getAttribute('data-id')].floor === state.floor));
    const pv = q('#slicePlan'); if (!pv) return;
    const units = UNITS.filter(u => u.floor === state.floor);
    const rf = state.floor;
    const fp = PLANS.floorPlan(rf, units, { compact: true, thumb: true });
    pv.innerHTML = fp.svg + `<div class="slice__cap">${t('app.floorN')} ${rf}</div>`;
    const svg = pv.querySelector('svg'); if (svg) { svg.classList.toggle('show-all', state.showAll); qa('.unit', svg).forEach(r => r.classList.toggle('is-selected', r.getAttribute('data-id') === state.selected)); }
    if (!fp.real) PLANS.onFloorReady(rf, () => { if (state.floor === rf) applyFloorSlice(); });
  }
  function renderStepper3d() {
    const st = q('#stepper3d'); if (!st || !V2) return; st.innerHTML = '';
    const idx = FLOORS.indexOf(state.floor);
    const pick = f => { if (f == null) return; state.floor = f; closePopover(); renderStepper3d(); applyFloorSlice(); drawPreview(); };
    const up = el('button', { class: 'stepper__arrow', type: 'button', html: U.icons.caretUp, onclick: () => pick(FLOORS[idx + 1]) }); up.disabled = idx >= FLOORS.length - 1;
    const dn = el('button', { class: 'stepper__arrow', type: 'button', html: U.icons.caretDown, onclick: () => pick(FLOORS[idx - 1]) }); dn.disabled = idx <= 0;
    const list = el('div', { class: 'stepper__list' });
    FLOORS.slice().reverse().forEach(f => list.appendChild(el('button', { class: 'stepper__cell' + (f === state.floor ? ' is-active' : ''), type: 'button', text: f, onclick: () => pick(f) })));
    st.append(up, list, dn);
    const a = list.querySelector('.is-active'); if (a) a.scrollIntoView({ block: 'nearest' });
    if (V3 && a) { const sl = q('#slice'); if (sl) { const sr = scene3d.getBoundingClientRect(), ar = a.getBoundingClientRect(); sl.style.top = Math.max(32, Math.min(ar.top - sr.top + ar.height / 2 - 95, sr.height - 190 - 32)) + 'px'; } }
  }
  function drawScene() {
    const fr = FRAMES[state.frame];
    drawFrame(canvas, ctx, fr, polysSvg);
    polysSvg.style.display = fr.polys ? '' : 'none';
    scene3d.classList.toggle('no-polys', !fr.polys);
    q('#frameLabel').textContent = `${t('app.frame')} ${state.frame + 1} / ${FRAMES.length}`;
    if (!fr.polys) closePopover();
    applyFilterClasses(); applyHighlight(); applyFloorSlice();
  }
  buildPolys(polysSvg);
  polysSvg.addEventListener('mouseover', e => { const r = e.target.closest('.unit'); if (r) { setHover(r.getAttribute('data-id')); } });
  polysSvg.addEventListener('mouseout', e => { const r = e.target.closest('.unit'); if (r) setHover(null); });
  polysSvg.addEventListener('click', e => { const r = e.target.closest('.unit'); if (r) { const id = r.getAttribute('data-id'); setSelected(id); if (V2) { state.floor = byId[id].floor; renderStepper3d(); applyFloorSlice(); } openPopover(id, r, q('#upop')); } });
  q('#rotL').addEventListener('click', () => rotate(-1)); q('#rotR').addEventListener('click', () => rotate(1));
  document.addEventListener('keydown', e => { if (state.unitId || state.view !== '3d') return; if (e.key === 'ArrowLeft') rotate(-1); if (e.key === 'ArrowRight') rotate(1); });
  function rotate(d) { state.frame = (state.frame + d + FRAMES.length) % FRAMES.length; closePopover(); ensureFrame(state.frame); drawScene(); }
  q('#rotL').innerHTML = U.icons.arrowBack; q('#rotR').innerHTML = U.icons.arrowForward;
  // курсор-точка на кадрах без полигонов (R-MOTION-8)
  scene3d.addEventListener('mousemove', e => { const d = q('#cursorDot'); const r = scene3d.getBoundingClientRect(); d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px'; });
  // тумблер «показать все»
  ['#toggle', '#toggleF'].forEach(s => q(s).addEventListener('click', () => { state.showAll = !state.showAll; applyShowAll(); }));
  q('#statusGrid').innerHTML = U.icons.statusGrid; q('#statusGridF').innerHTML = U.icons.statusGrid;
  function applyShowAll() {
    q('#switch').classList.toggle('is-on', state.showAll); q('#switchF').classList.toggle('is-on', state.showAll);
    scene3d.classList.toggle('show-all', state.showAll);
    const fp = q('#planBox svg'); if (fp) fp.classList.toggle('show-all', state.showAll);
  }
  // drag по сцене — по 120px на кадр
  let dragX = null;
  scene3d.addEventListener('pointerdown', e => { if (e.target.closest('.unit, button, .upop')) return; dragX = e.clientX; });
  window.addEventListener('pointerup', e => { if (dragX == null) return; const dx = e.clientX - dragX; dragX = null; if (Math.abs(dx) > 120) rotate(dx < 0 ? 1 : -1); });

  function applyFilterClasses() {
    const active = anyFilter();
    [scene3d, q('#preview'), q('#planBox svg')].forEach(root => { if (!root) return; root.classList.toggle('is-filtered', active); qa('.unit', root).forEach(r => { const u = byId[r.getAttribute('data-id')]; r.classList.toggle('in-filter', active && matches(u)); r.classList.toggle('is-out', active && !matches(u)); }); });
    qa('.cell[data-id]').forEach(c => { c.classList.toggle('is-out', active && !matches(byId[c.getAttribute('data-id')])); });
  }

  /* ---------- поповер помещения ---------- */
  function openPopover(id, anchorEl, pop) {
    const u = byId[id]; pop.innerHTML = '';
    pop.appendChild(el('button', { class: 'upop__close', type: 'button', html: U.icons.close, onclick: closePopover }));
    pop.appendChild(el('div', { class: 'upop__img' }, [planImg(u)]));
    pop.appendChild(badgeRow(u));
    pop.appendChild(metaRow(u));
    pop.appendChild(el('div', { class: 'upop__price' }, [
      el('b', { text: '$ ' + U.price(u.price) }),
      el('span', { text: '₾ ' + U.price(U.gel(u.price)) })
    ]));
    pop.appendChild(el('div', { class: 'upop__status' }, [
      el('span', { class: 'status-sq', 'data-status': u.status }),
      el('span', { text: t('app.status.' + u.status) })
    ]));
    pop.appendChild(u.status === 'sold' ? el('span', { class: 'upop__cta is-disabled', text: t('app.sold') }) : el('a', { class: 'upop__cta', href: '#/own/' + u.id, text: t('app.detail') }));
    pop.classList.add('is-on');
    if (!isMobile()) {
      const sr = pop.parentElement.getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
      const W = 220, H = pop.offsetHeight || 310;
      let x = ar.right - sr.left + 10, y = ar.top - sr.top - H / 2 + ar.height / 2;
      if (x + W > sr.width - 32) x = ar.left - sr.left - W - 10;
      y = Math.max(32, Math.min(y, sr.height - H - 32));
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    }
    q('#capsule').classList.toggle('is-hidden', pop.id === 'upop');
  }
  function closePopover() { qa('.upop').forEach(p => p.classList.remove('is-on')); q('#capsule').classList.remove('is-hidden'); }
  document.addEventListener('click', e => { if (!e.target.closest('.upop, .unit, .cell')) closePopover(); });

  /* ---------- подсветка одной сущности во всех видах ---------- */
  function setHover(id) { state.hover = id; applyHighlight(); }
  function setSelected(id) { state.selected = id; applyHighlight(); const c = q(`.card[data-id="${id}"]`); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); }
  function applyHighlight() {
    qa('[data-id]').forEach(n => { const id = n.getAttribute('data-id'); n.classList.toggle('is-hover', id === state.hover); n.classList.toggle('is-selected', id === state.selected); });
    if (state.view === 'floors' && state.hover && byId[state.hover]) renderRose(byId[state.hover].slot); else if (state.view === 'floors') renderRose(state.selected && byId[state.selected] ? byId[state.selected].slot : null);
  }
  function showOnScene(id) {
    const u = byId[id]; setSelected(id);
    if (state.view === 'floors') { state.floor = u.floor; renderFloorPlan(); renderStepper(); return; }
    if (state.view === '2d') return;
    const visible = POLYS.some(p => p.id === id);
    state.frame = 0; drawScene();
    const r = polysSvg.querySelector(`[data-id="${id}"]`);
    if (r) { r.classList.add('is-flash'); setTimeout(() => r.classList.remove('is-flash'), 2000); }
    if (!visible) U.toast(t('app.cursorHint'));
  }

  /* ---------- превью спиннера в рельсе ---------- */
  const prev = q('#preview'); let prevCanvas, prevSvg, prevCap;
  function buildPreview() {
    prev.innerHTML = ''; prevCanvas = el('canvas'); prevSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); prevCap = el('div', { class: 'preview__cap' });
    prev.append(prevCanvas, prevSvg, prevCap); buildPolys(prevSvg);
    prevSvg.addEventListener('mouseover', e => { const r = e.target.closest('.unit'); if (r) setHover(r.getAttribute('data-id')); });
    prevSvg.addEventListener('mouseout', () => setHover(null));
    prevSvg.addEventListener('click', e => { const r = e.target.closest('.unit'); if (r) { const u = byId[r.getAttribute('data-id')]; state.floor = u.floor; setSelected(u.id); if (state.view === 'floors') { renderFloorPlan(); renderStepper(); } } });
  }
  function drawPreview() {
    if (!prevCanvas || q('#railPreview').hidden) return;
    drawFrame(prevCanvas, prevCanvas.getContext('2d'), FRAMES[0], prevSvg);
    qa('.unit', prevSvg).forEach(r => r.classList.toggle('is-floor', byId[r.getAttribute('data-id')].floor === state.floor));
    prevCap.textContent = `${t('app.floorN')} ${state.floor}`;
    applyHighlight();
  }

  /* ---------- планы этажей ---------- */
  function renderFloorPlan() {
    const box = q('#planBox'); const units = UNITS.filter(u => u.floor === state.floor);
    const rf = state.floor; // этаж на момент вызова — сверяем в колбэке ниже, вдруг успели переключиться, пока грузилось
    const fp = PLANS.floorPlan(rf, units, { t });
    box.innerHTML = fp.svg;
    const svg = box.querySelector('svg');
    svg.classList.toggle('show-all', state.showAll);
    svg.addEventListener('mouseover', e => { const r = e.target.closest('.unit'); if (r) setHover(r.getAttribute('data-id')); });
    svg.addEventListener('mouseout', e => { if (e.target.closest('.unit')) setHover(null); });
    svg.addEventListener('click', e => { if (svg._dragged) return; const r = e.target.closest('.unit'); if (r) { const id = r.getAttribute('data-id'); setSelected(id); openPopover(id, r, q('#upopF')); } });
    attachPlanZoom(svg, rf);
    applyFilterClasses(); applyHighlight(); drawPreview(); renderMobileFloor();
    // fp.real=false: показали схематичный план-скелет, пока грузится настоящий (data/floors/floor-N.json) -
    // перерисуем без мигания, как только он готов (и только если пользователь всё ещё на этом этаже/во view «floors»).
    if (!fp.real) PLANS.onFloorReady(rf, () => { if (state.view === 'floors' && state.floor === rf) renderFloorPlan(); });
    PLANS.ensureFloor(rf, FLOORS); // + предзагрузка соседних этажей (F±1), чтобы степпер листался без сетевого ожидания
  }
  /* Зум плана этажа колесом: масштаб вокруг курсора (1x-6x), при зуме план таскается мышью,
     двойной клик - сброс. Масштаб живёт в viewBox и переживает перерисовку того же этажа,
     при смене этажа сбрасывается. */
  let planZoom = { floor: null, vb: null };
  function attachPlanZoom(svg, floor) {
    const base = svg.viewBox.baseVal; const B = { x: base.x, y: base.y, w: base.width, h: base.height };
    const MAXZ = 6;
    let vb = (planZoom.floor === floor && planZoom.vb) ? { ...planZoom.vb } : { ...B };
    const apply = () => {
      vb.w = Math.min(B.w, Math.max(B.w / MAXZ, vb.w)); vb.h = vb.w * B.h / B.w;
      vb.x = Math.min(B.x + B.w - vb.w, Math.max(B.x, vb.x)); vb.y = Math.min(B.y + B.h - vb.h, Math.max(B.y, vb.y));
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      svg.classList.toggle('is-zoomed', vb.w < B.w - 1);
      planZoom = { floor, vb: { ...vb } };
    };
    const toSvg = e => { const r = svg.getBoundingClientRect(); const k = Math.max(vb.w / r.width, vb.h / r.height); // preserveAspectRatio meet
      const ox = (r.width - vb.w / k) / 2, oy = (r.height - vb.h / k) / 2;
      return { x: vb.x + (e.clientX - r.left - ox) * k, y: vb.y + (e.clientY - r.top - oy) * k, k }; };
    svg.addEventListener('wheel', e => {
      e.preventDefault(); closePopover();
      const p = toSvg(e); const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY / 100)) * 0.25);
      const nw = Math.min(B.w, Math.max(B.w / MAXZ, vb.w * f)); const s = nw / vb.w;
      vb.x = p.x - (p.x - vb.x) * s; vb.y = p.y - (p.y - vb.y) * s; vb.w = nw; apply();
    }, { passive: false });
    let drag = null;
    svg.addEventListener('pointerdown', e => { if (e.button !== 0 || vb.w >= B.w - 1) return; drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, k: toSvg(e).k, id: e.pointerId }; svg._dragged = false; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!svg._dragged && Math.hypot(dx, dy) < 4) return; if (!svg._dragged) { closePopover(); svg.setPointerCapture(drag.id); } svg._dragged = true; svg.classList.add('is-panning');
      vb.x = drag.vx - dx * drag.k; vb.y = drag.vy - dy * drag.k; apply(); });
    const endDrag = () => { if (!drag) return; drag = null; svg.classList.remove('is-panning'); setTimeout(() => { svg._dragged = false; }, 0); };
    svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('dblclick', e => { e.preventDefault(); vb = { ...B }; apply(); });
    if (vb.w < B.w - 1) apply();
  }
  function renderStepper() {
    const st = q('#stepper'); st.innerHTML = '';
    const idx = FLOORS.indexOf(state.floor);
    const up = el('button', { class: 'stepper__arrow', type: 'button', html: U.icons.caretUp, onclick: () => setFloor(FLOORS[idx + 1]) }); up.disabled = idx >= FLOORS.length - 1;
    const dn = el('button', { class: 'stepper__arrow', type: 'button', html: U.icons.caretDown, onclick: () => setFloor(FLOORS[idx - 1]) }); dn.disabled = idx <= 0;
    const list = el('div', { class: 'stepper__list' });
    FLOORS.slice().reverse().forEach(f => list.appendChild(el('button', { class: 'stepper__cell' + (f === state.floor ? ' is-active' : ''), type: 'button', text: f, onclick: () => setFloor(f) })));
    st.append(up, list, dn);
    const a = list.querySelector('.is-active'); if (a) a.scrollIntoView({ block: 'nearest' });
  }
  function setFloor(f) { if (f == null) return; state.floor = f; if (window.STATE) window.STATE.saveFloor(f); closePopover(); renderFloorPlan(); renderStepper(); }
  function renderRose(slot) { q('#rose').innerHTML = PLANS.rose(t, slot); }
  q('#compass').innerHTML = U.icons.compass(75);
  function renderMobileFloor() {
    const m = q('#mfloor'); m.innerHTML = '';
    const f = el('div', { class: 'field is-filled' });
    const btn = el('button', { class: 'field__btn', type: 'button' }, [el('span', { class: 'val', text: `${t('app.floorN')} ${state.floor}` })]);
    btn.insertAdjacentHTML('beforeend', `<span class="caret">${U.icons.caret}</span>`);
    f.classList.remove('is-filled');
    btn.addEventListener('click', () => { const o = f.classList.contains('is-open'); closeFields(); if (!o) f.classList.add('is-open'); });
    const menu = el('div', { class: 'menu' });
    FLOORS.slice().reverse().forEach(fl => menu.appendChild(el('button', { class: 'menu__item' + (fl === state.floor ? ' is-selected' : ''), type: 'button', onclick: () => { setFloor(fl); closeFields(); } }, [el('span', { text: `${t('app.floorN')} ${fl}` }), el('span', { html: U.icons.check })])));
    f.append(btn, menu); m.appendChild(f);
  }

  /* ---------- шахматка ---------- */
  function renderChess() {
    const tb = q('#chessToolbar'); tb.innerHTML = ''; tb.hidden = true; state.chessView = 'simple';
    const lg = q('#legend'); lg.innerHTML = '';
    ['available', 'reserved', 'sold'].forEach(s => lg.appendChild(el('div', { class: 'legend__i' }, [el('span', { class: 'legend__sw', style: `background: var(--status-${s})` }), el('span', { text: t('app.status.' + s) })])));
    const ch = q('#chess'); ch.innerHTML = ''; ch.style.display = '';
    if (state.chessView === 'list') { renderChessList(ch); return; }
    const floorsCol = el('div', { class: 'chess__floors' }, [el('div', { class: 'chess__fspacer' })]);
    const rows = el('div', { class: 'chess__rows' });
    rows.appendChild(el('div', { class: 'chess__head', text: 'Tower 26 · ' + (U.lang === 'en' ? 'section 1' : 'секция 1') }));
    FLOORS.slice().reverse().forEach((f, ri) => {
      floorsCol.appendChild(el('div', { class: 'chess__f' + (f === state.floor && state.view === 'floors' ? ' is-active' : ''), text: f }));
      const row = el('div', { class: 'chess__row' });
      const floorUnits = UNITS.filter(u => u.floor === f).sort((a, b) => a.slot - b.slot);
      floorUnits.forEach((u, ci) => {
        const c = el('a', { class: 'cell', href: '#/own/' + u.id, 'data-id': u.id, 'data-status': u.status, 'data-alt': (ri + ci) % 2, text: u.number, title: `# ${u.number} · ${U.area(u.total, true)}` });
        c.addEventListener('mouseenter', () => setHover(u.id)); c.addEventListener('mouseleave', () => setHover(null));
        row.appendChild(c);
      });
      rows.appendChild(row);
    });
    ch.append(floorsCol, rows);
    applyFilterClasses(); applyHighlight(); renderZoom();
  }
  function renderChessList(ch) {
    ch.style.display = 'block';
    const tbl = el('div', { class: 'table', style: 'width: 600px' });
    filtered().forEach(u => {
      const row = el('a', { class: 'row', href: '#/own/' + u.id, 'data-id': u.id, style: 'gap: 16px; justify-content: flex-start' }, [
        el('span', { class: 'legend__sw', style: `background: var(--status-${u.status}); flex: none; width: 20px; height: 20px` }),
        el('span', { text: `# ${u.number}`, style: 'width: 80px' }), el('span', { text: t('app.rooms.' + u.type), style: 'width: 120px' }),
        el('span', { text: `${u.floor} ${t('app.floorShort')}`, style: 'width: 80px' }), el('span', { text: U.area(u.total, true), style: 'width: 100px' }), el('b', { text: U.price(u.price), style: 'margin-left: auto' })]);
      row.addEventListener('mouseenter', () => setHover(u.id)); row.addEventListener('mouseleave', () => setHover(null));
      tbl.appendChild(row);
    });
    ch.appendChild(tbl);
  }
  function renderZoom() {
    const z = q('#zoom'); z.innerHTML = '';
    const MIN = .6, MAX = 1.6;
    const track = el('div', { class: 'zoom__track' }, [el('div', { class: 'zoom__fill' }), el('div', { class: 'zoom__thumb' })]);
    const slider = el('div', { class: 'zoom__slider' }, [track]);
    const paint = () => { const p = (state.chessSize - MIN) / (MAX - MIN) * 100; track.querySelector('.zoom__fill').style.width = p + '%'; track.querySelector('.zoom__thumb').style.left = p + '%'; document.documentElement.style.setProperty('--chess-size', state.chessSize); };
    const setZ = v => { state.chessSize = Math.max(MIN, Math.min(MAX, +v.toFixed(2))); paint(); };
    slider.addEventListener('pointerdown', e => { const r = slider.getBoundingClientRect(); const mv = ev => setZ(MIN + (ev.clientX - r.left) / r.width * (MAX - MIN)); mv(e); slider.setPointerCapture(e.pointerId); slider.addEventListener('pointermove', mv); slider.addEventListener('pointerup', () => slider.removeEventListener('pointermove', mv), { once: true }); });
    z.append(el('button', { type: 'button', html: U.icons.zoomOut, 'aria-label': 'zoom out', onclick: () => setZ(state.chessSize - .2) }), slider, el('button', { type: 'button', html: U.icons.zoomIn, 'aria-label': 'zoom in', onclick: () => setZ(state.chessSize + .2) }));
    paint();
  }

  /* ---------- сегментед-контроль (desktop) и таббар (mobile) ---------- */
  const VIEWS = [{ id: '3d', label: 'app.view3d', tab: 'app.tab.3d', icon: 'view3d' }, { id: 'floors', label: 'app.floors', tab: 'app.tab.floors', icon: 'layers' }, { id: '2d', label: 'app.view2d', tab: 'app.tab.2d', icon: 'grid' }];
  function renderSegmented() {
    const s = q('#segmented'); s.innerHTML = ''; if (isMobile()) return;
    VIEWS.forEach(v => s.appendChild(el('button', { class: 'seg' + (v.id === state.view ? ' is-active' : ''), type: 'button', html: U.icons[v.icon] + `<span>${t(v.label)}</span>`, onclick: () => goView(v.id) })));
  }
  function renderTabbar() {
    const tb = q('#tabbar'); tb.innerHTML = ''; if (!isMobile()) return;
    const items = [{ id: 'filters', label: 'app.tab.filters', icon: 'tune' }].concat(VIEWS.map(v => ({ id: v.id, label: v.tab, icon: v.icon }))).concat([{ id: 'fav', label: 'app.tab.fav', icon: 'heart' }]);
    items.forEach(it => {
      const active = (it.id === state.sheet) || (!state.sheet && it.id === state.view);
      const b = el('button', { class: 'tabbar__i' + (active ? ' is-active' : ''), type: 'button', html: U.icons[it.icon] + `<span>${t(it.label)}</span>`, onclick: () => { if (it.id === 'filters') openSheet('filters'); else if (it.id === 'fav') openSheet('fav'); else { closeSheet(); goView(it.id); } } });
      if (it.id === 'filters' && anyFilter()) b.appendChild(el('span', { class: 'dot' }));
      if (it.id === 'fav' && U.fav.count()) b.appendChild(el('span', { class: 'badge-count', text: U.fav.count() }));
      tb.appendChild(b);
    });
  }
  function goView(v) { state.view = v; if (window.STATE && v !== '2d') window.STATE.saveView(v); location.hash = v === 'floors' ? '#/floors' : '#/'; if (v !== 'floors') applyView(); }
  function applyView() {
    closePopover(); closeFields();
    q('#scene3d').classList.toggle('is-on', state.view === '3d');
    q('#sceneFloors').classList.toggle('is-on', state.view === 'floors');
    q('#sceneChess').classList.toggle('is-on', state.view === '2d');
    // Фильтры остаются на рельсе во всех видах; список карточек
    // и превью со спиннером уходят на «Планах этажей»/2D — сам блок .filters вне #railBody).
    const inList = state.view === '3d';
    q('#filters').hidden = state.favMode;
    q('#railBody').hidden = !inList || state.favMode;
    const showPreview = state.view === '2d' && !state.favMode;
    q('#railPreview').hidden = !showPreview;
    if (showPreview) { const pv = q('#preview'); if (!pv.getAttribute('src')) pv.src = 'assets/img/facade.webp'; }
    q('#railFav').hidden = !state.favMode;
    // #polys (оверлей 3D-сцены) держит те же .unit[data-status] элементы, что и SVG «Планов
    // этажей»/шахматки — вне 3D-вида контейнер скрыт через CSS, но узлы остаются в DOM раньше
    // по разметке и перехватывают querySelector('.unit[...]')/клики, предназначенные другому
    // виду. Чистим/пересобираем по факту переключения вида, чтобы вне 3D в DOM не было дублей.
    if (state.view === '3d') { if (!polysSvg.childElementCount) buildPolys(polysSvg); preloadFrames(); drawScene(); renderStepper3d(); }
    else polysSvg.innerHTML = '';
    if (state.view === 'floors') { renderFloorPlan(); renderStepper(); renderRose(null); applyShowAll(); }
    if (state.view === '2d') renderChess();
    if (state.favMode) renderFavList();
    drawPreview(); renderSegmented(); renderTabbar();
  }

  /* ---------- mobile-лист (фильтры / избранное) ---------- */
  function openSheet(kind) { state.sheet = kind; renderSheet(); q('#sheet').classList.add('is-on'); renderTabbar(); }
  function closeSheet() { if (!state.sheet) return; state.sheet = null; q('#sheet').classList.remove('is-on'); renderTabbar(); }
  function renderSheet() {
    const sh = q('#sheet'); sh.innerHTML = '';
    const head = el('div', { class: 'sheet__head', text: t(state.sheet === 'fav' ? 'app.favorites' : 'app.sheet.filters') }, [el('button', { class: 'sheet__close', type: 'button', html: U.icons.closeMI, onclick: closeSheet })]);
    const body = el('div', { class: 'sheet__body' });
    sh.append(head, body);
    if (state.sheet === 'fav') { body.appendChild(favListEl()); return; }
    FILTER_DEFS.filter(def => !def.hidden).forEach(def => {
      const sec = el('div', { class: 'ssec' });
      const v = state.filters[def.key]; const n = v ? (def.kind === 'range' ? 1 : v.length) : 0;
      sec.appendChild(el('div', { class: 'ssec__legend', html: t(def.label) + (n ? ` <b>· ${n}</b>` : '') }));
      if (def.kind === 'range') sec.appendChild(rangePanel(def, false));
      else {
        const grid = el('div', { class: 'checks' });
        def.options.forEach(o => {
          const on = v && v.includes(o);
          grid.appendChild(el('label', { class: 'chk' + (on ? ' is-on' : ''), onclick: () => { const cur = (state.filters[def.key] || []).slice(); const i = cur.indexOf(o); if (i >= 0) cur.splice(i, 1); else cur.push(o); state.filters[def.key] = cur.length ? cur : null; onFiltersChange(); renderSheet(); } }, [el('span', { class: 'box', html: on ? U.icons.check : '' }), el('span', { text: def.opt(o) })]));
        });
        sec.appendChild(grid);
      }
      body.appendChild(sec);
    });
    const foot = el('div', { class: 'sheet__foot' }, [el('button', { class: 'sheet__cta', type: 'button', id: 'sheetCta', onclick: () => { if (filtered().length) closeSheet(); } })]);
    sh.appendChild(foot); renderSheetFoot();
    // свайп вниз по шапке — закрыть
    let y0 = null; head.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true }); head.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) closeSheet(); y0 = null; });
  }
  function renderSheetFoot() {
    const b = q('#sheetCta'); if (!b) return; const n = filtered().length;
    b.classList.toggle('is-disabled', !n);
    b.textContent = n ? `${t('app.sheet.show')} ${U.num(n)} ${t('app.sheet.options')}` : t('app.nothing');
  }

  /* ---------- страница объекта ---------- */
  const galleryState = { canvas: null, svg: null };
  function renderUnitPage(id) {
    const u = byId[id]; if (!u) { location.hash = '#/'; return; }
    state.unitId = id; state.selected = id;
    const page = q('#unitPage'); page.hidden = false; page.innerHTML = ''; if (!V2) { q('#app').hidden = true; q('#tabbar').hidden = true; } else { requestAnimationFrame(() => page.classList.add('is-open')); }
    const logo = q('.rail .app-logo').cloneNode(true);
    page.appendChild(el('div', { class: 'up__head' }, [logo, el('div', { class: 'icon-btns' }, [
      el('button', { class: 'ibtn', type: 'button', text: U.lang, onclick: () => U.setLang(U.lang === 'ru' ? 'en' : 'ru') }),
      el('button', { class: 'ibtn', type: 'button', html: U.fav.count() ? U.icons.heartFill24 + `<span class="badge-count">${U.fav.count()}</span>` : U.icons.heart, onclick: () => { location.hash = '#/favorites'; } })])]));
    const crumbs = el('div', { class: 'crumbs' }, [
      el('nav', { class: 'crumbs__nav' }, [el('a', { href: state.view === 'floors' ? '#/floors' : '#/', html: U.icons.kbdLeft + `<span>${t('app.allUnits')}</span>` }), el('span', { class: 'crumbs__sep', text: '/' }), el('span', { class: 'crumbs__cur', text: t('app.unitDetails') })]),
      el('div', { class: 'actions', id: 'unitActions' })]);
    page.appendChild(crumbs);
    // панель медиа
    const floorUnits = UNITS.filter(x => x.floor === u.floor);
    const miniFp = PLANS.floorPlan(u.floor, floorUnits, { compact: true, thumb: true });
    const tiles = el('div', { class: 'tiles' }, [
      el('div', { class: 'tile', html: U.icons.compass(91) + `<span class="tile__cap">${t('app.compass')}</span>`, onclick: () => { state.floor = u.floor; location.hash = '#/floors'; } }),
      el('div', { class: 'tile', html: miniFp.svg + `<span class="tile__cap">${t('app.tile.floor')} ${u.floor}</span>`, onclick: () => { state.floor = u.floor; location.hash = '#/floors'; } }),
      el('div', { class: 'tile', html: `<img src="assets/img/site.webp" alt="" style="object-position: 50% 50%"><span class="tile__cap">${t('app.tile.site')}</span>` })
    ]);
    const floorTileEl = tiles.querySelectorAll('.tile')[1];
    const markSelected = () => { const sv = floorTileEl.querySelector('svg'); if (sv) { const r = sv.querySelector(`[data-id="${u.id}"]`); if (r) r.classList.add('is-selected'); } };
    markSelected();
    if (!miniFp.real) PLANS.onFloorReady(u.floor, () => {
      if (state.unitId !== id) return; // ушли со страницы этой квартиры, пока грузилось
      const fresh = PLANS.floorPlan(u.floor, floorUnits, { compact: true, thumb: true });
      floorTileEl.innerHTML = fresh.svg + `<span class="tile__cap">${t('app.tile.floor')} ${u.floor}</span>`;
      markSelected();
    });
    PLANS.ensureFloor(u.floor, FLOORS);
    const gallery = el('div', { class: 'gallery', id: 'gallery' });
    const panel = el('div', { class: 'up__panel' }, [el('div', { class: 'up__grid' }, [tiles, gallery]), el('div', { class: 'up__tabs' }, [el('div', { class: 'tabs' }, [
      el('button', { class: 'tab' + (state.unitTab === 'layouts' ? ' is-active' : ''), type: 'button', text: t('app.tabs.layouts'), onclick: () => { state.unitTab = 'layouts'; renderUnitPage(id); } }),
      el('button', { class: 'tab' + (state.unitTab === 'facade' ? ' is-active' : ''), type: 'button', text: t('app.tabs.facade'), onclick: () => { state.unitTab = 'facade'; renderUnitPage(id); } })])])]);
    const info = el('div', { class: 'up__info' }, [dealPanel(u)]);
    page.appendChild(el('div', { class: 'up__main' }, [panel, info]));
    page.appendChild(el('div', { class: 'up__cta-mobile' }, [requestBtn(u), waBtn(u)]));
    renderUnitActions(); renderGallery(u);
    if (V2) {
      page.insertBefore(el('button', { class: 'up__close', type: 'button', html: U.icons.close, 'aria-label': 'close', onclick: () => { location.hash = state.view === 'floors' ? '#/floors' : '#/'; } }), page.firstChild);
      state.floor = u.floor; if (state.view === '3d') showOnScene(id); else setSelected(id); renderStepper3d(); applyFloorSlice(); drawPreview();
    }
    window.scrollTo(0, 0); page.scrollTop = 0;
  }
  function accordion(u) { // eslint-disable-line no-unused-vars
    const rows = [[t('app.price.sqm.usd'), U.price(u.pricePerSqm)], [t('app.price.sqm.gel'), U.price(U.gel(u.pricePerSqm))], [t('app.price.usd'), U.price(u.price)], [t('app.price.gel'), U.price(U.gel(u.price))],
      [t('app.row.total'), U.num(u.total, 2, 2)], [t('app.row.living'), U.num(u.living, 2, 2)], [t('app.row.balcony'), U.num(u.balcony, 2, 2)], [t('app.row.floor'), String(u.floor)], [t('app.row.view'), t('app.view.' + u.view)]];
    const acc = el('div', { class: 'acc' + (V3 ? ' is-closed' : '') });
    acc.appendChild(el('button', { class: 'acc__h', type: 'button', html: `<span>${t('app.priceDetails')}</span>${U.icons.expandMore}`, onclick: () => acc.classList.toggle('is-closed') }));
    acc.appendChild(el('div', { class: 'table' }, rows.map(r => el('div', { class: 'row' }, [el('span', { text: r[0] }), el('b', { text: r[1] })]))));
    return acc;
  }
  /* WhatsApp: номер из data/units.js (project.contacts.whatsapp). Пусто — кнопки нет, чтобы не вести в никуда. */
  const WA_ICON = '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z"/></svg>';
  function waHref(u) {
    const raw = (D.project.contacts && D.project.contacts.whatsapp) || '';
    const num = String(raw).replace(/\D/g, '');
    if (!num) return null;
    const txt = `Tower 26, ${U.lang === 'en' ? 'apartment' : 'квартира'} #${u.number}, ${t('app.rooms.' + u.type)}, ${U.area(u.total, true)}`;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  }
  function waBtn(u) {
    const href = waHref(u); if (!href) return null;
    return el('a', { class: 'cta cta--wa', href, target: '_blank', rel: 'noopener noreferrer', html: WA_ICON + `<span>${t('app.panel.whatsapp')}</span>` });
  }
  function requestBtn(u, source) {
    return u.status === 'sold'
      ? el('button', { class: 'cta is-disabled', type: 'button', text: t('app.sold') })
      : el('button', { class: 'cta', type: 'button', text: t('app.panel.request'), onclick: () => openModal(u, source || 'site_unit_page') });
  }
  function dealPanel(u) {
    const row = (label, value) => el('div', { class: 'dp__row' }, [el('span', { text: label }), el('b', { text: value })]);
    return el('div', { class: 'dp' }, [
      el('div', { class: 'dp__head' }, [
        el('h1', { class: 'dp__title' }, [el('span', { text: t('app.rooms.' + u.type) }), el('span', { class: 'dp__num', text: '# ' + u.number })]),
        el('div', { class: 'dp__sub', text: `${t('app.floorN')} ${u.floor}` })
      ]),
      el('div', { class: 'dp__price' }, [
        el('div', { class: 'dp__usd', text: '$ ' + U.price(u.price) }),
        el('div', { class: 'dp__gel', text: '₾ ' + U.price(U.gel(u.price)) }),
        el('div', { class: 'dp__sqm', text: `$ ${U.price(u.pricePerSqm)} · ₾ ${U.price(U.gel(u.pricePerSqm))} ${t('app.panel.pricePerSqm')}` })
      ]),
      el('div', { class: 'dp__rows' }, [
        row(t('app.panel.area'), U.area(u.total, true)),
        row(t('app.panel.living'), U.area(u.living, true)),
        row(t('app.panel.balcony'), U.area(u.balcony, true)),
        row(t('app.panel.floor'), String(u.floor)),
        el('div', { class: 'dp__row' }, [el('span', { text: t('app.panel.status') }),
          el('span', { class: 'dp__st' }, [el('span', { class: 'status-sq', 'data-status': u.status }), el('b', { text: t('app.status.' + u.status) })])]),
        row(t('app.panel.view'), t('app.view.' + u.view))
      ]),
      el('div', { class: 'dp__btns' }, [requestBtn(u, 'site_unit_page'), waBtn(u)])
    ]);
  }
  function renderUnitActions() {
    const a = q('#unitActions'); if (!a) return; const u = byId[state.unitId]; const fav = U.fav.has(u.id); a.innerHTML = '';
    // PLANS_DATA.pdfs lists units that have a PDF sheet; without the list every unit is assumed to have one
    const pdfs = window.PLANS_DATA && window.PLANS_DATA.pdfs;
    if (!pdfs || pdfs.includes(u.number)) a.append(el('a', { class: 'act', href: `assets/plans/pdf/unit-${u.number}.pdf`, download: `unit-${u.number}.pdf`, html: U.icons.pdf + `<span>${t('app.action.pdf')}</span>` }));
    a.append(el('button', { class: 'act', type: 'button', html: U.icons.link + `<span>${t('app.action.copy')}</span>`, onclick: () => { const url = location.href; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).catch(() => {}).then(() => U.toast(t('app.copied'))); } }),
      el('button', { class: 'act' + (fav ? ' is-active' : ''), type: 'button', html: (fav ? U.icons.heartSmFill : U.icons.heartSm) + `<span>${t(fav ? 'app.action.saved' : 'app.action.save')}</span>`, onclick: () => toggleFav(u.id) }));
  }
  function renderGallery(u) {
    const g = q('#gallery'); g.innerHTML = ''; galleryState.canvas = null;
    g.classList.toggle('is-plan', state.unitTab === 'layouts');
    if (state.unitTab === 'layouts') {
      // ярлык «тип N / площадь» теперь внутри плана (planImg), а не над ним
      g.appendChild(planImg(u, 'plan-fig--page'));
    } else {
      const box = el('div', { class: 'g-facade' }); const cv = el('canvas'); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      box.append(cv, svg); g.appendChild(box); buildPolys(svg); galleryState.canvas = cv; galleryState.svg = svg;
      const r = svg.querySelector(`[data-id="${u.id}"]`); if (r) r.classList.add('is-selected');
      const cap = el('div', { class: 'capsule' }, [el('button', { class: 'rot', type: 'button', html: U.icons.arrowBack, onclick: () => { state.frame = (state.frame + 2) % 3; ensureFrame(state.frame); drawGallery(); } }), el('button', { class: 'rot', type: 'button', html: U.icons.arrowForward, onclick: () => { state.frame = (state.frame + 1) % 3; ensureFrame(state.frame); drawGallery(); } })]);
      g.appendChild(cap);
      g.style.padding = '0';
      ensureFrame(state.frame);
      drawGallery();
    }
    g.appendChild(el('button', { class: 'fs-btn', type: 'button', html: U.icons.fullscreen, 'aria-label': 'fullscreen', onclick: () => { const p = q('#unitPage'); if (p.requestFullscreen) { document.fullscreenElement ? document.exitFullscreen() : p.requestFullscreen(); } } }));
  }
  function drawGallery() { if (!galleryState.canvas) return; const fr = FRAMES[state.frame]; drawFrame(galleryState.canvas, galleryState.canvas.getContext('2d'), fr, galleryState.svg); galleryState.svg.style.display = fr.polys ? '' : 'none'; }
  function closeUnitPage() { if (!state.unitId) return; state.unitId = null; const p = q('#unitPage'); if (V2) { p.classList.remove('is-open'); setTimeout(() => { if (!state.unitId) { p.hidden = true; p.innerHTML = ''; } }, 360); } else { p.hidden = true; p.innerHTML = ''; q('#app').hidden = false; q('#tabbar').hidden = false; } }

  /* ---------- модалка заявки ---------- */
  // source — откуда открыт модал: 'site_unit_page' (панель решения), 'site_popup' (поповер этажа), 'site_card' (карточка).
  function openModal(u, source) {
    const m = q('#modal'); m.classList.remove('is-sent'); m.innerHTML = '';
    const f = (name, key, type) => el('label', { class: 'mfield' }, [el('span', { text: t(key) }), el(type === 'textarea' ? 'textarea' : 'input', { name, type: type || 'text' }), el('span', { class: 'err' })]);
    const submit = el('button', { class: 'cta', type: 'submit', text: t('app.send') });
    const note = el('div', { class: 'modal__note' });
    const okBox = el('div', { class: 'modal__ok', text: t('app.promise') });
    const form = el('form', { novalidate: 'novalidate' }, [f('name', 'app.form.name'), f('phone', 'app.form.phone', 'tel'), f('email', 'app.form.email', 'email'), f('comment', 'app.form.comment', 'textarea'), submit, note]);
    form.addEventListener('submit', e => {
      e.preventDefault(); let ok = true;
      const chk = (n, cond, msg) => { const inp = form.elements[n]; const w = inp.closest('.mfield'); w.classList.toggle('is-error', !cond); inp.classList.toggle('is-error', !cond); w.querySelector('.err').textContent = msg; if (!cond) ok = false; };
      chk('name', !!form.elements.name.value.trim(), t('app.errorRequired'));
      chk('phone', form.elements.phone.value.replace(/\D/g, '').length >= 9, form.elements.phone.value.trim() ? t('app.errorPhone') : t('app.errorRequired'));
      const em = form.elements.email.value.trim(); chk('email', !em || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em), t('app.errorEmail'));
      if (!ok) return;
      // unit_id = номер квартиры (CRM сопоставляет его с id или number юнита)
      const payload = {
        name: form.elements.name.value.trim(), phone: form.elements.phone.value, email: em,
        comment: form.elements.comment.value.trim(), unit_id: u.number,
        interest: `${t('app.rooms.' + u.type)} · ${U.area(u.total, true)}`,
        source: source || 'site_unit_page'
      };
      note.classList.remove('is-error');
      if (!window.leadTracker) {
        console.warn('[lead] window.leadTracker не подключён — заявка НЕ отправлена', payload);
        note.textContent = t('app.lead.offline'); note.classList.add('is-error'); return;
      }
      submit.disabled = true; note.textContent = '…';
      window.leadTracker.lead(payload).then(r => {
        submit.disabled = false;
        if (r && r.error) { note.textContent = t('app.lead.error') + ' (' + r.error + ')'; note.classList.add('is-error'); return; }
        note.textContent = '';
        okBox.textContent = (r && r.queued) ? t('app.lead.queued') : t('app.lead.sent');
        m.classList.add('is-sent');
      }).catch(err => { submit.disabled = false; note.textContent = t('app.lead.error'); note.classList.add('is-error'); console.warn('[lead] lead failed', err); });
    });
    m.appendChild(el('div', { class: 'modal__box' }, [el('button', { class: 'modal__close', type: 'button', html: U.icons.close, onclick: closeModal }), el('h2', { text: `${t('app.lead.title')} · # ${u.number}` }), form, okBox]));
    m.classList.add('is-on');
    m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  }
  function closeModal() { q('#modal').classList.remove('is-on'); }

  /* ---------- роутинг ---------- */
  let routeCalled = false;
  function route() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/own\/([^?]+)/);
    if (m) { closeSheet(); renderUnitPage(decodeURIComponent(m[1])); return; }
    closeUnitPage();
    if (h.startsWith('#/favorites')) { state.favMode = true; if (isMobile()) { openSheet('fav'); } applyView(); return; }
    state.favMode = false;
    // «#/» без явного маршрута: на самом первом route() (загрузка страницы) уважаем
    // восстановленный из persistence view (state.view уже мог быть 'floors' - см. init state{}
    // выше); дальше, пока страница живёт, голый «#/» - это явный уход с этажей на 3D/2D.
    if (h.startsWith('#/floors')) { state.view = 'floors'; if (window.STATE) window.STATE.saveView('floors'); }
    else if (state.view === 'floors' && routeCalled) state.view = '3d';
    routeCalled = true;
    const qs = h.split('?')[1]; if (qs) { const p = new URLSearchParams(qs); if (p.get('rooms')) { state.filters.rooms = p.get('rooms').split(','); } }
    applyView(); renderFilters(); renderCounter(); renderCards();
  }
  window.addEventListener('hashchange', route);

  /* ---------- язык ---------- */
  function renderLangBtns() { qa('#btnLang, #mBtnLang').forEach(b => { b.textContent = U.lang; }); document.title = U.lang === 'en' ? 'Tower 26 — apartment picker' : 'Tower 26 — подбор апартаментов'; }
  qa('#btnLang, #mBtnLang').forEach(b => b.addEventListener('click', () => U.setLang(U.lang === 'ru' ? 'en' : 'ru')));
  U.onLang(() => { if (window.STATE) window.STATE.mirrorLang(); renderLangBtns(); renderCookieBanner(); renderAll(); });
  /* статусы квартир из CRM (бронь/продано), сниппет грузится async — ждём до 5 с */
  (function syncStatuses(tries) {
    if (!window.leadTracker) { if (tries > 0) setTimeout(() => syncStatuses(tries - 1), 250); return; }
    window.leadTracker.units(st => { let changed = false; UNITS.forEach(u => { if (st[u.id] && st[u.id] !== u.status) { u.status = st[u.id]; changed = true; } }); if (changed) renderAll(); });
  })(20);
  function renderAll() {
    renderFilters(); renderCounter(); renderCards(); renderFavBtn(); renderSegmented(); renderTabbar();
    if (state.unitId) renderUnitPage(state.unitId); else applyView();
    if (state.sheet) renderSheet();
  }

  /* ---------- cookie-баннер ---------- */
  function renderCookieBanner() {
    const el2 = q('#cookieBanner'); if (!el2) return;
    if (!window.STATE || window.STATE.consentGiven()) { el2.hidden = true; return; }
    el2.hidden = false;
    el2.innerHTML = `<span>${t('app.cookie.text')}</span><a class="cookie__more" href="#">${t('app.cookie.more')}</a><button class="cookie__ok" type="button">${t('app.cookie.ok')}</button>`;
    el2.querySelector('.cookie__ok').addEventListener('click', () => { window.STATE.giveConsent(); el2.hidden = true; });
  }

  /* ---------- инициализация ---------- */
  q('#btnPhone').innerHTML = U.icons.phone; q('#mBtnPhone').innerHTML = U.icons.phone;
  q('#railHandle').innerHTML = U.icons.handle;
  q('#railHandle').addEventListener('click', () => { q('#app').classList.toggle('is-collapsed'); setTimeout(() => { drawScene(); }, 520); });
  renderLangBtns(); renderFavBtn(); renderCookieBanner();
  const sliceEl = q('#slice'); if (sliceEl) sliceEl.addEventListener('click', () => goView('floors'));
  if (V3) {
    const sc = q('#scene'); let idleT = null;
    const busy = () => !!document.querySelector('#stepper3d:hover, .toggle:hover, .slice:hover, .capsule:hover, .segmented:hover, .upop.is-on');
    const sleep = () => { if (busy()) { idleT = setTimeout(sleep, 800); return; } sc.classList.add('is-idle'); };
    const wake = () => { sc.classList.remove('is-idle'); clearTimeout(idleT); idleT = setTimeout(sleep, 2000); };
    sc.addEventListener('pointermove', wake); sc.addEventListener('pointerleave', () => { clearTimeout(idleT); if (!document.querySelector('.upop.is-on')) sc.classList.add('is-idle'); });
    idleT = setTimeout(sleep, 2000);
    const st3 = q('#stepper3d');
    if (st3) { st3.addEventListener('mouseenter', () => scene3d.classList.add('is-slicing')); st3.addEventListener('mouseleave', () => scene3d.classList.remove('is-slicing')); }
    if (sliceEl) { sliceEl.addEventListener('mouseenter', () => scene3d.classList.add('is-slicing')); sliceEl.addEventListener('mouseleave', () => scene3d.classList.remove('is-slicing')); }
    q('#results').addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (!c) return; const u = byId[c.getAttribute('data-id')]; if (!u) return; if (state.floor !== u.floor) { state.floor = u.floor; renderStepper3d(); applyFloorSlice(); } scene3d.classList.add('is-slicing'); });
    q('#results').addEventListener('mouseleave', () => scene3d.classList.remove('is-slicing'));
  }
  const ro = new ResizeObserver(() => { drawScene(); drawPreview(); drawGallery(); });
  ro.observe(q('#scene'));
  window.matchMedia('(max-width: 959px)').addEventListener('change', () => { renderSegmented(); renderTabbar(); if (!isMobile()) closeSheet(); });
  route();
  drawScene();
})();
