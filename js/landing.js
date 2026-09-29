/* Лендинг: словарь, каталог типов из данных, форма, меню, cookie. */
(function () {
  const D = window.DATA, units = D.units;
  const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
  const qs = new URLSearchParams(location.search); if (qs.get('lang')) U.setLang(qs.get('lang'));

  function applyI18n() {
    qa('[data-i18n]').forEach(el => { el.textContent = U.t(el.getAttribute('data-i18n')); });
    q('#langCode').textContent = U.lang.toUpperCase();
    q('#drawerLang').textContent = U.lang === 'ru' ? 'EN' : 'RU';
    document.title = U.lang === 'en' ? 'Tower 26 — seaside apartments in Batumi' : 'Tower 26 — апартаменты у моря в Батуми';
    renderCards();
  }
  U.onLang(applyI18n);

  // KPI из данных
  const minSqm = Math.min.apply(null, units.map(u => u.pricePerSqm));
  const minArea = Math.min.apply(null, units.map(u => u.total));
  q('#kpiPrice').textContent = U.num(minSqm);
  q('#kpiArea').textContent = U.num(minArea, 1, 1);

  const IMG = { studio: ['assets/img/facade.webp', '50% 70%'], '1br': ['assets/img/tower-dusk.webp', '50% 40%'], '2br': ['assets/img/tower-day.webp', '55% 40%'], '3br': ['assets/img/tower-dusk.webp', '50% 8%'] };
  function renderCards() {
    const box = q('#cards'); box.innerHTML = '';
    const types = ['studio', '1br', '2br', '3br'];
    let i = 0;
    types.forEach(t => {
      const list = units.filter(u => u.type === t);
      const min = Math.min.apply(null, list.map(u => u.price));
      const a0 = Math.min.apply(null, list.map(u => u.total)), a1 = Math.max.apply(null, list.map(u => u.total));
      box.appendChild(card(++i, IMG[t][0], IMG[t][1], U.t('land.type.' + t), U.t('land.card.desc.' + t), U.area(a0, false) + ' – ' + U.area(a1, false) + ' · ' + list.length, U.priceLanding(min), 'select.html#/?rooms=' + t));
    });
    box.appendChild(card(++i, 'assets/img/tower-day.webp', '50% 30%', U.t('land.card.yard'), U.t('land.card.desc.yard'), U.t('land.card.city'), U.t('land.price.from') + '$' + U.num(minSqm) + '/' + (U.lang === 'en' ? 'm²' : 'м²'), 'select.html', true));
    box.appendChild(card(++i, 'assets/img/site.webp', '50% 50%', U.t('land.card.site'), U.t('land.card.desc.site'), U.t('land.card.city'), (window.DATA.project.cadastre || ''), '#location', true));
  }
  function card(i, src, pos, title, desc, meta, price, href, wide) {
    const a = U.el('a', { class: 'card' + (wide ? ' card--wide' : ''), href });
    const img = U.el('img', { src, alt: '', loading: 'lazy' }); img.style.objectPosition = pos;
    a.appendChild(U.el('div', { class: 'card__img' }, [img]));
    a.appendChild(U.el('div', { class: 'card__idx', text: String(i).padStart(2, '0') }));
    a.appendChild(U.el('div', { class: 'card__title', text: title }));
    a.appendChild(U.el('div', { class: 'card__desc', text: desc }));
    a.appendChild(U.el('div', { class: 'card__meta', text: meta }));
    a.appendChild(U.el('div', { class: 'card__price', text: price }));
    return a;
  }

  // иконки
  q('#icPhone').innerHTML = U.icons.phoneOutline; q('#icMail').innerHTML = U.icons.mail; q('#icPin').innerHTML = U.icons.pin;
  q('#icBarPhone').innerHTML = U.icons.phoneOutline; q('#fab').innerHTML = U.icons.chat;
  q('#burger').innerHTML = U.icons.burger; q('#drawerClose').innerHTML = U.icons.close;

  // язык
  const langBtn = q('#langBtn');
  langBtn.addEventListener('click', e => { if (e.target.closest('[data-lang]')) { U.setLang(e.target.closest('[data-lang]').getAttribute('data-lang')); langBtn.classList.remove('is-open'); } else langBtn.classList.toggle('is-open'); });
  document.addEventListener('click', e => { if (!e.target.closest('#langBtn')) langBtn.classList.remove('is-open'); });
  q('#drawerLang').addEventListener('click', () => { U.setLang(U.lang === 'ru' ? 'en' : 'ru'); });

  // drawer
  const openMenu = v => document.body.classList.toggle('menu-open', v);
  q('#burger').addEventListener('click', () => openMenu(true));
  q('#drawerClose').addEventListener('click', () => openMenu(false));
  q('#drawerOverlay').addEventListener('click', () => openMenu(false));
  qa('#drawer a').forEach(a => a.addEventListener('click', () => openMenu(false)));

  // cookie
  const ck = q('#cookie');
  try { if (localStorage.getItem('ap.cookie') === '1') ck.classList.add('closed'); } catch (e) {}
  q('#cookieOk').addEventListener('click', () => { ck.classList.add('closed'); try { localStorage.setItem('ap.cookie', '1'); } catch (e) {} });

  // форма
  const form = q('#leadForm');
  // Строка под кнопкой: «форма не подключена» или ошибка отправки; пустой текст убирает её.
  function formNote(text) {
    let n = form.querySelector('.form-offline');
    if (!text) { if (n) n.remove(); return; }
    if (!n) { n = U.el('p', { class: 'form-offline is-error', role: 'alert' }); form.appendChild(n); }
    n.textContent = text;
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    const name = form.elements.name, phone = form.elements.phone;
    name.classList.toggle('is-error', !name.value.trim()); if (!name.value.trim()) ok = false;
    const digits = phone.value.replace(/\D/g, '');
    phone.closest('.field__input').classList.toggle('is-error', digits.length < 9); if (digits.length < 9) ok = false;
    if (!ok) return;
    // Без трекера (js/config.js) заявка никуда не уходит — так и говорим, а не показываем «спасибо».
    if (!window.leadTracker) { formNote(U.t('app.lead.offline')); return; }
    formNote('');
    const interestMap = { 1: 'invest', 2: 'living', 3: 'rental', 4: 'other' };
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    Promise.resolve(window.leadTracker.lead({ name: name.value.trim(), phone: '+995' + digits.replace(/^995/, ''), interest: interestMap[form.elements.interest.value] || '', source: 'site_form' }))
      .then(r => {
        submit.disabled = false;
        if (r && r.error) { formNote(U.t('app.lead.error')); return; }
        q('#formPanel').classList.add('is-sent');
      })
      .catch(() => { submit.disabled = false; formNote(U.t('app.lead.error')); });
  });
  q('#formBack').addEventListener('click', () => { q('#formPanel').classList.remove('is-sent'); form.reset(); formNote(''); });

  applyI18n();
})();
