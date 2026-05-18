const API = '/api';
const STORAGE_SESSION = 'santes_session_user_id';
const STORAGE_GUEST = 'santes_guest_mode';

const state = {
  events: [],
  rewards: [],
  inventory: [],
  progress: [],
  user: null,
  guest: sessionStorage.getItem(STORAGE_GUEST) === '1',
  route: 'home',
  filters: { day: 'Tots', category: 'Tots', q: '' },
  map: null,
  detailMap: null,
  markers: [],
  selectedMapId: null,
  loading: true,
  error: '',
  castleTimer: null,
  memoryTimer: null,
  memoryPreviewTimer: null,
  officialGameCleanup: null
};

const MINISANTES_GAMES = [
  {
    key: 'castell',
    title: 'Construeix el Castell',
    subtitle: 'Deixa caure castellers ben alineats i aixeca una torre inspirada en la cultura castellera de Les Santes.',
    icon: '🏰',
    badge: 'Disponible',
    prize: '+150',
    status: 'Disponible',
    theme: 'castle',
    accent: 'game-card-red'
  },
  {
    key: 'parelles',
    title: 'Troba les Parelles',
    subtitle: 'Memory amb gegants, diables, capgrossos i figures festives de Mataró.',
    icon: '🎴',
    badge: 'Disponible',
    prize: '+100',
    status: 'Disponible',
    theme: 'pairs',
    accent: 'game-card-yellow'
  },
  {
    key: 'confeti',
    title: 'Atrapa el Confeti',
    subtitle: 'Atrapa Gegants i Robafaves, evita el Drac i els Diables, i encadena combos en 18 segons.',
    icon: '🎉',
    badge: 'Disponible',
    prize: '+200',
    status: 'Disponible',
    theme: 'confetti',
    accent: 'game-card-blue'
  },
  {
    key: 'gegants',
    title: 'Fes Ballar els Gegants',
    subtitle: 'Segueix el ritme i toca seqüències perquè els Gegants ballin com a la festa major.',
    icon: '🎭',
    badge: 'Disponible',
    prize: '+180',
    status: 'Disponible',
    theme: 'giants',
    accent: 'game-card-green'
  },
  {
    key: 'correfoc',
    title: 'Correfoc Segur',
    subtitle: 'Esquiva espurnes, segueix el camí i viu el foc de Les Santes amb reflexos ràpids.',
    icon: '🔥',
    badge: 'Disponible',
    prize: '+220',
    status: 'Disponible',
    theme: 'fire',
    accent: 'game-card-orange'
  },
  {
    key: 'campanes',
    title: 'Toc de Campanes',
    subtitle: 'Recorda una seqüència sonora i visual inspirada en els tocs tradicionals de campanes.',
    icon: '🔔',
    badge: 'Disponible',
    prize: '+160',
    status: 'Disponible',
    theme: 'bells',
    accent: 'game-card-purple'
  }
];

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'No s’han pogut carregar les dades');
  return data;
}

function money(n = 0) {
  return new Intl.NumberFormat('ca-ES').format(Number(n) || 0);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function parseDate(value = '') {
  const m = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0;
}

function formatTime(value = '') {
  const m = String(value || '').match(/(\d{2})\.(\d{2})\.\d{4}\s+(\d{2}:\d{2})/);
  return m ? m[3] : '--:--';
}

function formatDay(value = '') {
  const m = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[1]}/${m[2]}` : 'Sense data';
}

function mapCoordinate(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function hasValidMapPoint(ev) {
  return Boolean(getValidCoordinates(ev));
}

function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getEventDate(ev = {}) {
  const sources = [ev.date_initial, ev.date_start, ev.start_date, ev.date, ev.datetime, ev.day];
  for (const source of sources) {
    const value = String(source ?? '').trim();
    if (!value) continue;
    const dotDate = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dotDate) return `${dotDate[1]}/${dotDate[2]}`;
    const slashDate = value.match(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
    if (slashDate) return `${slashDate[1].padStart(2, '0')}/${slashDate[2].padStart(2, '0')}`;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return 'Sense data';
}

function getEventCategories(ev = {}) {
  const raw = ev.categories ?? ev.category ?? ev.cat ?? '';
  const values = Array.isArray(raw) ? raw : String(raw).split(/[,;/|]/);
  const cleaned = values.map((item) => String(item ?? '').trim()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : ['Altres'];
}

function matchesSearch(ev = {}, query = '') {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = normalizeText([
    ev.title,
    ev.location,
    ...getEventCategories(ev),
    ev.description_short,
    ev.shortText,
    ev.description,
    ev.pretitle
  ].join(' '));
  return haystack.includes(q);
}

function getValidCoordinates(ev = {}) {
  const lat = mapCoordinate(ev.lat ?? ev.latitude);
  const lng = mapCoordinate(ev.lng ?? ev.lon ?? ev.longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function normalizeEvent(ev = {}) {
  const lat = mapCoordinate(ev.lat);
  const lng = mapCoordinate(ev.lng);
  const cats = getEventCategories(ev);
  const day = getEventDate(ev);
  const description = String(ev.description ?? '');
  const descriptionShort = String(ev.description_short ?? '');
  return {
    ...ev,
    lat,
    lng,
    title: ev.title || 'Sense títol',
    time: formatTime(ev.date_initial),
    day,
    timestamp: parseDate(ev.date_initial),
    cat: cats[0],
    categories: cats,
    shortText: descriptionShort || description.slice(0, 220),
    longText: description || descriptionShort || 'No hi ha descripció disponible.',
    hasPoint: hasValidMapPoint({ ...ev, lat, lng })
  };
}

function activeUserId() {
  return state.user?.id || Number(localStorage.getItem(STORAGE_SESSION) || 0);
}

function userCoins() {
  return state.user?.coins || 0;
}

function updateHeader() {
  $('#coinCounter').textContent = state.user ? money(state.user.coins) : (state.guest ? 'Convidat' : '0');
  $('#coinsBtn').classList.toggle('guest', state.guest && !state.user);
  $('#userButton').textContent = state.user ? '🧒' : (state.guest ? '👀' : '👤');
  const active = state.route.split('/')[0];
  document.querySelectorAll('.main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === active || (active === 'acte' && a.dataset.route === 'programa'));
  });
}

async function loadProfile(userId = activeUserId()) {
  if (!userId) return;
  const data = await api(`/profile?user_id=${userId}`);
  state.user = data.user;
  state.inventory = data.inventory || [];
  state.progress = data.progress || [];
  localStorage.setItem(STORAGE_SESSION, String(data.user.id));
  sessionStorage.removeItem(STORAGE_GUEST);
  state.guest = false;
  updateHeader();
}

async function loadInitialData() {
  app.innerHTML = loadingState('Carregant Les Santes...');
  try {
    const [eventsData, rewardsData] = await Promise.all([api('/events'), api('/rewards')]);
    state.events = (eventsData.events || []).map(normalizeEvent).sort((a, b) => a.timestamp - b.timestamp);
    state.rewards = rewardsData.rewards || [];
    const saved = activeUserId();
    if (saved) await loadProfile(saved).catch(() => localStorage.removeItem(STORAGE_SESSION));
    state.loading = false;
    router();
  } catch (err) {
    state.loading = false;
    state.error = err.message;
    app.innerHTML = errorState('No s’han pogut carregar les dades', 'Executa el projecte amb python3 server.py i torna a carregar la pàgina.');
  }
}

function pageTitle(title, subtitle, actions = '') {
  return `<section class="page-title">
    <h2>${escapeHTML(title)}<span class="dot">.</span></h2>
    ${subtitle ? `<p class="lead">${escapeHTML(subtitle)}</p>` : ''}
    ${actions ? `<div class="cta-row">${actions}</div>` : ''}
  </section>`;
}

function loadingState(text) {
  return `<div class="state-box"><div class="loader" aria-hidden="true"></div><h3>${escapeHTML(text)}</h3></div>`;
}

function errorState(title, text) {
  return `<div class="state-box error"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p><a class="btn btn-yellow" href="#home">Tornar a l’inici</a></div>`;
}

function emptyState(text) {
  return `<div class="state-box"><h3>${escapeHTML(text)}</h3><p>Prova de canviar filtres o tornar al programa complet.</p><button class="btn btn-primary primary-highlight" id="resetFilters">Restablir filtres</button></div>`;
}

function categoryClass(cat = '') {
  if (cat === 'Música') return 'cat-music';
  if (cat === 'Familiar') return 'cat-family';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'cat-trad';
  return 'cat-other';
}

function renderEventCard(ev) {
  const mapAction = ev.hasPoint ? `<a class="btn btn-map btn-small" href="#mapa" aria-label="Veure ${escapeHTML(ev.title)} al mapa">Veure al mapa</a>` : '';
  return `<article class="event-card">
    <div class="time-badge"><strong>${escapeHTML(ev.time)}</strong><small>${escapeHTML(ev.day)}</small></div>
    <div>
      <div class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</div>
      <h3 class="event-title">${escapeHTML(ev.title)}</h3>
      <div class="event-meta"><span class="info-highlight">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span><span class="reward-highlight">📅 ${escapeHTML(ev.date_detail || '')}</span></div>
    </div>
    <div class="event-actions">${mapAction}<a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}" aria-label="Veure detall de ${escapeHTML(ev.title)}">Veure detall</a></div>
  </article>`;
}

function featuredEvents() {
  const preferred = state.events.filter((e) => /música|concert|gegant|ruixada|castell|santes/i.test(`${e.cat} ${e.title}`));
  return (preferred.length ? preferred : state.events).slice(0, 8);
}

function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function eventDate(ev) {
  return ev.timestamp ? new Date(ev.timestamp) : null;
}

function nearbyFeaturedEvents(limit = 8) {
  const now = new Date();
  const today = dateKey(now);
  const sorted = [...state.events].filter((ev) => ev.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  const todayEvents = sorted.filter((ev) => dateKey(eventDate(ev)) === today);
  if (todayEvents.length) {
    return {
      mode: 'today',
      title: 'Actes d’avui',
      text: `Actes del ${now.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
      events: todayEvents.slice(0, limit)
    };
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcoming = sorted.filter((ev) => ev.timestamp >= startOfToday);
  if (upcoming.length) {
    return {
      mode: 'upcoming',
      title: 'Propers actes disponibles',
      text: 'Avui no hi ha actes carregats. Et mostrem els actes més propers del programa.',
      events: upcoming.slice(0, limit)
    };
  }

  const highlighted = featuredEvents().sort((a, b) => a.timestamp - b.timestamp);
  return {
    mode: 'fallback',
    title: 'Actes destacats més propers',
    text: 'No hi ha actes futurs a les dades carregades. Et mostrem destacats del programa disponible.',
    events: highlighted.slice(0, limit)
  };
}

function uniqueDays() {
  return ['Tots', ...new Set(state.events.map(getEventDate).filter(Boolean))].slice(0, 14);
}

function categories() {
  return ['Tots', 'Música', 'Familiar', 'Tradicional', 'Cultura', 'Esports', 'Altres'];
}

function applyProgramFilters(events = state.events) {
  const selectedDay = state.filters.day || 'Tots';
  const selectedCategory = state.filters.category || 'Tots';
  const knownCategories = categories().filter((cat) => cat !== 'Tots' && cat !== 'Altres');
  const result = (events || []).filter((ev) => {
    if (selectedDay !== 'Tots' && getEventDate(ev) !== selectedDay) return false;

    if (selectedCategory !== 'Tots') {
      const eventCategories = getEventCategories(ev);
      const isOther = !eventCategories.some((cat) => knownCategories.includes(cat));
      if (selectedCategory === 'Altres') {
        if (!isOther && !eventCategories.includes('Altres')) return false;
      } else if (!eventCategories.includes(selectedCategory)) {
        return false;
      }
    }

    return matchesSearch(ev, state.filters.q);
  });
  return result.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
}

function filteredEvents() {
  return applyProgramFilters();
}

function renderProgramEvents(events = []) {
  const visibleEvents = Array.isArray(events) ? events : [];
  return visibleEvents.length
    ? visibleEvents.slice(0, 60).map(renderEventCard).join('')
    : emptyState('No hi ha actes amb aquests filtres');
}

function renderHome() {
  const hero = featuredEvents()[0] || state.events[0];
  const nearby = nearbyFeaturedEvents(4);
  const highlights = nearby.events;
  const quickLinks = [
    { href: '#programa', icon: '📅', theme: 'red', title: 'Programa', text: 'Consulta tots els actes, filtra per dia i troba el teu pla.' },
    { href: '#mapa', icon: '🗺️', theme: 'blue', title: 'Mapa d’actes', text: 'Explora Mataró amb pins reals i ubicacions sincronitzades.' },
    { href: '#minisantes', icon: '🎮', theme: 'yellow', title: 'MiniSantes', text: 'Jocs, reptes i recompenses per a infants de 6 a 12 anys.' },
    ...(state.user ? [{ href: '#botiga', icon: '🎁', theme: 'gold', title: 'Recompenses', text: 'Canvia monedes per premis i col·leccionables digitals.' }] : [])
  ];
  app.innerHTML = `
    <div class="home-page festive-home">
      <section class="home-hero" aria-labelledby="homeHeroTitle">
        ${hero?.image ? `<img class="home-hero-img" src="${escapeHTML(hero.image)}" alt="${escapeHTML(hero.title)}">` : ''}
        <div class="home-confetti" aria-hidden="true"></div>
        <div class="home-hero-content">
          <span class="eyebrow home-eyebrow">Mataró 2026</span>
          <p class="home-kicker">La festa major de Mataró</p>
          <h1 id="homeHeroTitle">Les Santes<br>2026<span class="dot">.</span></h1>
          <div class="home-date-chip"><span>Del 25 al 29 de juliol</span><strong>Nit, foc, música i cultura popular</strong></div>
          <p class="lead">Viu el programa, situa cada acte al mapa i entra a MiniSantes per jugar amb la festa.</p>
          <div class="cta-row home-hero-actions">
            <a class="btn btn-primary primary-highlight" href="#home/avui">Què passa avui?</a>
            <a class="btn btn-yellow reward-highlight" href="#programa">Veure programa</a>
            <a class="btn btn-map" href="#mapa">Mapa d’actes</a>
          </div>
        </div>
      </section>

      <section class="section home-today" id="homeToday" tabindex="-1">
        <div class="section-head home-section-head">
          <div>
            <span class="eyebrow yellow">Actes propers</span>
            <h2>${escapeHTML(nearby.title)}</h2>
          </div>
          <a href="#programa">Veure tot el programa</a>
        </div>
        <div class="home-event-grid">${highlights.map((ev, index) => renderHomeEventCard(ev, index)).join('')}</div>
      </section>

      <section class="section home-quick-section">
        <div class="section-head home-section-head">
          <div>
            <span class="eyebrow">Explora</span>
            <h2>Accessos ràpids</h2>
          </div>
        </div>
        <div class="home-quick-grid">${quickLinks.map(homeQuickCard).join('')}</div>
      </section>

      <section class="section home-mini-band">
        <div class="home-mini-copy">
          <span class="home-mini-badge">★ Nou · MiniSantes</span>
          <h2>La festa també es <span>juga</span></h2>
          <p>Minijocs, reptes i premis perquè els infants visquin Les Santes d’una manera divertida.</p>
          <div class="home-mini-stats" aria-label="Resum MiniSantes">
            <article><span>🎮</span><strong>${MINISANTES_GAMES.length}</strong><small>Minijocs</small></article>
            <article><span>🎁</span><strong>${state.rewards.length}</strong><small>Premis</small></article>
            <article><span>⭐</span><strong>${state.user ? state.user.level : 4}</strong><small>Nivells</small></article>
          </div>
          <div class="home-mini-actions">
            <a class="btn btn-primary primary-highlight" href="#minisantes">▶ Jugar ara</a>
            <a class="home-mini-link" href="#minisantes">Veure minijocs</a>
          </div>
        </div>
        <div class="home-mini-art" aria-hidden="true">
          <div class="home-mini-blob"></div>
          <div class="home-mini-castle"><i></i><i></i><i></i><b></b></div>
          <div class="home-mini-coin big">🪙</div>
          <div class="home-mini-prize">🏆</div>
          <div class="home-mini-avatar">🧒</div>
          <div class="home-mini-token token-one">🎮</div>
          <div class="home-mini-token token-two">🎭</div>
          <div class="home-mini-star star-one">★</div>
          <div class="home-mini-star star-two">✦</div>
          <div class="home-mini-ribbon">Juga · Guanya · Celebra</div>
        </div>
      </section>
    </div>`;
}

function renderHomeEventCard(ev, index = 0) {
  return `<article class="home-event-card ${index === 0 ? 'featured' : ''}">
    <div class="home-event-time"><strong>${escapeHTML(ev.time)}</strong><span>${escapeHTML(ev.day)}</span></div>
    <div class="home-event-main">
      <div class="home-event-top">
        <span class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
        ${index === 0 ? '<span class="home-featured-badge">Destacat</span>' : ''}
      </div>
      <h3>${escapeHTML(ev.title)}</h3>
      <p class="location-chip">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</p>
    </div>
    <a class="btn btn-primary primary-highlight btn-small" href="#acte/${ev.id}" aria-label="Veure detall de ${escapeHTML(ev.title)}">Veure detall</a>
  </article>`;
}

function homeQuickCard(item) {
  return `<a class="home-quick-card ${item.theme}" href="${item.href}">
    <span>${item.icon}</span>
    <div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p></div>
  </a>`;
}

function renderPrograma() {
  const result = applyProgramFilters();
  const counts = {
    total: result.length,
    music: result.filter((e) => getEventCategories(e).includes('Música')).length,
    family: result.filter((e) => getEventCategories(e).includes('Familiar')).length
  };
  app.innerHTML = `
    ${pageTitle('Programa', 'Filtra per dia, categoria o cerca lliure.', '<a class="btn btn-map" href="#mapa">Veure mapa d’actes</a>')}
    <div class="filters" id="dayFilters">${uniqueDays().map((d) => `<button class="chip ${state.filters.day === d ? 'active' : ''}" type="button" data-day="${escapeHTML(d)}">${escapeHTML(d)}</button>`).join('')}</div>
    <div class="filters" id="catFilters">${categories().map((c) => `<button class="chip ${state.filters.category === c ? 'active' : ''}" type="button" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}</div>
    <label class="field"><span>Cercar actes</span><input id="programSearch" class="input" type="search" placeholder="Castellers, concert, gegants..." value="${escapeHTML(state.filters.q)}"></label>
    <section class="program-layout">
      <div class="event-list">${renderProgramEvents(result)}</div>
      <aside class="side-panel day-summary info-highlight">
        <span class="eyebrow yellow">Resum del dia</span>
        <div class="quick-stats"><div class="stat"><strong>${counts.total}</strong><span>actes</span></div><div class="stat"><strong>${counts.music}</strong><span>música</span></div><div class="stat"><strong>${counts.family}</strong><span>familiar</span></div></div>
        <h3>Properes activitats</h3>
        ${result.slice(0, 3).map((e) => `<a class="map-event-card" href="#acte/${e.id}"><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.time)} · ${escapeHTML(e.location || '')}</p></a>`).join('') || '<p>No hi ha resultats.</p>'}
      </aside>
    </section>`;
  $('#dayFilters')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    state.filters.day = b.dataset.day || 'Tots';
    renderPrograma();
  });
  $('#catFilters')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filters.category = b.dataset.cat || 'Tots';
    renderPrograma();
  });
  $('#programSearch')?.addEventListener('input', (e) => {
    const cursor = e.target.selectionStart ?? e.target.value.length;
    state.filters.q = e.target.value;
    renderPrograma();
    const search = $('#programSearch');
    search?.focus({ preventScroll: true });
    search?.setSelectionRange(cursor, cursor);
  });
  $('#resetFilters')?.addEventListener('click', (e) => {
    e.preventDefault();
    state.filters = { day: 'Tots', category: 'Tots', q: '' };
    renderPrograma();
  });
}

function renderMapa() {
  const events = filteredEvents().filter(hasValidMapPoint);
  if (!events.some((e) => e.id === state.selectedMapId)) state.selectedMapId = events[0]?.id ?? null;
  app.innerHTML = `
    ${pageTitle('Mapa d’actes', 'Explora Mataró amb els actes situats sobre el mapa. Filtra per categoria i obre el detall de cada activitat.', '<a class="btn btn-ghost" href="#programa">Tornar al Programa</a>')}
    <section class="map-shell map-layout map-layout-final">
      <div class="map-card map-card-final map-highlight">
        <div class="map-topbar">
          <div class="map-toolbar" id="mapCats">${['Tots', 'Música', 'Familiar', 'Tradicional', 'Cultura', 'Altres'].map((c) => `<button class="chip ${state.filters.category === c ? 'active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}</div>
          <button class="map-reset info-highlight" id="resetMapView" type="button">Centrar Mataró</button>
        </div>
        <div id="mataroMap" class="mataro-map map-container" role="application" aria-label="Mapa interactiu dels actes de Mataró"></div>
        <div class="map-legend" aria-label="Llegenda del mapa">
          <span><i class="legend-dot marker-musica"></i>Música</span>
          <span><i class="legend-dot marker-familiar"></i>Familiar</span>
          <span><i class="legend-dot marker-tradicional"></i>Tradicional</span>
          <span><i class="legend-dot marker-altres"></i>Altres</span>
        </div>
        <div id="mapFallback" class="map-fallback" aria-live="polite"></div>
      </div>
      <aside class="map-side map-side-final" id="mapList" aria-label="Actes visibles al mapa">
        <div class="map-side-head">
          <span class="eyebrow yellow">${events.length} actes ubicats</span>
          <strong>Actes al mapa</strong>
        </div>
        ${events.length ? events.slice(0, 80).map(mapSideCard).join('') : '<div class="state-box"><h3>No hi ha actes amb coordenades</h3><p>Canvia els filtres o torna al programa.</p></div>'}
      </aside>
    </section>`;
  $('#mapCats')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filters.category = b.dataset.cat;
    renderMapa();
  });
  $('#resetMapView')?.addEventListener('click', () => {
    if (state.map && state._mapBounds?.length) {
      state.map.fitBounds(state._mapBounds, { padding: [48, 48], maxZoom: 15 });
    } else {
      renderStaticMap(events, true);
    }
  });
  $('#mapList')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-focus-map]');
    const card = e.target.closest('[data-map-id]');
    if (b) {
      selectMapEvent(Number(b.dataset.focusMap), true);
      return;
    }
    if (card && !e.target.closest('a, button')) selectMapEvent(Number(card.dataset.mapId), true);
  });
  $('#mapList')?.addEventListener('keydown', (e) => {
    if (!['Enter', ' '].includes(e.key)) return;
    if (e.target.closest('a, button')) return;
    const card = e.target.closest('[data-map-id]');
    if (!card) return;
    e.preventDefault();
    selectMapEvent(Number(card.dataset.mapId), true);
  });
  setTimeout(() => initMap(events), 80);
}

function mapSideCard(ev) {
  return `<article class="map-event-card ${state.selectedMapId === ev.id ? 'active' : ''}" data-map-id="${ev.id}" tabindex="0">
    <div class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</div>
    <strong>${escapeHTML(ev.title)}</strong>
    <p><span class="map-card-time">${escapeHTML(ev.time)}</span><span class="location-chip">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span></p>
    <div class="cta-row compact"><button class="btn btn-map btn-small" data-focus-map="${ev.id}" type="button">Centrar</button><a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}">Detall</a></div>
  </article>`;
}

function markerClass(cat) {
  if (cat === 'Música') return 'marker-musica';
  if (cat === 'Familiar') return 'marker-familiar';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'marker-tradicional';
  return 'marker-altres';
}

function markerLabel(cat) {
  if (cat === 'Música') return '♪';
  if (cat === 'Familiar') return '★';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'T';
  return '•';
}

function popupHTML(ev) {
  return `<div class="map-popup">
    <span class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
    <div class="popup-title">${escapeHTML(ev.title)}</div>
    <p>${escapeHTML(ev.time)} · ${escapeHTML(ev.location || '')}</p>
    <div class="popup-actions"><a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}">Veure detall</a></div>
  </div>`;
}

function initMap(events) {
  const mapEl = $('#mataroMap');
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  state.markers = [];
  state._mapBounds = [];
  if (!events.length) {
    mapEl.innerHTML = '<div class="state-box map-empty"><h3>No hi ha actes amb aquests filtres</h3><p>Canvia la categoria o torna al programa complet.</p></div>';
    return;
  }
  if (typeof L === 'undefined') {
    renderStaticMap(events, true, 'Leaflet no ha carregat', 'Mostrem una vista esquemàtica i mantenim la llista d’actes disponible.');
    return;
  }
  try {
    state.map = L.map('mataroMap', {
      scrollWheelZoom: true,
      zoomControl: false,
      preferCanvas: true
    }).setView([41.5398, 2.4449], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
      crossOrigin: true
    });
    let tileErrors = 0;
    tiles.on('tileerror', () => {
      tileErrors += 1;
      if (tileErrors >= 4) renderStaticMap(events, true, 'OpenStreetMap no respon', 'Mostrem una vista esquemàtica amb els mateixos actes ubicats.');
    });
    tiles.addTo(state.map);
    const bounds = [];
    events.forEach((ev) => {
      const point = [mapCoordinate(ev.lat), mapCoordinate(ev.lng)];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      bounds.push(point);
      const icon = L.divIcon({
        className: 'custom-marker-shell',
        html: `<div class="custom-marker ${markerClass(ev.cat)}" data-leaflet-marker-id="${ev.id}"><span>${markerLabel(ev.cat)}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -20]
      });
      const marker = L.marker(point, { icon, title: ev.title }).addTo(state.map);
      marker.bindPopup(popupHTML(ev), { closeButton: true, maxWidth: 260 });
      marker.on('click', () => selectMapEvent(ev.id, true));
      state.markers.push({ id: ev.id, marker, point });
    });
    state._mapBounds = bounds;
    if (bounds.length) state.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    setTimeout(() => {
      state.map?.invalidateSize(true);
      if (state.selectedMapId !== null) selectMapEvent(state.selectedMapId, false);
    }, 180);
    setTimeout(() => state.map?.invalidateSize(true), 700);
  } catch (err) {
    console.warn('Leaflet no s’ha pogut inicialitzar:', err);
    renderStaticMap(events, true);
  }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function showMapNotice(title, text) {
  const notice = $('#mapFallback');
  if (!notice) return;
  notice.innerHTML = `<h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>`;
  notice.classList.add('show');
  clearTimeout(showMapNotice.timer);
  showMapNotice.timer = setTimeout(() => notice.classList.remove('show'), 3200);
}

function renderStaticMap(events, showNotice = false, noticeTitle = 'Mapa esquemàtic carregat', noticeText = 'Mostrem els punts sobre una vista simplificada de Mataró.') {
  const mapEl = $('#mataroMap');
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  const valid = events.filter(hasValidMapPoint);
  if (!valid.length) {
    mapEl.innerHTML = '<div class="state-box map-empty"><h3>No hi ha actes amb coordenades vàlides</h3><p>La llista lateral es manté disponible per continuar navegant.</p></div>';
    if (showNotice) showMapNotice('Sense punts vàlids', 'No s’han trobat coordenades disponibles per aquests filtres.');
    return;
  }
  const lats = valid.map((ev) => mapCoordinate(ev.lat));
  const lngs = valid.map((ev) => mapCoordinate(ev.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;
  mapEl.innerHTML = `<div class="schematic-map" aria-label="Mapa esquemàtic de Mataró">
    <div class="schematic-grid"></div>
    <div class="schematic-road road-a"></div>
    <div class="schematic-road road-b"></div>
    <div class="schematic-road road-c"></div>
    <div class="schematic-sea">MAR</div>
    <div class="schematic-label centre">CENTRE</div>
    <div class="schematic-label port">PORT</div>
    ${valid.map((ev) => {
      const left = clamp(8 + ((mapCoordinate(ev.lng) - minLng) / lngSpan) * 84, 6, 92);
      const top = clamp(12 + (1 - ((mapCoordinate(ev.lat) - minLat) / latSpan)) * 74, 8, 86);
      return `<button class="schematic-pin custom-marker ${markerClass(ev.cat)} ${state.selectedMapId === ev.id ? 'active' : ''}" style="left:${left}%;top:${top}%" data-static-pin="${ev.id}" aria-label="${escapeHTML(ev.title)}"><span>${markerLabel(ev.cat)}</span></button>`;
    }).join('')}
  </div>`;
  if (showNotice) showMapNotice(noticeTitle, noticeText);
  mapEl.querySelectorAll('[data-static-pin]').forEach((pin) => {
    pin.addEventListener('click', () => selectMapEvent(Number(pin.dataset.staticPin), true));
  });
  state.markers = valid.map((ev) => ({ id: ev.id, el: mapEl.querySelector(`[data-static-pin="${ev.id}"]`) }));
  if (state.selectedMapId !== null) selectMapEvent(state.selectedMapId, false);
}

function selectMapEvent(id, openPopup = false) {
  state.selectedMapId = id;
  const ev = state.events.find((item) => item.id === id);
  const found = state.markers.find((m) => m.id === id);
  document.querySelectorAll('[data-map-id]').forEach((el) => {
    const active = Number(el.dataset.mapId) === id;
    el.classList.toggle('active', active);
    if (active && openPopup) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  document.querySelectorAll('[data-static-pin], .custom-marker').forEach((el) => {
    const markerId = Number(el.dataset.staticPin || el.dataset.leafletMarkerId || -1);
    el.classList.toggle('active', markerId === id);
  });
  if (ev && found?.marker && state.map) {
    state.map.setView([ev.lat, ev.lng], 16, { animate: true });
    if (openPopup) found.marker.openPopup();
  }
  if (found?.el && openPopup) {
    showMapNotice(ev?.title || 'Acte seleccionat', `${ev?.time || ''} · ${ev?.location || ''}`);
  }
}

function renderDetail(id) {
  const ev = state.events.find((item) => String(item.id) === String(id));
  if (!ev) {
    app.innerHTML = errorState('Acte no trobat', 'Aquest acte no existeix o no s’ha pogut importar.');
    return;
  }
  app.innerHTML = `
    <section class="detail-hero">
      ${ev.image ? `<img src="${escapeHTML(ev.image)}" alt="${escapeHTML(ev.title)}">` : ''}
      <div class="detail-hero-content">
        <span class="eyebrow ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
        <h1 class="detail-title">${escapeHTML(ev.title)}<span class="dot">.</span></h1>
        <div class="info-strip"><span class="reward-highlight">🕒 ${escapeHTML(ev.date_detail || ev.time)}</span><span class="info-highlight">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span></div>
      </div>
    </section>
    <section class="section detail-layout">
      <article class="content-card card">
        <h3>Sobre l’esdeveniment</h3>
        <p class="description">${escapeHTML(ev.longText)}</p>
        <div class="cta-row">
          <button class="btn btn-primary primary-highlight" type="button" id="goMap" data-event-id="${escapeHTML(ev.id)}">Com arribar</button>
          <a class="btn btn-ghost" href="#programa">Tornar al programa</a>
        </div>
      </article>
      <aside class="detail-side">
        <div class="card content-card info-highlight"><span class="eyebrow yellow">Resum</span><p><strong>Hora:</strong> ${escapeHTML(ev.time)}</p><p><strong>Lloc:</strong> ${escapeHTML(ev.location || 'Pendent')}</p><p><strong>Categoria:</strong> ${escapeHTML(ev.cat)}</p></div>
        <div class="side-map info-highlight" id="detailMap" aria-label="Mapa petit de l’acte"></div>
      </aside>
    </section>`;
  $('#goMap')?.addEventListener('click', handleDirectionsClick);
  setTimeout(() => initDetailMap(ev), 100);
}

function googleMapsRouteUrl(lat, lng, origin = null) {
  const destination = `${lat},${lng}`;
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'walking' });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function showNoLocationMessage() {
  toast('No hi ha ubicació disponible per aquest acte');
}

function openMapWindow(url) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) toast('El navegador ha bloquejat la finestra nova');
  return opened;
}

function openDirections(lat, lng, label = '') {
  const valid = getValidCoordinates({ lat, lng });
  if (!valid) {
    showNoLocationMessage();
    return;
  }
  const fallbackUrl = googleMapsRouteUrl(valid.lat, valid.lng);
  const opened = openMapWindow(fallbackUrl);
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const originUrl = googleMapsRouteUrl(valid.lat, valid.lng, pos.coords);
      if (opened && !opened.closed) opened.location.href = originUrl;
    },
    () => {},
    { enableHighAccuracy: false, timeout: 1200, maximumAge: 300000 }
  );
}

function handleDirectionsClick(event) {
  event?.preventDefault();
  const eventId = event?.currentTarget?.dataset?.eventId;
  const ev = state.events.find((item) => String(item.id) === String(eventId));
  const coords = getValidCoordinates(ev);
  if (!coords) {
    showNoLocationMessage();
    return;
  }
  openDirections(coords.lat, coords.lng, ev?.title || '');
}

function initDetailMap(ev) {
  const detailEl = $('#detailMap');
  if (!detailEl) return;
  if (!hasValidMapPoint(ev)) {
    detailEl.innerHTML = '<div class="state-box map-empty"><h3>Ubicació pendent</h3></div>';
    return;
  }
  if (typeof L === 'undefined') {
    detailEl.innerHTML = '<div class="state-box map-empty"><h3>Mapa no disponible</h3><p>Obre el mapa general per consultar la llista d’actes.</p></div>';
    return;
  }
  if (state.detailMap) state.detailMap.remove();
  state.detailMap = L.map('detailMap', { zoomControl: false, dragging: true, scrollWheelZoom: false }).setView([ev.lat, ev.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '' }).addTo(state.detailMap);
  L.marker([ev.lat, ev.lng]).addTo(state.detailMap);
  setTimeout(() => state.detailMap?.invalidateSize(), 250);
}

function renderMinisantes() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  const logged = Boolean(state.user);
  const guestNote = state.guest ? `<div class="guest-banner mini-guest-banner info-highlight">👀 <strong>Mode convidat:</strong> pots provar Minisantes, però el progrés, les monedes i les recompenses no es guardaran.</div>` : '';
  const rewardPanel = logged
    ? `<a class="mini-pill-link" href="#botiga">🏪 Botiga</a><a class="mini-pill-link" href="#inventari">🎒 Inventari</a><a class="mini-pill-link" href="#perfil">👤 Perfil</a>`
    : `<a class="mini-pill-link" href="#login">✨ Crear compte</a><button class="mini-pill-link as-button" id="exitGuest">Sortir de convidat</button>`;
  const coins = logged ? money(state.user.coins) : '—';
  const streak = logged ? '4' : '0';
  const unlocked = logged ? `${state.inventory.length || 0}/${state.rewards.length || 12}` : '0/12';
  const featuredRewards = state.rewards.slice(0, 3);

  app.innerHTML = `
    <div class="minisantes-world playful-mini super-mini">
      ${guestNote}
      <div class="mini-deco mini-deco-a" aria-hidden="true">★</div>
      <div class="mini-deco mini-deco-b" aria-hidden="true">✦</div>
      <div class="mini-deco mini-deco-c" aria-hidden="true">●</div>

      <section class="mini-hero-remake mini-hero-ultra mini-hero-reborn" aria-labelledby="miniTitle">
        <div class="mini-hero-copy mini-hero-panel">
          <span class="mini-super-badge">★ Nou · MiniSantes</span>
          <h1 id="miniTitle">La festa també<br>es <span>juga</span></h1>
          <p class="lead">Explora MiniSantes amb minijocs, monedes, reptes i premis pensats perquè els infants visquin Les Santes d’una manera divertida.</p>
          <div class="mini-hero-stats" aria-label="Resum de MiniSantes">
            <article><span>🎮</span><strong>${MINISANTES_GAMES.length}</strong><small>minijocs</small></article>
            <article><span>🎁</span><strong>${state.rewards.length || 8}</strong><small>premis</small></article>
            <article><span>⭐</span><strong>${logged ? escapeHTML(state.user.level) : '4'}</strong><small>nivells</small></article>
          </div>
          <div class="mini-actions mini-hero-actions">
            <button class="btn btn-primary primary-highlight mini-main-play" data-play="castell">▶ Jugar ara</button>
            <a class="mini-secondary-cta" href="${logged ? '#botiga' : '#login'}">Explorar premis</a>
          </div>
          <div class="mini-hero-links" aria-label="Accessos MiniSantes">${rewardPanel}</div>
        </div>
        <div class="mini-hero-scene" aria-hidden="true">
          <div class="mini-scene-glow glow-red"></div>
          <div class="mini-scene-glow glow-blue"></div>
          <div class="mini-scene-panel">
            <div class="mini-scene-sky">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="mini-scene-sun"></div>
            <div class="mini-scene-cloud cloud-left"></div>
            <div class="mini-scene-cloud cloud-right"></div>
            <div class="mini-scene-ground"></div>
            <div class="mini-scene-castle">
              <i></i><i></i><i></i>
              <b></b>
            </div>
            <div class="mini-mascot-card"><span>🧒</span><strong>Repte!</strong></div>
            <div class="mini-prize-orb">🏆</div>
            <div class="mini-game-token token-a">🎮</div>
            <div class="mini-game-token token-b">🎭</div>
            <div class="mini-coin-orb coin-a">★</div>
            <div class="mini-coin-orb coin-b">●</div>
            <div class="mini-coin-orb coin-c">✦</div>
          </div>
          <div class="mini-floating-card mini-card-score"><span>+50</span><strong>monedes</strong></div>
          <div class="mini-floating-card mini-card-level"><span>⭐</span><strong>Nivell 4</strong></div>
          <div class="mini-scene-ribbon">Juga · Guanya · Celebra</div>
        </div>
      </section>

      <section class="section mini-dashboard" aria-label="Estat de joc">
        <article class="mini-status-card red">
          <span>🧒</span><div><strong>${logged ? escapeHTML(state.user.display_name || state.user.username) : 'Convidat'}</strong><p>${logged ? 'Progrés guardat' : 'Prova sense guardar'}</p></div>
        </article>
        <article class="mini-status-card yellow reward-highlight">
          <span>🪙</span><div><strong>${coins}</strong><p>monedes</p></div>
        </article>
        <article class="mini-status-card blue info-highlight">
          <span>🔥</span><div><strong>${streak}</strong><p>dies de ratxa</p></div>
        </article>
        <article class="mini-status-card green">
          <span>🎁</span><div><strong>${unlocked}</strong><p>premis</p></div>
        </article>
      </section>

      <section class="section mini-mission-hero reward-highlight">
        <div>
          <span class="eyebrow green">Missió del dia</span>
          <h3>Completa 2 minijocs i aconsegueix 50 monedes extra</h3>
          <p>${state.guest ? 'En mode convidat pots provar la missió, però no quedarà guardada.' : 'El progrés queda sincronitzat amb el teu perfil i inventari.'}</p>
        </div>
        <div class="mini-mission-progress" aria-label="Progrés de la missió"><strong>1/2</strong><span><i></i></span></div>
      </section>

      <section class="section mini-progress-lane" aria-label="Progrés i recompenses">
        <article class="mini-progress-card reward-highlight">
          <span>🪙</span><div><strong>Progrés</strong><p>Juga, suma monedes i desbloqueja premis especials.</p></div>
        </article>
        <article class="mini-progress-card info-highlight">
          <span>🧭</span><div><strong>Explora Mataró</strong><p>Combina minijocs amb els actes del mapa.</p></div>
        </article>
        <article class="mini-progress-card primary-highlight">
          <span>🎯</span><div><strong>Repte ràpid</strong><p>Supera el teu millor resultat d’avui.</p></div>
        </article>
      </section>

      <section class="section mini-games-panel mini-games-ultra">
        <div class="section-head">
          <div><h3>Jocs destacats</h3><p>Escull una aventura i juga amb la cultura popular de Mataró.</p></div>
          <a href="#jocs">Veure tots els jocs →</a>
        </div>
        <div class="grid-3 game-grid mini-game-grid">
          ${MINISANTES_GAMES.slice(0, 3).map(gameCard).join('')}
        </div>
      </section>

      <section class="section mini-rewards-showcase">
        <div class="section-head">
          <div><h3>Recompenses destacades</h3><p>Premis digitals que pots desbloquejar jugant.</p></div>
          <a href="${logged ? '#botiga' : '#login'}">${logged ? 'Anar a la botiga' : 'Crear compte'} →</a>
        </div>
        <div class="mini-reward-grid">
          ${(featuredRewards.length ? featuredRewards : [{ image: '🎁', name: 'Premi sorpresa', cost: 500, type: 'Premi' }, { image: '🪙', name: 'Bonus de monedes', cost: 750, type: 'Bonus' }, { image: '⭐', name: 'Insígnia especial', cost: 1000, type: 'Col·lecció' }]).map((r) => `<article class="mini-reward-card reward-highlight"><span class="eyebrow yellow">${escapeHTML(r.type || 'Premi')}</span><div>${r.image || '🎁'}</div><strong>${escapeHTML(r.name)}</strong><p>● ${money(r.cost || 0)} monedes</p></article>`).join('')}
        </div>
      </section>

      <section class="section mini-bottom-grid mini-final-grid">
        <article class="mini-info-card blue info-highlight"><span>🏆</span><div><strong>Rànquing setmanal</strong><p>Ets al top 10% dels jugadors!</p></div></article>
        <article class="mini-info-card yellow reward-highlight"><span>⚡</span><div><strong>Pròxim premi</strong><p>Falten 750 monedes</p></div></article>
        <article class="mini-info-card pink"><span>⭐</span><div><strong>Nivell 4</strong><p>Col·leccionista expert</p></div></article>
      </section>
    </div>`;

  $('#exitGuest')?.addEventListener('click', () => {
    state.guest = false;
    sessionStorage.removeItem(STORAGE_GUEST);
    toast('Has sortit del mode convidat');
    renderMinisantesAccess();
    updateHeader();
  });
  bindGameButtons();
}

function renderMemoryGame() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  clearInterval(state.memoryTimer);
  const images = [
    'bruixa.png',
    'diable.png',
    'follet.png',
    'moro.png',
    'mulata.png',
    'patufet.png',
    'vella.png',
    'xines.png'
  ];
  const labels = ['Bruixa', 'Diable', 'Follet', 'Moro', 'Mulata', 'Patufet', 'Vella', 'Xines'];
  const game = {
    mode: 'easy',
    deck: [],
    flipped: [],
    matched: new Set(),
    locked: false,
    active: false,
    moves: 0,
    score: 0,
    combo: 0,
    coins: 0,
    elapsed: 0
  };

  app.innerHTML = `
    <section class="memory-shell" aria-labelledby="memoryTitle">
      <div class="memory-head">
        <div>
          <a class="mini-pill-link memory-back" href="#minisantes">← MiniSantes</a>
          <span class="eyebrow yellow">Joc de memòria</span>
          <h2 id="memoryTitle">Troba les parelles<span class="dot">.</span></h2>
          <p class="lead">Destapa personatges de Les Santes, recorda on són i completa totes les parelles amb el mínim d’intents.</p>
        </div>
        <div class="memory-mode" role="group" aria-label="Dificultat">
          <button class="chip active" type="button" data-memory-mode="easy">Fàcil · 4x3</button>
          <button class="chip" type="button" data-memory-mode="hard">Difícil · 4x4</button>
        </div>
      </div>

      <div class="memory-stage">
        <div class="memory-stars" id="memoryStars" aria-hidden="true"></div>
        <div class="memory-confetti" id="memoryConfetti" aria-hidden="true"></div>
        <div class="memory-topbar">
          <strong>Les Parelles Santeres</strong>
          <div><span id="memoryScore">0 pts</span><span id="memoryTime">00:00</span></div>
        </div>
        <div class="memory-stats" aria-label="Estadístiques del joc">
          <article><strong id="memoryMoves">0</strong><span>Intents</span></article>
          <article><strong id="memoryPairs">0/0</strong><span>Parelles</span></article>
          <article><strong id="memoryCombo">x1</strong><span>Combo</span></article>
          <article><strong id="memoryCoins">0</strong><span>Monedes</span></article>
        </div>
        <div class="memory-level" id="memoryLevel">Nivell fàcil</div>
        <div class="memory-grid-wrap"><div class="memory-grid" id="memoryGrid"></div></div>
        <div class="memory-overlay" id="memoryOverlay">
          <div>
            <strong>Memoritza les cartes!</strong>
            <span>Comença en <b id="memoryCountdown">3</b></span>
          </div>
        </div>
        <div class="memory-end" id="memoryEnd" aria-live="polite"></div>
      </div>
    </section>`;

  function memoryEl(id) {
    return document.getElementById(id);
  }

  function fmtT(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function makeStars() {
    const area = memoryEl('memoryStars');
    area.innerHTML = Array.from({ length: 55 }, () => {
      const size = 1 + Math.random() * 3;
      return `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${size}px;height:${size}px"></i>`;
    }).join('');
  }

  function updateHUD() {
    memoryEl('memoryScore').textContent = `${game.score} pts`;
    memoryEl('memoryMoves').textContent = game.moves;
    memoryEl('memoryPairs').textContent = `${Math.floor(game.matched.size / 2)}/${game.deck.length / 2}`;
    memoryEl('memoryCombo').textContent = `x${game.combo || 1}`;
    memoryEl('memoryCoins').textContent = game.coins;
  }

  function launchConfetti() {
    const colors = ['#ffd100', '#e10600', '#35d07f', '#38bdf8', '#ff922b', '#fff8ef'];
    memoryEl('memoryConfetti').innerHTML = Array.from({ length: 70 }, () =>
      `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]}"></i>`
    ).join('');
    setTimeout(() => {
      const layer = memoryEl('memoryConfetti');
      if (layer) layer.innerHTML = '';
    }, 3200);
  }

  async function saveMemoryProgress(finalScore, earnedCoins) {
    if (!state.user || earnedCoins <= 0) return;
    try {
      const data = await api('/progress', {
        method: 'POST',
        body: JSON.stringify({
          user_id: state.user.id,
          game_key: 'parelles',
          score: finalScore,
          coins: earnedCoins
        })
      });
      state.user = data.user;
      state.inventory = data.inventory || [];
      state.progress = data.progress || [];
      updateHeader();
      toast(`Has guanyat ${earnedCoins} monedes!`);
    } catch (err) {
      toast(err.message);
    }
  }

  function endGame() {
    clearInterval(state.memoryTimer);
    game.active = false;
    const timeBonus = Math.max(0, (game.mode === 'easy' ? 120 : 180) - game.elapsed) * 5;
    const moveBonus = Math.max(0, (game.mode === 'easy' ? 24 : 36) - game.moves) * 20;
    game.coins = game.mode === 'easy' ? 60 : 100;
    game.score += timeBonus + moveBonus;
    updateHUD();
    launchConfetti();
    memoryEl('memoryEnd').innerHTML = `
      <div class="memory-end-box">
        <div class="memory-crown">🏆</div>
        <h3>Has guanyat!</h3>
        <p>${game.mode === 'easy' ? 'Has completat el nivell fàcil.' : 'Has completat el nivell difícil.'}</p>
        <div class="memory-result"><span>Puntuació</span><strong>${money(game.score)} pts</strong></div>
        <div class="memory-result"><span>Temps</span><strong>${fmtT(game.elapsed)}</strong></div>
        <div class="memory-result"><span>Intents</span><strong>${game.moves}</strong></div>
        <div class="memory-result"><span>Monedes</span><strong>${game.coins}</strong></div>
        <button class="btn btn-primary primary-highlight" type="button" id="memoryReplay">Tornar a jugar</button>
        <button class="btn btn-ghost" type="button" id="memoryNext">Canviar nivell</button>
        <a class="btn btn-yellow reward-highlight" href="#minisantes">Tornar a MiniSantes</a>
      </div>`;
    memoryEl('memoryEnd').classList.add('show');
    memoryEl('memoryReplay')?.addEventListener('click', startGame);
    memoryEl('memoryNext')?.addEventListener('click', () => {
      setMode(game.mode === 'easy' ? 'hard' : 'easy');
    });
    saveMemoryProgress(game.score, game.coins);
    if (!state.user && state.guest) toast('Mode convidat: resultat no guardat');
  }

  function flip(index) {
    if (game.locked || !game.active || game.flipped.includes(index) || game.matched.has(game.deck[index].uid)) return;
    memoryEl(`memoryCard${index}`)?.classList.add('flipped');
    game.flipped.push(index);
    if (game.flipped.length !== 2) return;

    game.locked = true;
    game.moves++;
    const first = game.deck[game.flipped[0]];
    const second = game.deck[game.flipped[1]];
    if (first.id === second.id) {
      game.combo++;
      game.score += 100 * game.combo;
      game.matched.add(first.uid);
      game.matched.add(second.uid);
      setTimeout(() => {
        game.flipped.forEach((cardIndex) => memoryEl(`memoryCard${cardIndex}`)?.classList.add('matched'));
        game.flipped = [];
        game.locked = false;
        updateHUD();
        if (game.matched.size === game.deck.length) endGame();
      }, 280);
    } else {
      game.combo = 0;
      setTimeout(() => {
        game.flipped.forEach((cardIndex) => memoryEl(`memoryCard${cardIndex}`)?.classList.remove('flipped'));
        game.flipped = [];
        game.locked = false;
        updateHUD();
      }, 720);
    }
    updateHUD();
  }

  function startGame() {
    clearInterval(state.memoryTimer);
    clearInterval(state.memoryPreviewTimer);
    Object.assign(game, {
      deck: [],
      flipped: [],
      matched: new Set(),
      locked: true,
      active: false,
      moves: 0,
      score: 0,
      combo: 0,
      coins: 0,
      elapsed: 0
    });
    memoryEl('memoryEnd').classList.remove('show');
    memoryEl('memoryTime').textContent = '00:00';
    memoryEl('memoryLevel').textContent = game.mode === 'easy' ? 'Nivell fàcil' : 'Nivell difícil';
    const pairs = game.mode === 'easy' ? 6 : 8;
    const rows = game.mode === 'easy' ? 3 : 4;
    const selected = images.slice(0, pairs).map((img, id) => ({ id, img, label: labels[id] }));
    game.deck = shuffle([...selected, ...selected].map((card, uid) => ({ ...card, uid })));
    const grid = memoryEl('memoryGrid');
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.classList.toggle('hard', game.mode === 'hard');
    grid.innerHTML = game.deck.map((card, index) => `
      <button class="memory-card flipped" id="memoryCard${index}" type="button" data-card="${index}" aria-label="Carta ${index + 1}">
        <span class="memory-card-back"><b>🌹</b><i></i></span>
        <span class="memory-card-front"><img src="img/memory/${escapeHTML(card.img)}" alt="${escapeHTML(card.label)}"><small>${escapeHTML(card.label)}</small></span>
      </button>`).join('');
    updateHUD();

    let countdown = 3;
    memoryEl('memoryCountdown').textContent = countdown;
    memoryEl('memoryOverlay').classList.remove('hidden');
    state.memoryPreviewTimer = setInterval(() => {
      if (!memoryEl('memoryCountdown')) {
        clearInterval(state.memoryPreviewTimer);
        return;
      }
      countdown--;
      memoryEl('memoryCountdown').textContent = countdown;
      if (countdown > 0) return;
      clearInterval(state.memoryPreviewTimer);
      game.deck.forEach((_, index) => memoryEl(`memoryCard${index}`)?.classList.remove('flipped'));
      setTimeout(() => {
        if (!memoryEl('memoryOverlay')) return;
        memoryEl('memoryOverlay').classList.add('hidden');
        game.locked = false;
        game.active = true;
        state.memoryTimer = setInterval(() => {
          game.elapsed++;
          memoryEl('memoryTime').textContent = fmtT(game.elapsed);
        }, 1000);
      }, 350);
    }, 1000);
  }

  function setMode(mode) {
    game.mode = mode;
    app.querySelectorAll('[data-memory-mode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.memoryMode === mode));
    startGame();
  }

  app.querySelectorAll('[data-memory-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.memoryMode)));
  memoryEl('memoryGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-card]');
    if (card) flip(Number(card.dataset.card));
  });
  makeStars();
  startGame();
}

function renderMinisantesAccess() {
  app.innerHTML = `
    <section class="login-screen">
      <div class="access-grid">
        <article class="card login-card">
          <span class="eyebrow yellow">Accés especial</span>
          <h2>Entra a Minisantes<span class="dot">.</span></h2>
          <p>Inicia sessió o registra’t per guardar monedes, inventari i progrés.</p>
          <div class="cta-row"><a class="btn btn-primary primary-highlight" href="#login">Iniciar sessió / registrar-se</a></div>
          <p class="hint">Usuari de prova: <strong>biel09</strong> · contrasenya: <strong>santes2026</strong></p>
        </article>
        <article class="card login-card guest-card">
          <span class="eyebrow green">Mode convidat</span>
          <h2>Prova els jocs</h2>
          <p>Podràs veure Minisantes i navegar pels minijocs, però el progrés no es guardarà.</p>
          <button class="btn btn-yellow reward-highlight" id="guestBtn">Entrar com a convidat</button>
        </article>
      </div>
    </section>`;
  $('#guestBtn')?.addEventListener('click', () => {
    state.guest = true;
    sessionStorage.setItem(STORAGE_GUEST, '1');
    updateHeader();
    toast('Mode convidat: el progrés no es guardarà');
    renderMinisantes();
  });
}

function gameByKey(key) {
  return MINISANTES_GAMES.find((game) => game.key === key);
}

function gameCard(game) {
  const available = game.status === 'Disponible';
  return `<article class="game-card mini-game-card ${game.theme} ${game.accent} ${available ? 'available' : 'soon-game'}">
    <div class="game-art" aria-hidden="true"><span>${escapeHTML(game.icon)}</span></div>
    <div class="game-content">
      <div class="game-badges"><span>${escapeHTML(game.badge)}</span><span>Guanya ${escapeHTML(game.prize)} ●</span></div>
      <h3>${escapeHTML(game.title)}</h3>
      <p>${escapeHTML(game.subtitle)}</p>
      <button class="btn btn-primary primary-highlight btn-small" data-play="${escapeHTML(game.key)}" ${available ? '' : 'data-soon="1"'}>${available ? 'Jugar ▸' : 'Properament'}</button>
    </div>
  </article>`;
}

function renderAllGames() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  const available = MINISANTES_GAMES.filter((game) => game.status === 'Disponible').length;
  app.innerHTML = `
    ${pageTitle('Tots els jocs', 'Catàleg MiniSantes amb minijocs disponibles i propers reptes inspirats en Les Santes.', '<a class="btn btn-ghost" href="#minisantes">Tornar a MiniSantes</a>')}
    ${state.guest ? '<div class="guest-banner mini-guest-banner info-highlight">👀 <strong>Mode convidat:</strong> pots jugar, però el progrés i les monedes no es guardaran.</div>' : ''}
    <section class="games-catalog-head">
      <article><strong>${MINISANTES_GAMES.length}</strong><span>jocs totals</span></article>
      <article><strong>${available}</strong><span>disponibles</span></article>
      <article><strong>${MINISANTES_GAMES.length - available}</strong><span>properament</span></article>
    </section>
    <section class="grid-3 game-grid mini-game-grid games-catalog">
      ${MINISANTES_GAMES.map(gameCard).join('')}
    </section>`;
  bindGameButtons();
}

function bindGameButtons() {
  app.querySelectorAll('[data-play]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.play;
    if (key === 'castell') {
      location.hash = '#castell';
      return;
    }
    if (key === 'parelles') {
      location.hash = '#memory';
      return;
    }
    if (key === 'confeti') {
      location.hash = '#confeti';
      return;
    }
    if (['gegants', 'correfoc', 'campanes'].includes(key)) {
      location.hash = `#${key}`;
      return;
    }
    const game = gameByKey(key);
    toast(game ? `${game.title}: properament!` : 'Minijoc en estat prototip. Properament!');
  }));
}

async function saveGameProgress(gameKey, finalScore, earnedCoins, message = '') {
  if (!state.user || earnedCoins <= 0) return;
  try {
    const data = await api('/progress', {
      method: 'POST',
      body: JSON.stringify({
        user_id: state.user.id,
        game_key: gameKey,
        score: finalScore,
        coins: earnedCoins
      })
    });
    state.user = data.user;
    state.inventory = data.inventory || [];
    state.progress = data.progress || [];
    updateHeader();
    if (message) toast(message);
  } catch (err) {
    toast(err.message);
  }
}

function clearOfficialGame() {
  if (typeof state.officialGameCleanup === 'function') {
    state.officialGameCleanup();
    state.officialGameCleanup = null;
  }
}

function officialCoins(score, divisor) {
  return Math.max(0, Math.min(260, Math.floor(score / divisor)));
}

function renderConfetiGame() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  clearOfficialGame();

  const assets = {
    gegant: { src: 'img/confeti/gegant.png', points: 10, negative: false, label: 'Gegant' },
    robafaves: { src: 'img/confeti/robafaves.png', points: 8, negative: false, label: 'Robafaves' },
    drac: { src: 'img/confeti/drac.png', points: -8, negative: true, label: 'Drac' },
    diable: { src: 'img/confeti/diable.png', points: -5, negative: true, label: 'Diable' }
  };

  app.innerHTML = `
    <section class="confeti-game-shell" aria-labelledby="confetiTitle">
      <div id="confetiGameRoot" class="confeti-game-root" aria-label="Joc Atrapa el Confeti">
        <canvas id="confetiBgCanvas" aria-hidden="true"></canvas>
        <canvas id="confetiGameCanvas"></canvas>
        <div id="confetiFlash" class="confeti-flash" aria-hidden="true"></div>
        <section class="confeti-ui">
          <header class="confeti-header">
            <a class="confeti-exit" href="#jocs" aria-label="Sortir del joc">×</a>
            <span id="confetiTitle" class="confeti-title"><img src="img/confeti/drac.png" alt=""> Atrapa el Confeti</span>
            <span id="confetiScore" class="confeti-score" aria-label="Puntuació">0</span>
          </header>
          <div class="confeti-timer"><span id="confetiTimer"></span></div>
          <div id="confetiLives" class="confeti-lives" aria-label="Vides"></div>
        </section>
        <div id="confetiFeedback" class="confeti-feedback" aria-hidden="true"></div>
        <div id="confetiCombo" class="confeti-combo" aria-live="polite"></div>
        <section id="confetiStart" class="confeti-screen">
          <div class="confeti-strip">
            <img src="img/confeti/gegant.png" alt="Gegant">
            <img src="img/confeti/robafaves.png" alt="Robafaves">
            <img src="img/confeti/drac.png" alt="Drac">
            <img src="img/confeti/diable.png" alt="Diable">
          </div>
          <p class="confeti-banner">MiniSantes · Joc ràpid</p>
          <h2>Atrapa el Confeti</h2>
          <p>Toca els personatges bons per sumar punts i evita el Drac i els Diables. Tens 18 segons!</p>
          <div class="confeti-legend">
            <div class="good"><img src="img/confeti/gegant.png" alt=""><span>Gegant +10</span></div>
            <div class="good"><img src="img/confeti/robafaves.png" alt=""><span>Robafaves +8</span></div>
            <div class="bad"><img src="img/confeti/drac.png" alt=""><span>Drac -1 vida</span></div>
            <div class="bad"><img src="img/confeti/diable.png" alt=""><span>Diable -5</span></div>
          </div>
          <button class="confeti-main-btn" id="confetiStartBtn" type="button">Començar ▶</button>
        </section>
        <section id="confetiEnd" class="confeti-screen hidden" aria-live="polite">
          <div class="confeti-trophy">🏆</div>
          <h2>Joc acabat!</h2>
          <div class="confeti-results">
            <article><strong id="confetiEndScore">0</strong><span>Punts</span></article>
            <article><strong id="confetiEndCaught">0</strong><span>Atrapats</span></article>
            <article><strong id="confetiEndCombo">0</strong><span>Max combo</span></article>
          </div>
          <p id="confetiEndCoins" class="confeti-coins">🪙 0 monedes guanyades</p>
          <button class="confeti-main-btn" id="confetiReplay" type="button">Tornar a jugar</button>
          <a class="confeti-secondary-btn" href="#jocs">Sortir</a>
        </section>
      </div>
    </section>`;

  const root = $('#confetiGameRoot');
  const bgCanvas = $('#confetiBgCanvas');
  const gameCanvas = $('#confetiGameCanvas');
  const bgCtx = bgCanvas.getContext('2d');
  const ctx = gameCanvas.getContext('2d');
  const images = {};
  const stars = Array.from({ length: 95 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.7 + 0.45,
    a: Math.random() * Math.PI * 2,
    c: Math.random() > .65 ? '#ffd100' : (Math.random() > .5 ? '#38bdf8' : '#ffffff')
  }));
  let objects = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let combo = 0;
  let maxCombo = 0;
  let caught = 0;
  let timeLeft = 18;
  let level = 1;
  let spawnTimer = 0;
  let difficultyTimer = 0;
  let active = false;
  let ended = false;
  let lastTime = 0;
  let raf = null;
  let bgRaf = null;
  let saved = false;

  const el = (id) => document.getElementById(id);
  const width = () => root.getBoundingClientRect().width;
  const height = () => root.getBoundingClientRect().height;
  const rgba = (hex, a) => {
    const v = hex.replace('#', '');
    return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
  };

  function resize() {
    const rect = root.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    [bgCanvas, gameCanvas].forEach((canvas) => {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loadImages() {
    return Promise.all(Object.entries(assets).map(([key, def]) => new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = def.src;
      images[key] = img;
    })));
  }

  function updateHUD() {
    el('confetiScore').textContent = score;
    el('confetiTimer').style.width = `${Math.max(0, timeLeft / 18) * 100}%`;
    el('confetiLives').innerHTML = Array.from({ length: 3 }, (_, i) => `<span>${i < lives ? '❤️' : '🖤'}</span>`).join('');
  }

  function drawBackground() {
    const w = width();
    const h = height();
    bgCtx.clearRect(0, 0, w, h);
    const g = bgCtx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#260608');
    g.addColorStop(.48, '#130506');
    g.addColorStop(1, '#070304');
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, w, h);
    const glow = bgCtx.createRadialGradient(w * .22, h * .12, 0, w * .22, h * .12, w * .64);
    glow.addColorStop(0, 'rgba(255,209,0,.16)');
    glow.addColorStop(1, 'transparent');
    bgCtx.fillStyle = glow;
    bgCtx.fillRect(0, 0, w, h);
    const blue = bgCtx.createRadialGradient(w * .82, h * .64, 0, w * .82, h * .64, w * .72);
    blue.addColorStop(0, 'rgba(30,144,255,.18)');
    blue.addColorStop(1, 'transparent');
    bgCtx.fillStyle = blue;
    bgCtx.fillRect(0, 0, w, h);
    stars.forEach((s) => {
      s.a += 0.02;
      bgCtx.fillStyle = rgba(s.c, 0.25 + Math.sin(s.a) * 0.12);
      bgCtx.beginPath();
      bgCtx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      bgCtx.fill();
    });
    bgRaf = requestAnimationFrame(drawBackground);
  }

  function spawnObject() {
    const isNegative = Math.random() < Math.min(0.12 + level * 0.045, 0.36);
    const keys = isNegative ? ['drac', 'diable'] : ['gegant', 'robafaves'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const def = assets[key];
    const r = isNegative ? 22 + Math.random() * 18 : 24 + Math.random() * 18;
    objects.push({
      key,
      def,
      x: r * 1.5 + Math.random() * (width() - r * 3),
      y: -r * 2.6,
      r,
      vx: (Math.random() - 0.5) * (1.3 + level * .15),
      vy: 1.55 + level * 0.35 + Math.random() * 0.95,
      rot: (Math.random() - .5) * .35,
      rotV: (Math.random() - .5) * .055,
      wobble: Math.random() * Math.PI * 2,
      tapped: false,
      tapAlpha: 1,
      tapScale: 1
    });
  }

  function drawObject(o) {
    const img = images[o.key];
    ctx.save();
    ctx.globalAlpha = o.tapped ? Math.max(0, o.tapAlpha) : 1;
    ctx.translate(o.x, o.y);
    ctx.scale(o.tapped ? o.tapScale : 1, o.tapped ? o.tapScale : 1);
    ctx.rotate(o.rot);
    const size = o.r * (o.def.negative ? 2.7 : 2.45);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * .75);
    glow.addColorStop(0, o.def.negative ? 'rgba(225,6,0,.28)' : 'rgba(255,209,0,.25)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * .75, 0, Math.PI * 2);
    ctx.fill();
    if (img?.complete && img.naturalWidth) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = o.def.negative ? '#e10600' : '#ffd100';
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function createParticles(x, y, good = true) {
    const colors = good ? ['#ffd100', '#ffffff', '#38bdf8', '#ff563a'] : ['#e10600', '#ff563a', '#2a0505'];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 3.4;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: colors[Math.floor(Math.random() * colors.length)], s: 3 + Math.random() * 5 });
    }
  }

  function floatingScore(x, y, text, color) {
    const item = document.createElement('div');
    item.className = 'confeti-floating-score';
    item.textContent = text;
    item.style.left = `${Math.min(Math.max(x - 28, 8), width() - 96)}px`;
    item.style.top = `${Math.max(y - 18, 74)}px`;
    item.style.color = color;
    el('confetiFeedback').appendChild(item);
    setTimeout(() => item.remove(), 950);
  }

  function flash(color) {
    const layer = el('confetiFlash');
    layer.style.background = color;
    layer.style.opacity = '.42';
    clearTimeout(layer._timer);
    layer._timer = setTimeout(() => { layer.style.opacity = '0'; }, 160);
  }

  function showCombo() {
    const banner = el('confetiCombo');
    banner.textContent = `Combo x${Math.floor(combo / 3) + 1}! +5`;
    banner.classList.add('show');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => banner.classList.remove('show'), 900);
  }

  function handleTap(clientX, clientY) {
    if (!active) return;
    const rect = gameCanvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.tapped) continue;
      const dx = sx - o.x;
      const dy = sy - o.y;
      if (dx * dx + dy * dy > (o.r * 1.75) ** 2) continue;
      o.tapped = true;
      createParticles(o.x, o.y, !o.def.negative);
      if (o.def.negative) {
        score = Math.max(0, score + o.def.points);
        combo = 0;
        lives = Math.max(0, lives - 1);
        floatingScore(o.x, o.y, String(o.def.points), '#ff563a');
        flash('#e10600');
        if (navigator.vibrate) navigator.vibrate(60);
        if (lives === 0) setTimeout(endGame, 380);
      } else {
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        caught++;
        const bonus = combo % 3 === 0 ? 5 : 0;
        score += o.def.points + bonus;
        floatingScore(o.x, o.y, `+${o.def.points + bonus}`, '#ffd100');
        flash('rgba(255,209,0,.25)');
        if (bonus) showCombo();
      }
      updateHUD();
      return;
    }
  }

  function loop(ts) {
    if (!active) return;
    const dt = Math.min((ts - lastTime) / 16.67, 3) || 1;
    lastTime = ts;
    difficultyTimer += dt;
    if (difficultyTimer > 115) {
      level = Math.min(7, level + 1);
      difficultyTimer = 0;
    }
    timeLeft -= dt / 60;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
      return;
    }
    spawnTimer += dt;
    if (spawnTimer > Math.max(20, 60 - level * 6)) {
      spawnTimer = 0;
      spawnObject();
      if (level >= 3 && Math.random() < .35) spawnObject();
      if (level >= 6 && Math.random() < .25) spawnObject();
    }
    objects.forEach((o) => {
      if (o.tapped) {
        o.tapAlpha -= .075 * dt;
        o.tapScale += .055 * dt;
        return;
      }
      o.y += o.vy * dt;
      o.x += o.vx * dt + Math.sin(o.wobble) * .5;
      o.rot += o.rotV * dt;
      o.wobble += .035 * dt;
      o.x = Math.max(o.r, Math.min(width() - o.r, o.x));
    });
    objects = objects.filter((o) => o.y < height() + 110 && (!o.tapped || o.tapAlpha > 0));
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += .04 * dt;
      p.life -= .03 * dt;
    });
    particles = particles.filter((p) => p.life > 0);
    ctx.clearRect(0, 0, width(), height());
    objects.forEach(drawObject);
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s * .65);
      ctx.globalAlpha = 1;
    });
    updateHUD();
    raf = requestAnimationFrame(loop);
  }

  function startGame() {
    el('confetiStart').classList.add('hidden');
    el('confetiEnd').classList.add('hidden');
    objects = [];
    particles = [];
    score = 0;
    lives = 3;
    combo = 0;
    maxCombo = 0;
    caught = 0;
    timeLeft = 18;
    level = 1;
    spawnTimer = 0;
    difficultyTimer = 0;
    saved = false;
    active = true;
    ended = false;
    lastTime = performance.now();
    updateHUD();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function endGame() {
    if (ended) return;
    ended = true;
    active = false;
    if (raf) cancelAnimationFrame(raf);
    const coins = Math.min(200, Math.floor(score / 4));
    el('confetiEndScore').textContent = money(score);
    el('confetiEndCaught').textContent = caught;
    el('confetiEndCombo').textContent = maxCombo;
    el('confetiEndCoins').textContent = `🪙 ${coins} monedes guanyades`;
    el('confetiEnd').classList.remove('hidden');
    if (state.user && !saved) {
      saved = true;
      saveGameProgress('confeti', score, coins, `Has guanyat ${coins} monedes!`);
    }
    if (!state.user && state.guest) toast('Mode convidat: resultat no guardat');
  }

  const onMouseDown = (e) => handleTap(e.clientX, e.clientY);
  const onTouchStart = (e) => {
    e.preventDefault();
    [...e.changedTouches].forEach((touch) => handleTap(touch.clientX, touch.clientY));
  };
  window.addEventListener('resize', resize);
  gameCanvas.addEventListener('mousedown', onMouseDown);
  gameCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  el('confetiStartBtn')?.addEventListener('click', startGame);
  el('confetiReplay')?.addEventListener('click', startGame);
  resize();
  updateHUD();
  loadImages().then(drawBackground);

  state.officialGameCleanup = () => {
    active = false;
    ended = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(bgRaf);
    window.removeEventListener('resize', resize);
    gameCanvas.removeEventListener('mousedown', onMouseDown);
    gameCanvas.removeEventListener('touchstart', onTouchStart);
  };
}

function renderOfficialGameShell(config) {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  clearOfficialGame();
  app.innerHTML = `
    <section class="official-game-shell ${config.theme}">
      <div class="official-game">
        <div class="official-confetti" id="officialConfetti"></div>
        <div class="official-top">
          <a class="official-back" href="#jocs" aria-label="Tornar a tots els jocs">←</a>
          <div class="official-title">${config.titleHTML}</div>
          <div class="official-coin">🪙 <b id="officialCoins">0</b></div>
        </div>
        ${config.body}
        <div class="official-modal hidden" id="officialEndModal">
          <div class="official-modal-card">
            <h2>${escapeHTML(config.endTitle)}</h2>
            <p id="officialEndText"></p>
            <div class="official-row">
              <button class="official-cta" id="officialReplay" type="button">Tornar a jugar</button>
              <a class="official-cta secondary" href="#jocs">Sortir</a>
            </div>
          </div>
        </div>
        <div class="official-footer">IMATGES OFICIALS · LES SANTES · MATARÓ</div>
      </div>
    </section>`;
  addOfficialConfetti(config.confetti || ['#ffd100', '#e10600', '#1e90ff', '#ff8a00']);
  $('#officialReplay')?.addEventListener('click', config.replay);
}

function addOfficialConfetti(colors) {
  const box = $('#officialConfetti');
  if (!box) return;
  box.innerHTML = colors.flatMap((color) => Array.from({ length: 8 }, () => {
    const left = Math.random() * 100;
    const delay = Math.random() * 8;
    return `<i style="left:${left}%;animation-delay:${delay}s;background:${color}"></i>`;
  })).join('');
}

function endOfficialGame({ score, coins, gameKey, text }) {
  $('#officialEndText').innerHTML = text;
  $('#officialEndModal')?.classList.remove('hidden');
  if (state.user) saveGameProgress(gameKey, score, coins, `Has guanyat ${coins} monedes!`);
  if (!state.user && state.guest) toast('Mode convidat: resultat no guardat');
}

function renderGegantsGame() {
  renderOfficialGameShell({
    theme: 'rhythm',
    titleHTML: 'FES BALLAR<br><span>ELS GEGANTS</span>',
    endTitle: 'Ball acabat!',
    replay: renderGegantsGame,
    confetti: ['#ffd100', '#e10600', '#1e90ff', '#22c55e'],
    body: `
      <div class="official-panel official-intro" id="officialIntro">
        <span class="official-badge yellow">Robafaves · Família Gegant</span>
        <h1>Repeteix la dansa!</h1>
        <p class="official-help">Mira la seqüència i toca els personatges en el mateix ordre perquè Robafaves, la Geganta, la Toneta i en Maneló ballin com a Les Santes.</p>
        <button class="official-cta" id="officialStart" type="button">Començar ▶</button>
      </div>
      <div class="official-stage giants-stage">
        <div class="official-img giants-img"></div>
        <div class="official-characters">
          <div class="official-char">👑<small>Robafaves</small></div>
          <div class="official-char">💃<small>Geganta</small></div>
          <div class="official-char">🎀<small>Toneta</small></div>
          <div class="official-char">🎩<small>Maneló</small></div>
        </div>
        <div class="official-floor">♫ Ball de Gegants · Les Santes ♫</div>
      </div>
      <div class="official-stats">
        <div class="official-stat"><b id="officialRound">1</b><span>ronda</span></div>
        <div class="official-stat"><b id="officialScore">0</b><span>punts</span></div>
        <div class="official-stat"><b id="officialLives">3</b><span>vides</span></div>
      </div>
      <div class="official-pads">
        <button class="official-pad red" data-pad="0"><b>👑</b><span>Robafaves</span></button>
        <button class="official-pad yellow" data-pad="1"><b>💃</b><span>Geganta</span></button>
        <button class="official-pad blue" data-pad="2"><b>🎀</b><span>Toneta</span></button>
        <button class="official-pad green" data-pad="3"><b>🎩</b><span>Maneló</span></button>
      </div>
      <p class="official-help center" id="officialMessage">Prem començar i recorda la seqüència.</p>`
  });

  const pads = [...app.querySelectorAll('.official-pad')];
  const chars = [...app.querySelectorAll('.official-char')];
  let sequence = [], input = [], round = 1, score = 0, lives = 3, busy = false, ended = false;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const update = () => {
    $('#officialRound').textContent = round;
    $('#officialScore').textContent = score;
    $('#officialLives').textContent = lives;
    $('#officialCoins').textContent = officialCoins(score, 10);
  };
  const dance = (n) => {
    chars[n]?.classList.add('dance');
    setTimeout(() => chars[n]?.classList.remove('dance'), 220);
  };
  async function showSeq() {
    if (ended) return;
    busy = true;
    $('#officialMessage').textContent = 'Mira la dansa dels gegants...';
    await wait(650);
    for (const n of sequence) {
      pads[n].classList.add('active');
      dance(n);
      await wait(560);
      pads[n].classList.remove('active');
      await wait(180);
    }
    input = [];
    busy = false;
    $('#officialMessage').textContent = 'Ara repeteix la dansa!';
  }
  const nextRound = () => {
    sequence.push(Math.floor(Math.random() * 4));
    showSeq();
  };
  const finish = () => {
    ended = true;
    endOfficialGame({
      gameKey: 'gegants',
      score,
      coins: officialCoins(score, 10),
      text: `Has fet <b>${money(score)}</b> punts i has guanyat <b>${officialCoins(score, 10)}</b> monedes.`
    });
  };
  const fail = () => {
    lives--;
    $('#officialMessage').textContent = 'Ups! Aquest no era. Torna-ho a provar.';
    update();
    if (lives <= 0) finish();
    else setTimeout(showSeq, 800);
  };
  pads.forEach((pad) => pad.addEventListener('click', () => {
    if (busy || ended || !sequence.length) return;
    const n = Number(pad.dataset.pad);
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 150);
    input.push(n);
    if (n !== sequence[input.length - 1]) return fail();
    score += 10;
    dance(n);
    update();
    if (input.length === sequence.length) {
      round++;
      score += 25;
      update();
      $('#officialMessage').textContent = 'Molt bé! Nova ronda!';
      setTimeout(nextRound, 900);
    }
  }));
  $('#officialStart')?.addEventListener('click', () => {
    $('#officialIntro').classList.add('hidden');
    sequence = [];
    input = [];
    round = 1;
    score = 0;
    lives = 3;
    ended = false;
    update();
    nextRound();
  });
  state.officialGameCleanup = () => { ended = true; };
  update();
}

function renderCampanesGame() {
  renderOfficialGameShell({
    theme: 'bells',
    titleHTML: 'TOC DE<br><span>CAMPANES</span>',
    endTitle: 'Toc final!',
    replay: renderCampanesGame,
    confetti: ['#ffd100', '#7c3aed', '#1e90ff', '#fff'],
    body: `
      <div class="official-bell-hero">
        <div class="official-img bells-img"></div>
        <div class="official-bigbell" id="officialBigbell">🔔</div>
        <div class="official-soundwaves">)))</div>
        <div class="official-hero-label">Basílica de Santa Maria · Toc tradicional</div>
      </div>
      <div class="official-stats">
        <div class="official-stat"><b id="officialLevel">1</b><span>nivell</span></div>
        <div class="official-stat"><b id="officialScore">0</b><span>punts</span></div>
        <div class="official-stat"><b id="officialLives">3</b><span>vides</span></div>
      </div>
      <div class="official-panel" id="officialIntro">
        <span class="official-badge yellow">Memòria · Santa Maria</span>
        <p class="official-help">Observa la seqüència de campanes i repeteix-la. Cada ronda s’inspira en els tocs festius de Les Santes.</p>
        <button class="official-cta" id="officialStart" type="button">Començar ▶</button>
      </div>
      <div class="official-bells-grid">
        <button class="official-bell b1" data-bell="0">🔔<small>Santa</small></button>
        <button class="official-bell b2" data-bell="1">🔔<small>Maria</small></button>
        <button class="official-bell b3" data-bell="2">🔔<small>Juliana</small></button>
        <button class="official-bell b4" data-bell="3">🔔<small>Semproniana</small></button>
      </div>
      <p class="official-help center" id="officialMessage">Prem començar per veure el primer toc.</p>`
  });

  const buttons = [...app.querySelectorAll('.official-bell')];
  let seq = [], input = [], level = 1, score = 0, lives = 3, busy = false, ended = false;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const update = () => {
    $('#officialLevel').textContent = level;
    $('#officialScore').textContent = score;
    $('#officialLives').textContent = lives;
    $('#officialCoins').textContent = officialCoins(score, 12);
  };
  const beep = (freq) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = 0.045;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 180);
  };
  const ring = (n) => {
    buttons[n].classList.add('active');
    $('#officialBigbell')?.classList.add('ring');
    setTimeout(() => $('#officialBigbell')?.classList.remove('ring'), 180);
    try { beep(260 + n * 90); } catch {}
  };
  async function playSeq() {
    if (ended) return;
    busy = true;
    $('#officialMessage').textContent = 'Mira el toc de campanes...';
    await wait(600);
    for (const n of seq) {
      ring(n);
      await wait(600);
      buttons[n].classList.remove('active');
      await wait(240);
    }
    input = [];
    busy = false;
    $('#officialMessage').textContent = 'Ara repeteix el toc!';
  }
  const next = () => {
    seq.push(Math.floor(Math.random() * 4));
    playSeq();
  };
  const finish = () => {
    ended = true;
    endOfficialGame({
      gameKey: 'campanes',
      score,
      coins: officialCoins(score, 12),
      text: `Has arribat al nivell <b>${level}</b>, amb <b>${money(score)}</b> punts i <b>${officialCoins(score, 12)}</b> monedes.`
    });
  };
  const fail = () => {
    lives--;
    $('#officialMessage').textContent = 'Aquest toc no era!';
    update();
    if (lives <= 0) finish();
    else setTimeout(playSeq, 700);
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    if (busy || ended || !seq.length) return;
    const n = Number(button.dataset.bell);
    ring(n);
    setTimeout(() => button.classList.remove('active'), 180);
    input.push(n);
    if (n !== seq[input.length - 1]) return fail();
    score += 12;
    update();
    if (input.length === seq.length) {
      level++;
      score += 30;
      update();
      $('#officialMessage').textContent = 'Molt bé! Nou toc!';
      setTimeout(next, 850);
    }
  }));
  $('#officialStart')?.addEventListener('click', () => {
    $('#officialIntro').classList.add('hidden');
    seq = [];
    input = [];
    level = 1;
    score = 0;
    lives = 3;
    ended = false;
    update();
    next();
  });
  state.officialGameCleanup = () => { ended = true; };
  update();
}

function renderCorrefocGame() {
  renderOfficialGameShell({
    theme: 'correfoc',
    titleHTML: 'CORREFOC<br><span>SEGUR</span>',
    endTitle: 'Correfoc acabat!',
    replay: renderCorrefocGame,
    body: `
      <div class="official-stats">
        <div class="official-stat"><b id="officialTime">30</b><span>temps</span></div>
        <div class="official-stat"><b id="officialScore">0</b><span>punts</span></div>
        <div class="official-stat"><b id="officialLives">3</b><span>vides</span></div>
      </div>
      <div class="official-arena" id="officialArena">
        <div class="official-img correfoc-img"></div>
        <div class="official-route"></div>
        <div class="official-player" id="officialPlayer">🛡️</div>
        <div class="official-hint" id="officialIntro">
          <span class="official-badge yellow">Diablesses · Drac · Momerota</span>
          <h1>Segueix el correfoc!</h1>
          <p>Arrossega l’escut per esquivar espurnes i recollir gotes d’aigua. Inspirat en el foc festiu de Les Santes.</p>
          <button class="official-cta" id="officialStart" type="button">Començar ▶</button>
        </div>
      </div>
      <p class="official-help center" id="officialMessage">Evita 🔥 i recull 💧. Les espurnes van ràpid!</p>`
  });

  const arena = $('#officialArena');
  const player = $('#officialPlayer');
  let running = false, score = 0, lives = 3, time = 30, objects = [], timer = null, loop = null, last = 0, ended = false;
  const update = () => {
    $('#officialScore').textContent = score;
    $('#officialLives').textContent = lives;
    $('#officialTime').textContent = time;
    $('#officialCoins').textContent = officialCoins(score, 15);
  };
  const pointerPos = (event) => {
    const rect = arena.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };
  const move = (event) => {
    if (!running) return;
    const p = pointerPos(event);
    player.style.left = `${Math.max(35, Math.min(arena.clientWidth - 35, p.x))}px`;
    player.style.top = `${Math.max(55, Math.min(arena.clientHeight - 55, p.y))}px`;
    player.style.bottom = 'auto';
    event.preventDefault();
  };
  const spawn = () => {
    const good = Math.random() < 0.28;
    const el = document.createElement('div');
    el.className = good ? 'official-drop' : 'official-spark';
    el.textContent = good ? '💧' : (Math.random() < 0.5 ? '🔥' : '💥');
    el.dataset.good = good ? '1' : '0';
    el.style.left = `${30 + Math.random() * (arena.clientWidth - 70)}px`;
    el.style.top = '-45px';
    arena.appendChild(el);
    objects.push({ el, y: -45, speed: 2.5 + Math.random() * 2.8 + (30 - time) * 0.05, dead: false });
  };
  const collide = (a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return !(ar.right < br.left || ar.left > br.right || ar.bottom < br.top || ar.top > br.bottom);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(loop);
    endOfficialGame({
      gameKey: 'correfoc',
      score,
      coins: officialCoins(score, 15),
      text: `Has aconseguit <b>${money(score)}</b> punts i <b>${officialCoins(score, 15)}</b> monedes.`
    });
  };
  const tick = (t = 0) => {
    if (!running) return;
    if (t - last > 520) {
      spawn();
      last = t;
    }
    objects.forEach((obj) => {
      obj.y += obj.speed;
      obj.el.style.top = `${obj.y}px`;
      if (collide(obj.el, player)) {
        if (obj.el.dataset.good === '1') {
          score += 25;
          $('#officialMessage').textContent = 'Aigua recollida! +25';
        } else {
          lives--;
          $('#officialMessage').textContent = 'Espurna! Perds una vida';
          arena.animate([{ filter: 'brightness(1.7)' }, { filter: 'brightness(1)' }], { duration: 180 });
        }
        obj.el.remove();
        obj.dead = true;
        update();
        if (lives <= 0) finish();
      }
      if (obj.y > arena.clientHeight + 50) {
        obj.el.remove();
        obj.dead = true;
      }
    });
    objects = objects.filter((obj) => !obj.dead);
    loop = requestAnimationFrame(tick);
  };
  $('#officialStart')?.addEventListener('click', () => {
    $('#officialIntro').classList.add('hidden');
    running = true;
    update();
    timer = setInterval(() => {
      time--;
      update();
      if (time <= 0) finish();
    }, 1000);
    tick();
  });
  arena.addEventListener('mousemove', move);
  arena.addEventListener('touchmove', move, { passive: false });
  state.officialGameCleanup = () => {
    ended = true;
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(loop);
    objects.forEach((obj) => obj.el.remove());
    objects = [];
  };
  update();
}

const AVATAR_SLOTS = [
  { type: 'Roba', label: 'Roba', empty: 'Cap peça' },
  { type: 'Accessoris', label: 'Accessoris', empty: 'Cap accessori' },
  { type: 'Equipament', label: 'Equipament', empty: 'Cap equipament' },
  { type: 'Efectes', label: 'Efectes', empty: 'Cap efecte' },
  { type: 'Especial', label: 'Especial', empty: 'Cap especial' },
  { type: 'Col·lecció', label: 'Col·lecció', empty: 'Cap insígnia' }
];

function equippedByType(items = state.inventory) {
  return new Map(items.filter((item) => item.equipped).map((item) => [item.type, item]));
}

function rewardClass(item) {
  return item?.id ? `item-${String(item.id).replace(/[^a-z0-9-]/gi, '')}` : '';
}

function renderAvatarLoadout(title = 'El teu personatge', subtitle = 'Aplica recompenses desbloquejades des de l’inventari.') {
  const equipped = equippedByType();
  return `<article class="card avatar-loadout">
    <div class="avatar-stage">
      ${renderCharacterPreview('compact')}
      <div>
        <span class="eyebrow yellow">${escapeHTML(title)}</span>
        <h3>${escapeHTML(state.user?.display_name || 'Convidat')}</h3>
        <p>${escapeHTML(subtitle)}</p>
      </div>
    </div>
    <div class="avatar-slots">
      ${AVATAR_SLOTS.map((slot) => {
        const item = equipped.get(slot.type);
        return `<div class="avatar-slot ${item ? 'filled' : ''}">
          <span>${item?.image || '＋'}</span>
          <div><strong>${escapeHTML(slot.label)}</strong><small>${escapeHTML(item?.name || slot.empty)}</small></div>
        </div>`;
      }).join('')}
    </div>
  </article>`;
}

function renderCharacterPreview(size = 'large') {
  const equipped = equippedByType();
  const slots = {
    roba: equipped.get('Roba'),
    accessoris: equipped.get('Accessoris'),
    equipament: equipped.get('Equipament'),
    efectes: equipped.get('Efectes'),
    especial: equipped.get('Especial'),
    colleccio: equipped.get('Col·lecció')
  };
  const title = state.user?.display_name || 'Convidat';
  const skinClass = slots.especial?.id === 'pell-or' ? 'skin-gold' : '';
  const outfitClass = !slots.roba && !slots.equipament ? 'no-outfit' : '';
  const specialLayer = slots.especial && slots.especial.id !== 'pell-or'
    ? `<span class="character-layer character-special ${rewardClass(slots.especial)}" title="${escapeHTML(slots.especial.name)}">${slots.especial.image}</span>`
    : '';
  return `<div class="character-preview character-preview-${size}" aria-label="Personatge MiniSantes de ${escapeHTML(title)}">
    <div class="character-aura" aria-hidden="true"></div>
    <div class="character-base-figure ${skinClass} ${outfitClass}">
      <span class="character-head">🧒</span>
      ${slots.roba ? `<span class="character-body equipped" title="${escapeHTML(slots.roba.name)}">${slots.roba.image || '👕'}</span>` : ''}
      ${slots.equipament ? `<span class="character-legs equipped" title="${escapeHTML(slots.equipament.name)}">${slots.equipament.image || '👟'}</span>` : ''}
      ${slots.accessoris ? `<span class="character-layer character-accessory ${rewardClass(slots.accessoris)}" title="${escapeHTML(slots.accessoris.name)}">${slots.accessoris.image}</span>` : ''}
      ${specialLayer}
      ${slots.efectes ? `<span class="character-layer character-effect ${rewardClass(slots.efectes)}" title="${escapeHTML(slots.efectes.name)}">${slots.efectes.image}</span>` : ''}
      ${slots.colleccio ? `<span class="character-layer character-collection ${rewardClass(slots.colleccio)}" title="${escapeHTML(slots.colleccio.name)}">${slots.colleccio.image}</span>` : ''}
    </div>
  </div>`;
}

function renderCastleGame() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  clearInterval(state.castleTimer);
  const game = {
    active: false,
    x: 50,
    target: 50,
    dir: 1,
    speed: 0.55,
    lives: 3,
    score: 0,
    tower: 0,
    blocks: [],
    saved: false
  };

  app.innerHTML = `
    <section class="castle-shell">
      <div class="castle-head">
        <div>
          <a class="btn btn-ghost btn-small" href="#jocs">← Tots els jocs</a>
          <span class="eyebrow yellow">Disponible</span>
          <h2>Construeix el Castell<span class="dot">.</span></h2>
          <p class="lead">Mou el casteller, deixa’l caure i intenta alinear cada pis de la torre.</p>
        </div>
        <div class="castle-user ${state.guest ? 'guest' : ''}">
          <strong>${state.user ? escapeHTML(state.user.display_name) : 'Convidat'}</strong>
          <span>${state.user ? `${money(state.user.coins)} monedes` : 'El progrés no es guardarà'}</span>
        </div>
      </div>
      <section class="castle-stage">
        <div class="castle-hud">
          <article><span>Vides</span><strong id="castleLives">3</strong></article>
          <article><span>Punts</span><strong id="castleScore">0</strong></article>
          <article><span>Torre</span><strong id="castleTowerCount">0</strong></article>
          <article><span>Monedes</span><strong id="castleCoins">0</strong></article>
        </div>
        <div class="castle-playfield" id="castlePlayfield" tabindex="0" role="button" aria-label="Prem o toca per deixar caure el casteller">
          <div class="castle-sky" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="castle-target" id="castleTarget" aria-hidden="true"></div>
          <div class="castle-tower" id="castleTower" aria-hidden="true"></div>
          <div class="castle-player" id="castlePlayer" aria-hidden="true"><span>🧍</span></div>
          <div class="castle-ground" aria-hidden="true"></div>
          <div class="castle-message" id="castleMessage">Prem començar per aixecar la torre.</div>
          <div class="castle-overlay show" id="castleOverlay">
            <div class="castle-panel">
              <span>🏰</span>
              <h3>Preparat?</h3>
              <p>Quan el casteller passi pel centre, prem o toca per deixar-lo caure. Tens 3 vides.</p>
              <button class="btn btn-primary primary-highlight" id="castleStart" type="button">Començar partida</button>
            </div>
          </div>
        </div>
      </section>
    </section>`;

  const el = (id) => document.getElementById(id);
  const player = el('castlePlayer');
  const target = el('castleTarget');
  const tower = el('castleTower');
  const overlay = el('castleOverlay');
  const playfield = el('castlePlayfield');

  function estimateCoins() {
    return game.score > 0 ? Math.min(250, Math.round(game.score / 90) + game.tower * 8) : 0;
  }

  function updateCastleHUD() {
    el('castleLives').textContent = '❤️'.repeat(game.lives) || '0';
    el('castleScore').textContent = money(game.score);
    el('castleTowerCount').textContent = game.tower;
    el('castleCoins').textContent = estimateCoins();
  }

  function setMessage(text, good = true) {
    const msg = el('castleMessage');
    msg.textContent = text;
    msg.classList.toggle('bad', !good);
  }

  function renderTowerBlocks() {
    tower.innerHTML = game.blocks.map((block, index) => {
      const width = Math.max(58, 112 - index * 4);
      return `<i style="left:${block.x}%;bottom:${index * 29}px;width:${width}px"><span>🧍</span></i>`;
    }).join('');
  }

  function tick() {
    game.x += game.dir * game.speed;
    if (game.x >= 92 || game.x <= 8) {
      game.dir *= -1;
      game.x = clamp(game.x, 8, 92);
    }
    player.style.left = `${game.x}%`;
  }

  function endGame(completed = false) {
    game.active = false;
    clearInterval(state.castleTimer);
    const earnedCoins = estimateCoins();
    overlay.innerHTML = `
      <div class="castle-panel castle-result">
        <span>${completed ? '🏆' : '🎯'}</span>
        <h3>${completed ? 'Castell complet!' : 'Partida acabada'}</h3>
        <div class="memory-result"><span>Puntuació</span><strong>${money(game.score)} pts</strong></div>
        <div class="memory-result"><span>Pisos</span><strong>${game.tower}</strong></div>
        <div class="memory-result"><span>Monedes</span><strong>${earnedCoins}</strong></div>
        <p>${state.user ? 'Resultat guardat al teu perfil.' : 'Mode convidat: resultat no guardat.'}</p>
        <button class="btn btn-primary primary-highlight" type="button" id="castleReplay">Tornar a jugar</button>
        <a class="btn btn-yellow reward-highlight" href="#jocs">Veure tots els jocs</a>
      </div>`;
    overlay.classList.add('show');
    el('castleReplay')?.addEventListener('click', () => renderCastleGame());
    if (state.user && !game.saved) {
      game.saved = true;
      saveGameProgress('castell', game.score, earnedCoins, `Has guanyat ${earnedCoins} monedes!`);
    }
    if (!state.user && state.guest) toast('Mode convidat: resultat no guardat');
  }

  function dropCasteller() {
    if (!game.active) return;
    const diff = Math.abs(game.x - game.target);
    const threshold = Math.max(6, 14 - game.tower * 0.65);
    if (diff <= threshold) {
      const precision = Math.max(0, Math.round((threshold - diff) * 12));
      game.tower += 1;
      game.score += 120 + game.tower * 35 + precision;
      game.blocks.push({ x: game.x });
      game.target = game.x;
      game.speed = Math.min(1.35, game.speed + 0.075);
      target.style.left = `${game.target}%`;
      renderTowerBlocks();
      updateCastleHUD();
      setMessage(diff < 4 ? 'Perfecte! Pis molt ben alineat.' : 'Ben fet! La torre continua pujant.');
      if (game.tower >= 10) endGame(true);
      return;
    }
    game.lives -= 1;
    updateCastleHUD();
    setMessage('Ha caigut massa descentrat. Perds una vida.', false);
    if (game.lives <= 0) endGame(false);
  }

  function startGame() {
    game.active = true;
    overlay.classList.remove('show');
    setMessage('Toca la pantalla quan el casteller estigui alineat.');
    updateCastleHUD();
    playfield.focus({ preventScroll: true });
    state.castleTimer = setInterval(tick, 16);
  }

  updateCastleHUD();
  player.style.left = `${game.x}%`;
  target.style.left = `${game.target}%`;
  el('castleStart')?.addEventListener('click', startGame);
  playfield?.addEventListener('click', (e) => {
    if (e.target.closest('.castle-overlay')) return;
    dropCasteller();
  });
  playfield?.addEventListener('keydown', (e) => {
    if (!['Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    if (game.active) dropCasteller();
    else if (overlay.classList.contains('show')) el('castleStart')?.click();
  });
}

function requireRegistered() {
  if (!state.user) {
    toast(state.guest ? 'En mode convidat no es guarda el progrés' : 'Inicia sessió per continuar');
    location.hash = state.guest ? '#minisantes' : '#login';
    return false;
  }
  return true;
}

function renderBotiga() {
  const logged = Boolean(state.user);
  if (!logged && !state.guest) return renderLogin();
  const owned = new Map(state.inventory.map((item) => [item.id, item]));
  const shopItems = logged ? state.rewards.filter((reward) => !owned.has(reward.id)) : state.rewards;
  app.innerHTML = `
    ${pageTitle('Botiga', logged ? 'Compra recompenses noves amb les monedes guanyades als jocs.' : 'Inicia sessió per guardar recompenses.', '<a class="btn btn-ghost" href="#inventari">El meu inventari</a>')}
    ${!logged ? '<div class="guest-banner mini-guest-banner info-highlight">👀 Inicia sessió per guardar recompenses</div>' : ''}
    ${logged ? `<section class="shop-summary"><article><strong>${money(state.user.coins)}</strong><span>monedes disponibles</span></article><article><strong>${state.inventory.length}</strong><span>desbloquejades</span></article><article><strong>${shopItems.length}</strong><span>per comprar</span></article></section>` : ''}
    <section class="shop-grid">${shopItems.length ? shopItems.map((r) => {
      const canBuy = logged && state.user.coins >= r.cost;
      const action = !logged
        ? '<button class="btn btn-primary primary-highlight btn-small" disabled>Inicia sessió</button>'
        : `<button class="btn btn-primary primary-highlight btn-small" data-buy="${escapeHTML(r.id)}" ${canBuy ? '' : 'disabled'}>${canBuy ? 'Comprar' : 'Falten monedes'}</button>`;
      return `<article class="shop-card ${canBuy || !logged ? 'reward-highlight' : 'locked'}">
        <span class="eyebrow">${escapeHTML(r.type)}</span>
        <div class="shop-img">${r.image || '🎁'}</div>
        <h3>${escapeHTML(r.name)}</h3><p>${escapeHTML(r.description || '')}</p>
        <div class="price">● ${money(r.cost)}</div>
        ${action}
      </article>`;
    }).join('') : '<div class="state-box reward-highlight"><h3>Ja tens totes les recompenses de la botiga</h3><p>Ves a l’inventari per aplicar-les al teu personatge.</p><a class="btn btn-primary primary-highlight" href="#inventari">Obrir inventari</a></div>'}</section>`;
  app.querySelectorAll('[data-buy]').forEach((btn) => btn.addEventListener('click', () => buyReward(btn.dataset.buy)));
}

async function buyReward(rewardId) {
  try {
    const data = await api('/buy', { method: 'POST', body: JSON.stringify({ user_id: state.user.id, reward_id: rewardId }) });
    state.user = data.user;
    state.inventory = data.inventory || [];
    state.progress = data.progress || [];
    updateHeader();
    toast('Recompensa comprada! Ara la pots aplicar a l’inventari.');
    renderBotiga();
  } catch (err) {
    toast(err.message);
  }
}

async function equipReward(rewardId, after = renderInventari) {
  if (!state.user) {
    toast('Inicia sessió per guardar recompenses');
    return;
  }
  try {
    const data = await api('/equip', { method: 'POST', body: JSON.stringify({ user_id: state.user.id, reward_id: rewardId }) });
    state.user = data.user;
    state.inventory = data.inventory || [];
    state.progress = data.progress || [];
    updateHeader();
    toast('Recompensa aplicada al personatge!');
    after();
  } catch (err) {
    toast(err.message);
  }
}

async function unequipReward(rewardId, after = renderInventari) {
  if (!state.user) {
    toast('Inicia sessió per guardar recompenses');
    return;
  }
  try {
    const data = await api('/equip', { method: 'POST', body: JSON.stringify({ user_id: state.user.id, reward_id: rewardId, unequip: true }) });
    state.user = data.user;
    state.inventory = data.inventory || [];
    state.progress = data.progress || [];
    updateHeader();
    toast('Recompensa retirada del personatge');
    after();
  } catch (err) {
    toast(err.message);
  }
}

function renderInventari() {
  if (!state.user) {
    if (state.guest) {
      app.innerHTML = `
        ${pageTitle('Inventari bloquejat', 'Inicia sessió per guardar recompenses.', '<a class="btn btn-primary primary-highlight" href="#login">Iniciar sessió</a><a class="btn btn-ghost" href="#minisantes">Tornar a MiniSantes</a>')}
        <div class="state-box info-highlight"><h3>Inicia sessió per guardar recompenses</h3><p>En mode convidat pots jugar, però no pots comprar ni equipar objectes.</p></div>`;
      return;
    }
    return renderLogin();
  }
  app.innerHTML = `
    ${pageTitle('Inventari', 'Aquí apliques al personatge les recompenses que ja has desbloquejat.', '<a class="btn btn-primary primary-highlight" href="#botiga">Comprar més</a>')}
    <section class="inventory-layout">
      ${renderAvatarLoadout('Personatge', 'Tria una recompensa de cada tipus per vestir el teu avatar.')}
      <div>
        <div class="section-head compact-head"><h3>Recompenses desbloquejades</h3><span>${state.inventory.length} items</span></div>
        <section class="inventory-grid owned-only">
          ${state.inventory.length ? state.inventory.map((r) => `<article class="inv-card reward-highlight ${r.equipped ? 'featured' : ''}">
            <span class="eyebrow ${r.equipped ? 'yellow' : ''}">${r.equipped ? 'Aplicat' : 'Desbloquejat'}</span>
            <div class="inv-art">${r.image || '🎁'}</div>
            <h3>${escapeHTML(r.name)}</h3>
            <p>${escapeHTML(r.description || '')}</p>
            <small>${escapeHTML(r.type)}</small>
            <button class="btn ${r.equipped ? 'btn-ghost' : 'btn-primary primary-highlight'} btn-small" ${r.equipped ? `data-unequip="${escapeHTML(r.id)}"` : `data-equip="${escapeHTML(r.id)}"`}>${r.equipped ? 'Treure del personatge' : 'Aplicar al personatge'}</button>
          </article>`).join('') : '<div class="state-box"><h3>Encara no tens recompenses</h3><p>Compra’n a la botiga o juga per guanyar monedes.</p><a class="btn btn-primary primary-highlight" href="#botiga">Anar a la botiga</a></div>'}
        </section>
      </div>
    </section>`;
  app.querySelectorAll('[data-equip]').forEach((btn) => btn.addEventListener('click', () => equipReward(btn.dataset.equip)));
  app.querySelectorAll('[data-unequip]').forEach((btn) => btn.addEventListener('click', () => unequipReward(btn.dataset.unequip)));
}

function renderPerfil() {
  if (!state.user) {
    if (state.guest) {
      app.innerHTML = `
        ${pageTitle('Perfil bloquejat', 'Estàs navegant com a convidat.', '<a class="btn btn-primary primary-highlight" href="#login">Iniciar sessió</a><a class="btn btn-ghost" href="#minisantes">Tornar a MiniSantes</a>')}
        <section class="profile-locked info-highlight">
          <div class="big-avatar">👀</div>
          <div><h3>Perfil no disponible en mode convidat</h3><p>Inicia sessió per guardar monedes, recompenses equipades, inventari i progrés dels jocs.</p></div>
        </section>`;
      return;
    }
    return renderLogin();
  }
  const totalCoins = state.progress.reduce((sum, item) => sum + item.coins_earned, 0);
  const equipped = state.inventory.filter((item) => item.equipped);
  const recentGames = [...state.progress].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);
  const nextLevelCoins = Math.max(1000, (state.user.level + 1) * 2500);
  const progressPct = clamp(Math.round((state.user.coins / nextLevelCoins) * 100), 6, 100);
  const equippedBySlot = equippedByType();
  app.innerHTML = `
    ${pageTitle('Perfil', 'Personalitza el teu personatge, consulta el progrés i gestiona les recompenses.', '<button class="btn btn-ghost" id="logoutBtn">Tancar sessió</button>')}
    <section class="profile-premium profile-dashboard">
      <aside class="card profile-card profile-identity profile-side-panel">
        <div class="profile-mini-avatar">${renderCharacterPreview('compact')}</div>
        <span class="eyebrow yellow">Nivell ${state.user.level}</span>
        <h2>${escapeHTML(state.user.display_name)}</h2>
        <p class="coin-line reward-highlight">● ${money(state.user.coins)} <span>monedes</span></p>
        <div class="profile-level-bar"><span style="width:${progressPct}%"></span></div>
        <small>${progressPct}% cap al proper nivell</small>
        <div class="profile-character-actions">
          <a class="btn btn-primary primary-highlight" href="#inventari">Canviar outfit</a>
          <a class="btn btn-yellow reward-highlight" href="#botiga">Guanyar premis</a>
        </div>
      </aside>
      <article class="profile-character-card profile-avatar-focus" aria-label="Avatar equipat">
        <div class="profile-character-showcase">
          <span class="profile-particle particle-one" aria-hidden="true"></span>
          <span class="profile-particle particle-two" aria-hidden="true"></span>
          <span class="profile-particle particle-three" aria-hidden="true"></span>
          ${renderCharacterPreview('hero')}
          <p>El teu avatar evoluciona amb els objectes equipats</p>
        </div>
      </article>
      <aside class="card profile-card profile-right-panel">
        <div class="section-head compact-head"><h3>Equipament aplicat</h3><span>${equipped.length}/${AVATAR_SLOTS.length}</span></div>
        <div class="profile-slot-list">
          ${AVATAR_SLOTS.map((slot) => {
            const item = equippedBySlot.get(slot.type);
            return `<div class="avatar-slot ${item ? 'filled' : ''}">
              <span>${item?.image || '＋'}</span>
              <div><strong>${escapeHTML(slot.label)}</strong><small>${escapeHTML(item?.name || slot.empty)}</small></div>
              ${item ? `<button class="slot-remove" type="button" data-unequip="${escapeHTML(item.id)}" aria-label="Treure ${escapeHTML(item.name)}">Treure</button>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="profile-summary-compact">
          <h3>Resum Minisantes</h3>
          <div class="quick-stats"><div class="stat"><strong>${state.inventory.length}</strong><span>premis</span></div><div class="stat"><strong>${state.progress.length}</strong><span>jocs</span></div><div class="stat"><strong>${money(totalCoins)}</strong><span>guanyades</span></div></div>
        </div>
        <div class="profile-recent-compact">
          <h3>Últims jocs</h3>
          <div class="settings-list">${recentGames.length ? recentGames.map((p) => activityItem(gameName(p.game_key), `Millor puntuació: ${money(p.best_score)}`, `${money(p.coins_earned)} monedes`)).join('') : '<div class="settings-item"><div><strong>Sense partides</strong><p>Juga a MiniSantes per omplir aquest historial.</p></div><span>0</span></div>'}</div>
        </div>
      </aside>
    </section>`;
  $('#logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_SESSION);
    state.user = null;
    state.inventory = [];
      state.progress = [];
    updateHeader();
    toast('Sessió tancada');
    location.hash = '#home';
  });
  app.querySelectorAll('[data-unequip]').forEach((btn) => btn.addEventListener('click', () => unequipReward(btn.dataset.unequip, renderPerfil)));
}

function gameName(key) {
  return {
    castell: 'Construeix el Castell',
    parelles: 'Troba les Parelles',
    confeti: 'Atrapa el Confeti',
    gegants: 'Fes Ballar els Gegants',
    correfoc: 'Correfoc Segur',
    campanes: 'Toc de Campanes'
  }[key] || key;
}

function activityItem(title, desc, right) {
  return `<div class="settings-item"><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(desc)}</p></div><span>${escapeHTML(right)}</span></div>`;
}

function renderLogin() {
  app.innerHTML = `<section class="login-screen"><div class="card login-card"><span class="eyebrow yellow">Compte Minisantes</span><h2>Accedeix<span class="dot">.</span></h2><p>Entra o crea un compte. El perfil, inventari i botiga només funcionen amb un compte.</p><div class="auth-tabs"><button class="active" id="tabLogin" type="button">Login</button><button id="tabRegister" type="button">Registre</button></div><form id="authForm"><label class="field"><span>Usuari</span><input class="input" id="authUser" required placeholder="biel09" autocomplete="username"></label><label class="field"><span>Contrasenya</span><input class="input" id="authPass" type="password" required placeholder="santes2026" autocomplete="current-password"></label><button class="btn btn-primary primary-highlight full" type="submit">Entrar</button></form><p class="hint">Usuari de prova: <strong>biel09</strong> · contrasenya: <strong>santes2026</strong></p></div></section>`;
  let mode = 'login';
  $('#tabLogin').addEventListener('click', () => {
    mode = 'login';
    $('#tabLogin').classList.add('active');
    $('#tabRegister').classList.remove('active');
  });
  $('#tabRegister').addEventListener('click', () => {
    mode = 'register';
    $('#tabRegister').classList.add('active');
    $('#tabLogin').classList.remove('active');
  });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = { username: $('#authUser').value.trim(), password: $('#authPass').value };
      const data = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body: JSON.stringify(payload) });
      state.user = data.user;
      state.inventory = data.inventory || [];
      state.progress = data.progress || [];
      localStorage.setItem(STORAGE_SESSION, String(state.user.id));
      state.guest = false;
      sessionStorage.removeItem(STORAGE_GUEST);
      updateHeader();
      toast(mode === 'login' ? 'Benvingut/da!' : 'Compte creat!');
      location.hash = '#perfil';
    } catch (err) {
      toast(err.message);
    }
  });
}

function setupChrome() {
  $('#globalSearchBtn').addEventListener('click', openSearch);
  $('#closeSearch').addEventListener('click', closeSearch);
  $('#searchOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'searchOverlay') closeSearch();
  });
  $('#globalSearchInput').addEventListener('input', renderSearchResults);
  $('#globalSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
  });
  $('#userButton').addEventListener('click', () => {
    location.hash = (state.user || state.guest) ? '#perfil' : '#login';
  });
  $('#mobileMenuBtn').addEventListener('click', () => $('#mobileMenu').classList.toggle('open'));
  document.querySelectorAll('#mobileMenu a').forEach((a) => a.addEventListener('click', () => $('#mobileMenu').classList.remove('open')));
  window.addEventListener('resize', () => {
    clearTimeout(setupChrome.resizeTimer);
    setupChrome.resizeTimer = setTimeout(() => {
      state.map?.invalidateSize?.(true);
      state.detailMap?.invalidateSize?.(true);
    }, 180);
  });
  window.toast = toast;
}

function openSearch() {
  $('#searchOverlay').classList.remove('hidden');
  $('#globalSearchInput').focus();
  renderSearchResults();
}

function closeSearch() {
  $('#searchOverlay').classList.add('hidden');
}

function renderSearchResults() {
  const q = $('#globalSearchInput').value.trim().toLowerCase();
  const results = state.events.filter((e) => !q || `${e.title} ${e.location} ${e.cat}`.toLowerCase().includes(q)).slice(0, 8);
  $('#globalSearchResults').innerHTML = results.length ? results.map((e) => `<a class="small-result" href="#acte/${e.id}" onclick="document.getElementById('searchOverlay').classList.add('hidden')"><div><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.time)} · ${escapeHTML(e.location || '')}</p></div><span class="event-cat ${categoryClass(e.cat)}">${escapeHTML(e.cat)}</span></a>`).join('') : '<div class="state-box"><h3>Sense resultats</h3></div>';
}

function router() {
  const hash = (location.hash || '#home').slice(1);
  const [route, id] = hash.split('/');
  state.route = route || 'home';
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  if (state.detailMap) {
    state.detailMap.remove();
    state.detailMap = null;
  }
  clearInterval(state.memoryTimer);
  clearInterval(state.memoryPreviewTimer);
  clearInterval(state.castleTimer);
  clearOfficialGame();
  $('#mobileMenu')?.classList.remove('open');
  updateHeader();
  if (state.loading) {
    app.innerHTML = loadingState('Carregant dades...');
    return;
  }
  if (state.error) {
    app.innerHTML = errorState('No s’han pogut carregar les dades', state.error);
    return;
  }
  const routes = {
    home: renderHome,
    programa: renderPrograma,
    mapa: renderMapa,
    minisantes: renderMinisantes,
    jocs: renderAllGames,
    castell: renderCastleGame,
    confeti: renderConfetiGame,
    gegants: renderGegantsGame,
    correfoc: renderCorrefocGame,
    campanes: renderCampanesGame,
    memory: renderMemoryGame,
    botiga: renderBotiga,
    inventari: renderInventari,
    perfil: renderPerfil,
    login: renderLogin
  };
  if (route === 'destacats' || route === 'agenda') {
    location.hash = '#home/avui';
    return;
  }
  if (route === 'acte') renderDetail(id);
  else (routes[route] || renderHome)();
  if (route === 'home' && id === 'avui') {
    setTimeout(() => $('#homeToday')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  } else {
    window.scrollTo(0, 0);
  }
  app.focus({ preventScroll: true });
}

window.addEventListener('hashchange', router);
setupChrome();
updateHeader();
loadInitialData();
