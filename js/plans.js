/* Генераторы схематичных SVG: планировка юнита, план этажа, роза видов, полигоны фасада.
   Палитра — токены --plan-* (R-COLOR-24); текст в планах — латиница (R-CONTENT-41). */
(function () {
  const WALL = 'var(--plan-wall)', FLOOR = 'var(--plan-floor)', FLOOR_LVL = 'var(--plan-floor-level)';
  const FILL = { studio: '#D9CDB8', '1br': 'var(--plan-fill-1)', '2br': 'var(--plan-fill-2)', '3br': 'var(--plan-fill-3)' };
  const TYPE_EN = { studio: 'Studio', '1br': 'One bedroom', '2br': 'Two bedroom', '3br': 'Three bedroom' };
  const TYPE_SHORT = { studio: 'Studio', '1br': '1BR', '2br': '2BR', '3br': '3BR' };
  const ASPECT = { studio: 0.78, '1br': 1.25, '2br': 1.45, '3br': 1.65 };

  function rooms(u) {
    const L = u.living;
    switch (u.type) {
      case 'studio': return [['Studio', L - 6.5], ['Bath', 4], ['Hall', 2.5]];
      case '1br': return [['Living / Kitchen', L * .47], ['Bedroom', L * .32], ['Bath', L * .1], ['Hall', L * .11]];
      case '2br': return [['Living / Kitchen', L * .37], ['Bedroom', L * .23], ['Bedroom 2', L * .19], ['Bath', L * .1], ['Hall', L * .11]];
      default: return [['Living / Kitchen', L * .32], ['Bedroom', L * .19], ['Bedroom 2', L * .16], ['Bedroom 3', L * .14], ['Bath', L * .07], ['Bath 2', L * .05], ['Hall', L * .07]];
    }
  }

  /* Планировка юнита. Масштаб 1 м = 10 единиц viewBox; стены — заливка --plan-wall. */
  function unitPlan(u, opts) {
    opts = opts || {};
    const S = 10; // px per metre
    const asp = ASPECT[u.type] || 1;
    const w = Math.sqrt(u.living * asp), h = u.living / w; // metres
    const bal = u.balcony / w; // balcony depth
    const ow = w * .03, iw = w * .015; // wall thickness (m) ≈3% / 1.5%
    const pad = 1.2;
    const W = (w + pad * 2) * S, H = (h + bal + pad * 2 + (opts.caption === false ? 0 : 3.2)) * S;
    const x0 = pad * S, y0 = pad * S;
    const rs = rooms(u);
    const parts = [];
    // living slice on the left, rest stacked on the right (slice-and-dice)
    const liv = rs[0]; const rest = rs.slice(1);
    const livW = w * (liv[1] / u.living);
    const cells = [{ n: liv[0], a: liv[1], x: 0, y: 0, w: livW, h: h }];
    const rw = w - livW; let cy = 0;
    const restA = rest.reduce((s, r) => s + r[1], 0);
    rest.forEach(r => { const rh = h * (r[1] / restA); cells.push({ n: r[0], a: r[1], x: livW, y: cy, w: rw, h: rh }); cy += rh; });
    const fs = Math.max(2.2, w * .1) ; // font size in metres-ish
    let g = '';
    g += `<rect x="${x0 - ow * S / 2}" y="${y0 - ow * S / 2}" width="${(w + ow) * S}" height="${(h + ow) * S}" fill="${WALL}"/>`;
    cells.forEach(c => {
      g += `<rect x="${x0 + c.x * S + iw * S / 2}" y="${y0 + c.y * S + iw * S / 2}" width="${Math.max(0, c.w - iw) * S}" height="${Math.max(0, c.h - iw) * S}" fill="${FLOOR}"/>`;
      const tx = x0 + (c.x + c.w / 2) * S, ty = y0 + (c.y + c.h / 2) * S;
      if (c.w * S > 24 && c.h * S > 14) {
        g += `<text x="${tx}" y="${ty - 1}" text-anchor="middle" font-family="'DM Sans', Arial, sans-serif" font-size="${fs}" fill="${WALL}" fill-opacity=".7">${c.n}</text>`;
        g += `<text x="${tx}" y="${ty + fs + 1}" text-anchor="middle" font-family="'DM Sans', Arial, sans-serif" font-size="${fs}" fill="${WALL}" fill-opacity=".7">${c.a.toFixed(1)} m²</text>`;
      }
    });
    // windows on the bottom (balcony side): double thin lines
    const by = y0 + h * S + ow * S / 2;
    g += `<rect x="${x0}" y="${by - ow * S / 2 - 1}" width="${w * S}" height="${ow * S}" fill="${FLOOR}"/>`;
    g += `<line x1="${x0}" y1="${by - ow * S / 2}" x2="${x0 + w * S}" y2="${by - ow * S / 2}" stroke="${WALL}" stroke-width="1"/>`;
    g += `<line x1="${x0}" y1="${by + ow * S / 2 - 1}" x2="${x0 + w * S}" y2="${by + ow * S / 2 - 1}" stroke="${WALL}" stroke-width="1"/>`;
    // balcony
    g += `<rect x="${x0}" y="${by + ow * S / 2}" width="${w * S}" height="${bal * S}" fill="${FLOOR_LVL}" stroke="${WALL}" stroke-width="1" stroke-dasharray="3 2"/>`;
    g += `<text x="${x0 + w * S / 2}" y="${by + ow * S / 2 + bal * S / 2 + fs / 2}" text-anchor="middle" font-family="'DM Sans', Arial, sans-serif" font-size="${fs}" fill="${WALL}" fill-opacity=".7">Balcony ${u.balcony.toFixed(1)} m²</text>`;
    // entry door arc (top wall, left part)
    const dx = x0 + livW * S + 4;
    g += `<path d="M${dx} ${y0} a 8 8 0 0 1 8 8" fill="none" stroke="${WALL}" stroke-width="1" stroke-opacity=".6"/>`;
    if (opts.caption !== false) {
      g += `<text x="${W / 2}" y="${H - pad * S - 2}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.max(6, w * .55)}" fill="${WALL}">${TYPE_EN[u.type]} ${u.number} / ${u.total.toFixed(1)} m²</text>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}">${g}</svg>`;
  }

  /* Планировка как data-URI для <img object-fit: contain>.
     Если для номера юнита есть настоящая планировка (PLANS_DATA.units) — отдаём путь к PNG из PDF архитектора. */
  const cache = {};
  function unitPlanUri(u) {
    const real = window.PLANS_DATA && window.PLANS_DATA.units && window.PLANS_DATA.units[u.number];
    if (real) return 'assets/plans/' + real.png;
    if (!cache[u.id]) {
      // data-URI не видит CSS-переменные — подставляем литералы палитры
      const svg = unitPlan(u).replace(/var\(--plan-wall\)/g, '#182E46').replace(/var\(--plan-floor-level\)/g, '#ECF0F2').replace(/var\(--plan-floor\)/g, '#F3F0EE').replace(/var\(--plan-fill-1\)/g, '#93B7C9');
      cache[u.id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return cache[u.id];
  }

  /* Раскладка слотов этажа вокруг ядра: 1–4 юг (фасад), 5–6 восток, 7–10 север, 11–12 запад. */
  const SIDES = { south: [1, 2, 3, 4], east: [5, 6], north: [7, 8, 9, 10], west: [11, 12] };
  const FW = 300, FH = 210, D = 62; // пятно этажа 30×21 м при 1 м = 10; глубина квартир 6.2 м

  function floorCells(units) {
    const bySlot = {}; units.forEach(u => { bySlot[u.slot] = u; });
    const cells = [];
    function row(slots, x, y, len, horiz) {
      const present = slots.map(s => bySlot[s]);
      const total = present.reduce((s, u) => s + (u ? u.total : 30), 0);
      let off = 0;
      slots.forEach((s, i) => {
        const u = present[i]; const share = (u ? u.total : 30) / total; const L = len * share;
        const c = horiz ? { x: x + off, y: y, w: L, h: D } : { x: x, y: y + off, w: D, h: L };
        c.slot = s; c.u = u || null; cells.push(c); off += L;
      });
    }
    row(SIDES.south, 0, FH - D, FW, true);
    row(SIDES.north, 0, 0, FW, true);
    row(SIDES.east, FW - D, D, FH - 2 * D, false);
    row(SIDES.west, 0, D, FH - 2 * D, false);
    return cells;
  }

  /* --- данные этажей: раньше жили целиком в window.PLANS_DATA.floors, теперь по одному
     JSON-файлу на этаж (data/floors/floor-F.json, см. floorsIndex в data/plans.js) — грузим
     по требованию и кешируем в памяти вкладки; соседние этажи подгружаем заранее (ensureFloor),
     чтобы переключение этажа не ждало сети. */
  const floorCache = {}, floorLoading = {}, imgPreloaded = {};
  function floorsIndex() { return (window.PLANS_DATA && window.PLANS_DATA.floorsIndex) || {}; }
  function preloadImage(name) {
    if (!name || imgPreloaded[name]) return;
    imgPreloaded[name] = true;
    const img = new Image(); img.src = 'assets/plans/' + name;
  }
  function loadFloorData(floor) {
    const key = String(floor), file = floorsIndex()[key];
    if (!file) return Promise.resolve(null); // этаж без настоящего плана — вызывающий сам падает на схематичный рендер
    if (floorCache[key]) return Promise.resolve(floorCache[key]);
    if (floorLoading[key]) return floorLoading[key];
    floorLoading[key] = fetch('data/floors/' + file).then(r => r.json()).then(data => {
      floorCache[key] = data; delete floorLoading[key];
      preloadImage(data.png); preloadImage(data.thumb);
      return data;
    }).catch(e => { delete floorLoading[key]; console.warn('floor data failed:', floor, e); return null; });
    return floorLoading[key];
  }
  /* Подгрузить этаж floor + его соседей по floorsList (F±1), не дожидаясь ответа. */
  function ensureFloor(floor, floorsList) {
    loadFloorData(floor);
    if (!floorsList) return;
    const i = floorsList.indexOf(floor);
    if (i < 0) return;
    if (i > 0) loadFloorData(floorsList[i - 1]);
    if (i < floorsList.length - 1) loadFloorData(floorsList[i + 1]);
  }
  /* Колбэк один раз, когда настоящие данные этажа готовы (no-op, если их для этажа нет). */
  function onFloorReady(floor, cb) { loadFloorData(floor).then(data => { if (data) cb(data); }); }

  /* Настоящий план этажа из PDF архитектора: растровый скан + полигоны квартир поверх него.
     Координаты полигонов заданы в пикселях исходного PNG (floorReal.w × floorReal.h) — рисуем
     через viewBox тех же размеров, тогда масштаб на любом уменьшенном PNG сходится сам.
     opts.thumb: для мелких превью (рельс/страница юнита) берём -half.webp (floorReal.thumb),
     он легче, а на маленьком холсте разницы в резкости не видно. */
  function floorPlanReal(floorReal, units, opts) {
    opts = opts || {};
    const W = floorReal.w, H = floorReal.h;
    const imgName = (opts.thumb && floorReal.thumb) ? floorReal.thumb : floorReal.png;
    // context margins (in image px): sea/street captions around the plan, as on the schematic version
    const M = opts.compact ? 0 : Math.round(W * 0.045), MT = opts.compact ? 0 : Math.round(W * 0.06);
    const VW = W + M * 2, VH = H + MT * 2;
    const ptsStr = poly => poly.map(p => (p[0] + M) + ',' + (p[1] + MT)).join(' ');
    let polys = '';
    units.forEach(u => {
      const ru = floorReal.units[u.number];
      if (!ru) return;
      // one whole contour per apartment (footprint united with its balcony on the backend);
      // the chessboard tone index comes from the backend, the palette lives in CSS tokens
      polys += `<polygon class="unit" data-id="${u.id}" data-status="${u.status}" data-tone="${u.slot % 2}" points="${ptsStr(ru.outline || ru.poly)}"/>`;
    });
    let ctx = '';
    if (!opts.compact) {
      const t = opts.t || (k => k);
      // подписи видов «S E A  V I E W»/«MOUNTAIN & CITY VIEW» серифом 22px с разрядкой
      // 6px (на экране, при текущем масштабе плана ≈0.18 от viewBox); улицы по бокам — серифом
      // 14px курсивом; волны тонкие (≈1px на экране). Коэффициенты подобраны от W (как fs было
      // раньше) — калибровка сделана на floor-10.json (W=4159) при viewport 1216.
      const fsMain = Math.round(W * 0.0293), lsMain = Math.round(W * 0.0079);
      const fsSide = Math.round(W * 0.01875), lsSide = Math.round(fsSide * 0.12);
      const sw = Math.max(1, Math.round(W * 0.00144));
      const wave = (y, color) => { const n = 9, seg = (W * 0.8) / n; let d = `M${M + W * 0.1} ${y}`; for (let i = 0; i < n; i++) d += ` q ${seg / 2} ${-fsMain * 0.3} ${seg} 0`; return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"/>`; };
      const F = "font-family:'Instrument Serif', Georgia, 'Times New Roman', serif";
      const FI = F + ";font-style:italic";
      ctx += wave(MT * 0.62, '#9AA4AE');
      ctx += `<text x="${VW / 2}" y="${MT * 0.42}" text-anchor="middle" style="${F}" font-size="${fsMain}" letter-spacing="${lsMain}" fill="#9AA4AE">${t('app.sea')}</text>`;
      ctx += wave(VH - MT * 0.55, '#AAAC86');
      ctx += `<text x="${VW / 2}" y="${VH - MT * 0.2}" text-anchor="middle" style="${F}" font-size="${fsMain}" letter-spacing="${lsMain}" fill="#7A8580">${t('app.city')}</text>`;
      ctx += `<text x="${M * 0.45}" y="${VH / 2}" text-anchor="middle" transform="rotate(-90 ${M * 0.45} ${VH / 2})" style="${FI}" font-size="${fsSide}" letter-spacing="${lsSide}" fill="#AAAC86">${t('app.park')}</text>`;
      ctx += `<text x="${VW - M * 0.45}" y="${VH / 2}" text-anchor="middle" transform="rotate(90 ${VW - M * 0.45} ${VH / 2})" style="${FI}" font-size="${fsSide}" letter-spacing="${lsSide}" fill="#9AA4AE">${t('app.street')}</text>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" class="floor-plan-svg fp fp--real${opts.compact ? ' fp--compact' : ''}">` +
      `<g class="ctx">${ctx}</g>` +
      `<image class="fp--real__img" href="assets/plans/${imgName}" x="${M}" y="${MT}" width="${W}" height="${H}"/>` +
      `<g class="polys">${polys}</g></svg>`;
    return { svg, w: VW, h: VH };
  }

  /* План этажа: настоящий (из кеша floorCache, см. loadFloorData) — если ещё не загружен,
     рисуем схематичный (битмап SVG + полигоны) как скелет-заглушку, а вызывающий код сам
     решает, перерисоваться ли, когда настоящие данные подъедут (см. onFloorReady/ensureFloor
     и их использование в app.js). return.real говорит, каким из двух путём отрисовано. */
  function floorPlan(floor, units, opts) {
    opts = opts || {};
    const real = floorCache[String(floor)];
    if (real) { const r = floorPlanReal(real, units, opts); r.real = true; return r; }
    const M = opts.compact ? 10 : 60; // поля под контекст
    const W = FW + M * 2, H = FH + M * 2;
    const cells = floorCells(units);
    let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`;
    if (!opts.compact) {
      const t = opts.t || (k => k);
      // волнистые линии видов и подписи улиц — часть «битмапа»
      const SF = "font-family:'Instrument Serif', Georgia, 'Times New Roman', serif";
      g += `<path d="M${M} ${M - 30} q 20 -8 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 20 0" fill="none" stroke="#9AA4AE" stroke-width="0.7"/>`;
      g += `<text x="${W / 2}" y="${M - 38}" text-anchor="middle" style="${SF}" font-size="9" letter-spacing="7" fill="#9AA4AE">${t('app.sea')}</text>`;
      g += `<text x="${W / 2}" y="${H - M + 40}" text-anchor="middle" style="${SF}" font-size="9" letter-spacing="7" fill="#7A8580">${t('app.street')}</text>`;
      g += `<line x1="${M}" y1="${H - M + 26}" x2="${W - M}" y2="${H - M + 26}" stroke="#AAAC86" stroke-width="0.7" stroke-dasharray="6 4"/>`;
      g += `<text x="${M - 30}" y="${H / 2}" text-anchor="middle" transform="rotate(-90 ${M - 30} ${H / 2})" style="${SF}" font-size="9" letter-spacing="7" fill="#AAAC86">${t('app.park')}</text>`;
      g += `<text x="${W - M + 30}" y="${H / 2}" text-anchor="middle" transform="rotate(90 ${W - M + 30} ${H / 2})" style="${SF}" font-size="9" letter-spacing="7" fill="#9AA4AE">${t('app.city')}</text>`;
      // стрелка W→E и солнце
      g += `<path d="M${M + 10} ${H - M + 52} H ${M + 60} m -6 -4 l 6 4 l -6 4" fill="none" stroke="#7A8580" stroke-width="1"/>`;
      g += `<text x="${M + 66}" y="${H - M + 55}" font-family="'DM Sans', Arial, sans-serif" font-size="8" fill="#7A8580">W → E</text>`;
      g += `<circle cx="${W - M - 20}" cy="${M - 20}" r="5" fill="none" stroke="#C9A76A" stroke-width="1.2"/>`;
    }
    // stены и ядро
    g += `<rect x="${M - 4}" y="${M - 4}" width="${FW + 8}" height="${FH + 8}" fill="${WALL}"/>`;
    g += `<rect x="${M}" y="${M}" width="${FW}" height="${FH}" fill="${FLOOR_LVL}"/>`;
    const fs = opts.compact ? 0 : 7.5;
    let polys = '';
    cells.forEach(c => {
      const x = M + c.x + 1.5, y = M + c.y + 1.5, w = c.w - 3, h = c.h - 3;
      if (c.u) {
        g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${FILL[c.u.type]}" stroke="${WALL}" stroke-width="1"/>`;
        if (fs && w > 34 && h > 20) {
          g += `<text x="${x + w / 2}" y="${y + h / 2 - 1}" text-anchor="middle" font-family="Georgia, serif" font-size="${fs}" fill="${WALL}">${TYPE_SHORT[c.u.type]} ${c.u.number}</text>`;
          g += `<text x="${x + w / 2}" y="${y + h / 2 + fs + 1}" text-anchor="middle" font-family="Georgia, serif" font-size="${fs}" fill="${WALL}">${c.u.total.toFixed(1)} m²</text>`;
        }
        polys += `<rect class="unit" data-id="${c.u.id}" data-status="${c.u.status}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      } else {
        g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${FLOOR_LVL}" stroke="${WALL}" stroke-width=".8" stroke-dasharray="2 2"/>`;
      }
    });
    // core
    const cx = M + D + 6, cy = M + D + 6, cw = FW - 2 * D - 12, ch = FH - 2 * D - 12;
    g += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="#FFFFFF" stroke="${WALL}" stroke-width="1"/>`;
    g += `<rect x="${cx + cw / 2 - 18}" y="${cy + ch / 2 - 12}" width="16" height="24" fill="none" stroke="${WALL}" stroke-width=".8"/>`;
    g += `<rect x="${cx + cw / 2 + 2}" y="${cy + ch / 2 - 12}" width="16" height="24" fill="none" stroke="${WALL}" stroke-width=".8"/>`;
    if (!opts.compact) {
      g += `<text x="${cx + cw / 2}" y="${cy + 16}" text-anchor="middle" font-family="'DM Sans', Arial, sans-serif" font-size="7" letter-spacing="1" fill="${WALL}" fill-opacity=".6">LIFTS · STAIRS</text>`;
      g += `<text x="${cx + cw / 2}" y="${cy + ch - 8}" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="${WALL}">Floor ${floor}</text>`;
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="floor-plan-svg"><g class="bitmap">${g}</g><g class="polys">${polys}</g></svg>`, w: W, h: H, real: false };
  }

  /* Роза видов (низ-центр сцены, 115×105): футпринт + дуги видов; юнит подсвечивается по слоту. */
  function rose(t, unitSlot) {
    const side = unitSlot == null ? null : Object.keys(SIDES).find(k => SIDES[k].includes(unitSlot));
    const hl = s => side === s ? 'rgba(255,255,255,.42)' : 'none';
    return `<svg width="115" height="105" viewBox="0 0 115 105" fill="none" aria-hidden="true">
      <path d="M12 30 Q57 12 103 30" stroke="#9AA4AE" stroke-width="1.4"/><text x="57" y="12" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-size="7" letter-spacing="1.5" fill="#6C7680">${t('app.sea')}</text>
      <path d="M12 82 Q57 100 103 82" stroke="#AAAC86" stroke-width="1.4"/><text x="57" y="102" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-size="7" letter-spacing="1.5" fill="#7C7E5A">${t('app.city')}</text>
      <text x="8" y="58" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-size="7" letter-spacing="1" fill="#7C7E5A" transform="rotate(-90 8 58)">${t('app.park')}</text>
      <rect x="35" y="38" width="45" height="32" fill="#919C99"/>
      <rect x="35" y="60" width="45" height="10" fill="${hl('south')}"/><rect x="35" y="38" width="45" height="10" fill="${hl('north')}"/><rect x="70" y="38" width="10" height="32" fill="${hl('east')}"/><rect x="35" y="38" width="10" height="32" fill="${hl('west')}"/>
    </svg>`;
  }

  /* Полигоны фасада: квадрат tl(310,840)–br(920,1395) в координатах 1226×1502, 8 пролётов × 10 этажей, верхний видимый этаж 11.
     Слоты 1–8 = пролёты этого фасада (bay = slot); слоты 9–12 — другие фасады, на кадре не видны. */
  const FQ = { x0: 310, x1: 920, y0: 840, y1: 1395, bays: 8, floors: 10, top: 11 };
  function facadePolygons(units) {
    const bw = (FQ.x1 - FQ.x0) / FQ.bays, fh = (FQ.y1 - FQ.y0) / FQ.floors;
    const out = [];
    units.forEach(u => {
      if (u.slot > FQ.bays || u.floor > FQ.top || u.floor < FQ.top - FQ.floors + 1) return;
      const x = FQ.x0 + (u.slot - 1) * bw, y = FQ.y0 + (FQ.top - u.floor) * fh;
      out.push({ id: u.id, x, y, w: bw, h: fh, u });
    });
    return out;
  }

  window.PLANS = { unitPlan, unitPlanUri, floorPlan, floorCells, rose, facadePolygons, FQ, SIDES, TYPE_EN, ensureFloor, onFloorReady };
})();
