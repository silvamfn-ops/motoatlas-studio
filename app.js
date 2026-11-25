// MOTOATLAS Studio v6.2 — Arquitetura Blindada (Sem dependências frágeis antes dos eventos)
const STUDIO_TRIPS_KEY = 'motoatlas_studio_v6_trips';
const STUDIO_ACTIVE_ID_KEY = 'motoatlas_studio_v6_active_id';
const SB_URL_KEY = 'motoatlas_supabase_url';
const SB_ANON_KEY = 'motoatlas_supabase_anon_key';

const SAMPLE_TRIPS = [
  {
    id: 'trip-andaluzia-26',
    tripCode: 'ANDALUZIA-26',
    profile: 'moto',
    tripTitle: 'Expedição Andaluzia & Sul Ibérico',
    stageSubtitle: 'Etapa 1: Lisboa → Córdoba (via Évora & Zafra)',
    stageDistanceKm: 485,
    odometerKm: 580,
    tankCapacityL: 14.1,
    avgConsumptionL100: 3.8,
    waypoints: [
      { name: 'Partida: Lisboa (Ponte Vasco da Gama)', type: 'start', lat: 38.7586, lng: -9.0375, km: 0 },
      { name: 'Café & Reagrupamento: Évora', type: 'viewpoint', lat: 38.5714, lng: -7.9135, km: 132 },
      { name: 'Abastecimento: Repsol Mérida', type: 'fuel', lat: 38.9161, lng: -6.3437, km: 285 },
      { name: 'Paragem Cultural: Zafra (Plaza Grande)', type: 'monument', lat: 38.4261, lng: -6.4184, km: 348 },
      { name: 'Chegada / Dormida: Córdoba', type: 'sleep', lat: 37.8882, lng: -4.7794, km: 485 }
    ],
    routeCoords: [
      [38.7586, -9.0375],
      [38.6850, -8.4800],
      [38.5714, -7.9135],
      [38.8800, -6.9700],
      [38.9161, -6.3437],
      [38.4261, -6.4184],
      [38.1200, -5.5600],
      [37.8882, -4.7794]
    ],
    expenses: []
  }
];

let trips = [];
let activeTripId = null;
let map = null;
let routeLayer = null;
let markersLayer = null;

// --- FUNÇÕES GLOBAIS DO MODAL (GARANTE FUNCIONAMENTO IMEDIATO MESMO COM CLIQUE INLINE) ---
window.openSupabaseModal = function() {
  const overlay = document.getElementById('supabaseModalOverlay');
  if (!overlay) return;
  document.getElementById('sbUrlInput').value = localStorage.getItem(SB_URL_KEY) || '';
  document.getElementById('sbKeyInput').value = localStorage.getItem(SB_ANON_KEY) || '';
  document.getElementById('sbTestResult').textContent = '';
  overlay.hidden = false;
};

window.closeSupabaseModal = function() {
  const overlay = document.getElementById('supabaseModalOverlay');
  if (overlay) overlay.hidden = true;
};

function showToast(msg) {
  const toast = document.getElementById('studioToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

// --- INICIALIZAÇÃO SEGURA ---
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  bindEvents();
  initMapSafe();
  renderAll();
  checkSupabaseConnection(true);
});

function loadState() {
  try {
    const raw = localStorage.getItem(STUDIO_TRIPS_KEY);
    trips = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SAMPLE_TRIPS));
    if (!Array.isArray(trips) || trips.length === 0) {
      trips = JSON.parse(JSON.stringify(SAMPLE_TRIPS));
    }
  } catch {
    trips = JSON.parse(JSON.stringify(SAMPLE_TRIPS));
  }
  activeTripId = localStorage.getItem(STUDIO_ACTIVE_ID_KEY) || trips[0].id;
  if (!trips.some(t => t.id === activeTripId)) {
    activeTripId = trips[0].id;
  }
}

function saveState() {
  localStorage.setItem(STUDIO_TRIPS_KEY, JSON.stringify(trips));
  localStorage.setItem(STUDIO_ACTIVE_ID_KEY, activeTripId);
}

function getActiveTrip() {
  return trips.find(t => t.id === activeTripId) || trips[0];
}

function initMapSafe() {
  try {
    if (typeof L === 'undefined') {
      console.warn('Leaflet não carregou (modo offline). O restante Studio continua 100% funcional.');
      return;
    }
    map = L.map('studio-map').setView([38.5, -7.8], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      const trip = getActiveTrip();
      const lastKm = trip.waypoints.length > 0 ? trip.waypoints[trip.waypoints.length - 1].km : 0;
      trip.waypoints.push({
        name: `Ponto ${trip.waypoints.length + 1}`,
        type: 'viewpoint',
        lat: Number(e.latlng.lat.toFixed(5)),
        lng: Number(e.latlng.lng.toFixed(5)),
        km: lastKm + 25
      });
      saveState();
      renderAll();
      showToast('📍 Novo waypoint adicionado no mapa!');
    });
  } catch (err) {
    console.error('Erro ao iniciar mapa:', err);
  }
}

function renderAll() {
  const trip = getActiveTrip();
  if (!trip) return;

  // Selector de viagens
  const sel = document.getElementById('tripSelect');
  sel.innerHTML = trips.map(t => `<option value="${t.id}" ${t.id === trip.id ? 'selected' : ''}>[${t.tripCode || 'SEM-COD'}] ${t.tripTitle}</option>`).join('');

  // Campos da ficha
  document.getElementById('inpTripCode').value = trip.tripCode || '';
  document.getElementById('inpProfile').value = trip.profile || 'moto';
  document.getElementById('inpTripTitle').value = trip.tripTitle || '';
  document.getElementById('inpStageSubtitle').value = trip.stageSubtitle || '';
  document.getElementById('inpOdometer').value = trip.odometerKm || 0;
  document.getElementById('inpTank').value = trip.tankCapacityL || 14.1;
  document.getElementById('inpAvgCons').value = trip.avgConsumptionL100 || 3.8;

  renderWaypointsEditor(trip);
  renderMapLayers(trip);
  renderRoadbookA4(trip);
  renderExpenses(trip);
}

function renderWaypointsEditor(trip) {
  const container = document.getElementById('wpEditorList');
  container.innerHTML = '';

  (trip.waypoints || []).forEach((wp, idx) => {
    const row = document.createElement('div');
    row.className = 'wp-row';
    row.innerHTML = `
      <select data-idx="${idx}" class="wp-type">
        <option value="start" ${wp.type === 'start' ? 'selected' : ''}>🏁 Partida</option>
        <option value="fuel" ${wp.type === 'fuel' ? 'selected' : ''}>⛽ Posto</option>
        <option value="viewpoint" ${wp.type === 'viewpoint' ? 'selected' : ''}>📸 Paragem</option>
        <option value="monument" ${wp.type === 'monument' ? 'selected' : ''}>🏛️ Visita</option>
        <option value="sleep" ${wp.type === 'sleep' ? 'selected' : ''}>🏨 Dormida</option>
      </select>
      <input type="text" data-idx="${idx}" class="wp-name" value="${wp.name}" />
      <input type="number" data-idx="${idx}" class="wp-km" value="${wp.km}" title="Km acumulado" />
      <button type="button" data-idx="${idx}" class="btn-small wp-del" title="Remover">✕</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.wp-type').forEach(el => {
    el.addEventListener('change', (e) => {
      trip.waypoints[e.target.dataset.idx].type = e.target.value;
      saveState();
      renderMapLayers(trip);
      renderRoadbookA4(trip);
    });
  });

  container.querySelectorAll('.wp-name').forEach(el => {
    el.addEventListener('input', (e) => {
      trip.waypoints[e.target.dataset.idx].name = e.target.value;
      saveState();
      renderRoadbookA4(trip);
    });
  });

  container.querySelectorAll('.wp-km').forEach(el => {
    el.addEventListener('input', (e) => {
      trip.waypoints[e.target.dataset.idx].km = Number(e.target.value) || 0;
      saveState();
      renderRoadbookA4(trip);
    });
  });

  container.querySelectorAll('.wp-del').forEach(el => {
    el.addEventListener('click', (e) => {
      trip.waypoints.splice(Number(e.target.dataset.idx), 1);
      saveState();
      renderAll();
    });
  });
}

function renderMapLayers(trip) {
  if (!map || !routeLayer || !markersLayer) return;
  routeLayer.clearLayers();
  markersLayer.clearLayers();

  const coords = (trip.routeCoords && trip.routeCoords.length > 1)
    ? trip.routeCoords
    : (trip.waypoints || []).map(w => [w.lat, w.lng]);

  if (coords.length > 1) {
    const poly = L.polyline(coords, { color: '#f59e0b', weight: 5 }).addTo(routeLayer);
    map.fitBounds(poly.getBounds(), { padding: [25, 25] });
  }

  (trip.waypoints || []).forEach((wp, i) => {
    L.marker([wp.lat, wp.lng])
      .bindPopup(`<strong>${i + 1}. ${wp.name}</strong><br/>Km ${wp.km}`)
      .addTo(markersLayer);
  });
}

function renderRoadbookA4(trip) {
  const sheet = document.getElementById('roadbookPrintSheet');
  const rows = (trip.waypoints || []).map((wp, idx) => `
    <tr>
      <td><strong>#${idx + 1}</strong></td>
      <td>${wp.km} km</td>
      <td>${wp.name}</td>
      <td>${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</td>
    </tr>
  `).join('');

  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;">
      <div>
        <small style="font-weight:700;">MOTOATLAS ROADBOOK • ${trip.tripCode}</small>
        <h2 style="margin:2px 0;">${trip.tripTitle}</h2>
        <div>${trip.stageSubtitle || ''}</div>
      </div>
      <div style="text-align:right;font-size:0.85rem;">
        <div><strong>Odómetro Inicial:</strong> ${trip.odometerKm} km</div>
        <div><strong>Autonomia Est.:</strong> ${Math.round(((trip.tankCapacityL || 14.1) / (trip.avgConsumptionL100 || 3.8)) * 100)} km</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:55px;">Ord.</th>
          <th style="width:90px;">Marco</th>
          <th>Ponto de Passagem / Notas</th>
          <th style="width:165px;">Coordenadas GPS</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4">Sem waypoints definidos.</td></tr>'}</tbody>
    </table>
  `;
}

function renderExpenses(trip) {
  const exps = trip.expenses || [];
  const total = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalLiters = exps.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  document.getElementById('stTotalExpenses').textContent = `${total.toFixed(2)} €`;

  document.getElementById('stStatsSummary').innerHTML = `
    <span><strong>Registos:</strong> ${exps.length}</span>
    <span><strong>Combustível Total:</strong> ${totalLiters.toFixed(2)} L</span>
    <span><strong>Odómetro Consolidado:</strong> ${Math.round(trip.odometerKm || 0)} km</span>
  `;

  const list = document.getElementById('stExpenseList');
  list.innerHTML = exps.length === 0
    ? '<li style="color:var(--muted);">Sem despesas registadas nesta viagem.</li>'
    : exps.slice().reverse().map((e, revIdx) => {
        const realIdx = exps.length - 1 - revIdx;
        return `
          <li>
            <div>
              <strong>${e.category}</strong> (${e.payer || 'Condutor'})
              <div style="font-size:0.78rem;color:var(--muted);">${e.liters ? `${e.liters} L • ` : ''}${e.tripKm ? `+${e.tripKm} km • ` : ''}${e.note || ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <strong>${Number(e.amount).toFixed(2)} €</strong>
              <button type="button" class="btn-small" onclick="window.deleteStudioExpense(${realIdx})">✕</button>
            </div>
          </li>
        `;
      }).join('');
}

window.deleteStudioExpense = function(idx) {
  const trip = getActiveTrip();
  trip.expenses.splice(idx, 1);
  saveState();
  renderExpenses(trip);
};

// --- INTEGRAÇÃO SUPABASE (STUDIO <-> ROAD) ---
function getSbCreds() {
  return {
    url: (localStorage.getItem(SB_URL_KEY) || '').trim().replace(/\/$/, ''),
    key: (localStorage.getItem(SB_ANON_KEY) || '').trim()
  };
}

function setSbIndicator(state, label) {
  const dot = document.getElementById('sbStatusDot');
  const txt = document.getElementById('sbStatusText');
  if (dot) dot.className = `dot ${state}`;
  if (txt) txt.textContent = label;
}

async function checkSupabaseConnection(silent = false) {
  const { url, key } = getSbCreds();
  const feedback = document.getElementById('sbTestResult');

  if (!url || !key) {
    setSbIndicator('offline', 'Supabase Não Configurado');
    if (!silent && feedback) feedback.textContent = '⚠️ Preenche o Project URL e a Anon Public Key.';
    return false;
  }

  if (!silent && feedback) feedback.textContent = '⏳ A testar ligação à tabela motoatlas_trips...';

  try {
    const resp = await fetch(`${url}/rest/v1/motoatlas_trips?select=trip_code&limit=1`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 120)}`);
    }

    setSbIndicator('online', 'Supabase Ligado');
    if (!silent && feedback) feedback.textContent = '✅ Ligação Supabase verificada com sucesso!';
    return true;
  } catch (err) {
    setSbIndicator('error', 'Erro Supabase');
    if (!silent && feedback) feedback.textContent = `❌ Falha na ligação: ${err.message}`;
    return false;
  }
}

async function pushTripToSupabase() {
  const { url, key } = getSbCreds();
  if (!url || !key) {
    window.openSupabaseModal();
    document.getElementById('sbTestResult').textContent = '⚠️ Configura primeiro o Supabase para enviar ao telemóvel.';
    return;
  }

  const trip = getActiveTrip();
  if (!trip.tripCode) {
    showToast('⚠️ Define um Código Curto na viagem (ex: ANDALUZIA-26) antes de enviar.');
    return;
  }

  showToast(`⏳ A enviar "${trip.tripCode}" para o MOTOATLAS Road...`);
  try {
    const resp = await fetch(`${url}/rest/v1/motoatlas_trips`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        trip_code: trip.tripCode.trim().toUpperCase(),
        trip_title: trip.tripTitle,
        status: 'active_road',
        payload: trip,
        updated_at: new Date().toISOString()
      })
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    setSbIndicator('online', 'Supabase Ligado');
    showToast(`✅ Viagem "${trip.tripCode}" publicada! Abre o MOTOATLAS Road e descarrega.`);
  } catch (err) {
    showToast(`❌ Erro ao publicar no Supabase: ${err.message}`);
  }
}

async function pullTripFromSupabase() {
  const { url, key } = getSbCreds();
  if (!url || !key) {
    window.openSupabaseModal();
    return;
  }

  const trip = getActiveTrip();
  const code = (trip.tripCode || '').trim().toUpperCase();
  if (!code) {
    showToast('⚠️ Indica o código da viagem ativa para receber os registos.');
    return;
  }

  showToast(`⏳ A procurar registos da estrada para "${code}"...`);
  try {
    const resp = await fetch(`${url}/rest/v1/motoatlas_trips?trip_code=eq.${encodeURIComponent(code)}&select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const rows = await resp.json();
    if (!rows || rows.length === 0) {
      showToast(`❌ Nenhum registo encontrado na Supabase para "${code}".`);
      return;
    }

    const remoteTrip = rows[0].payload;
    const idx = trips.findIndex(t => t.id === trip.id);
    if (idx !== -1) {
      trips[idx] = { ...trips[idx], ...remoteTrip, id: trip.id };
      saveState();
      renderAll();
    }
    showToast(`✅ Registos recebidos! Despesas (${(remoteTrip.expenses || []).length}) e odómetro (${remoteTrip.odometerKm} km) atualizados.`);
  } catch (err) {
    showToast(`❌ Erro ao receber da estrada: ${err.message}`);
  }
}

// --- EVENTOS DE INTERFACE ---
function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tab-planner' && map) {
        setTimeout(() => map.invalidateSize(), 100);
      }
    });
  });

  // Tema
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', curr === 'dark' ? 'light' : 'dark');
  });

  // Fechar modal ao clicar fora
  document.getElementById('supabaseModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'supabaseModalOverlay') window.closeSupabaseModal();
  });

  // Formulário Supabase
  document.getElementById('sbConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('sbUrlInput').value.trim().replace(/\/$/, '');
    const key = document.getElementById('sbKeyInput').value.trim();
    localStorage.setItem(SB_URL_KEY, url);
    localStorage.setItem(SB_ANON_KEY, key);
    await checkSupabaseConnection(false);
  });

  document.getElementById('btnTestSbOnly').addEventListener('click', async () => {
    const url = document.getElementById('sbUrlInput').value.trim().replace(/\/$/, '');
    const key = document.getElementById('sbKeyInput').value.trim();
    localStorage.setItem(SB_URL_KEY, url);
    localStorage.setItem(SB_ANON_KEY, key);
    await checkSupabaseConnection(false);
  });

  // Gestão de Viagens
  document.getElementById('tripSelect').addEventListener('change', (e) => {
    activeTripId = e.target.value;
    saveState();
    renderAll();
  });

  document.getElementById('btnNewTrip').addEventListener('click', () => {
    const newId = 'trip-' + Date.now();
    trips.push({
      id: newId,
      tripCode: 'NOVA-' + String(trips.length + 1).padStart(2, '0'),
      profile: 'moto',
      tripTitle: 'Nova Expedição',
      stageSubtitle: 'Etapa 1',
      odometerKm: 0,
      tankCapacityL: 14.1,
      avgConsumptionL100: 3.8,
      waypoints: [],
      routeCoords: [],
      expenses: []
    });
    activeTripId = newId;
    saveState();
    renderAll();
  });

  document.getElementById('btnDuplicateTrip').addEventListener('click', () => {
    const curr = getActiveTrip();
    const copy = JSON.parse(JSON.stringify(curr));
    copy.id = 'trip-' + Date.now();
    copy.tripTitle = curr.tripTitle + ' (Cópia)';
    trips.push(copy);
    activeTripId = copy.id;
    saveState();
    renderAll();
    showToast('📋 Viagem duplicada com sucesso.');
  });

  document.getElementById('btnDeleteTrip').addEventListener('click', () => {
    if (trips.length <= 1) {
      showToast('⚠️ Mantém pelo menos uma viagem no arquivo.');
      return;
    }
    trips = trips.filter(t => t.id !== activeTripId);
    activeTripId = trips[0].id;
    saveState();
    renderAll();
    showToast('🗑️ Viagem removida.');
  });

  // Campos editáveis da viagem
  const bindField = (id, prop, isNum = false, upper = false) => {
    document.getElementById(id).addEventListener('input', (e) => {
      const trip = getActiveTrip();
      let val = e.target.value;
      if (isNum) val = parseFloat(val) || 0;
      if (upper) val = val.toUpperCase();
      trip[prop] = val;
      saveState();
      renderRoadbookA4(trip);
      if (prop === 'tripCode' || prop === 'tripTitle') {
        const opt = document.querySelector(`#tripSelect option[value="${trip.id}"]`);
        if (opt) opt.textContent = `[${trip.tripCode || 'SEM-COD'}] ${trip.tripTitle}`;
      }
    });
  };

  bindField('inpTripCode', 'tripCode', false, true);
  bindField('inpProfile', 'profile');
  bindField('inpTripTitle', 'tripTitle');
  bindField('inpStageSubtitle', 'stageSubtitle');
  bindField('inpOdometer', 'odometerKm', true);
  bindField('inpTank', 'tankCapacityL', true);
  bindField('inpAvgCons', 'avgConsumptionL100', true);

  document.getElementById('btnAddWp').addEventListener('click', () => {
    const trip = getActiveTrip();
    const last = trip.waypoints[trip.waypoints.length - 1];
    trip.waypoints.push({
      name: `Paragem ${trip.waypoints.length + 1}`,
      type: 'viewpoint',
      lat: last ? Number((last.lat + 0.05).toFixed(5)) : 38.7223,
      lng: last ? Number((last.lng + 0.05).toFixed(5)) : -9.1393,
      km: last ? last.km + 50 : 0
    });
    saveState();
    renderAll();
  });

  document.getElementById('btnFitMap').addEventListener('click', () => renderMapLayers(getActiveTrip()));

  // Importar GPX
  document.getElementById('gpxFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const trkpts = Array.from(xml.querySelectorAll('trkpt, rtept'));
    if (trkpts.length === 0) {
      showToast('❌ Não foram encontrados pontos de rota no ficheiro GPX.');
      return;
    }
    const trip = getActiveTrip();
    trip.routeCoords = trkpts.map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))]);
    saveState();
    renderMapLayers(trip);
    showToast(`✅ GPX importado (${trip.routeCoords.length} pontos de traçado).`);
  });

  // Despesas no Studio
  document.getElementById('studioExpenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const trip = getActiveTrip();
    const category = document.getElementById('stExpCat').value;
    const amount = parseFloat(document.getElementById('stExpAmount').value) || 0;
    const liters = category === 'Combustível' ? (parseFloat(document.getElementById('stExpLiters').value) || 0) : 0;
    const tripKm = category === 'Combustível' ? (parseFloat(document.getElementById('stExpTripKm').value) || 0) : 0;
    const payer = document.getElementById('stExpPayer').value;
    const note = document.getElementById('stExpNote').value.trim();

    if (tripKm > 0) trip.odometerKm = (trip.odometerKm || 0) + tripKm;
    trip.expenses = trip.expenses || [];
    trip.expenses.push({ id: Date.now(), category, amount, payer, liters, tripKm, note });

    saveState();
    renderAll();
    e.target.reset();
    showToast('💾 Registo adicionado ao histórico da viagem.');
  });

  // Ponte Sync
  document.getElementById('btnPushToRoad').addEventListener('click', pushTripToSupabase);
  document.getElementById('btnPullFromRoad').addEventListener('click', pullTripFromSupabase);

  document.getElementById('btnExportPackage').addEventListener('click', () => {
    const trip = getActiveTrip();
    const blob = new Blob([JSON.stringify({ format: 'motoatlas-package-v6', trip }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(trip.tripCode || 'viagem').toLowerCase()}.motoatlas.json`;
    a.click();
  });

  document.getElementById('importJsonInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.trip ? parsed.trip : parsed;
      const existingIdx = trips.findIndex(t => t.tripCode && t.tripCode === incoming.tripCode);
      if (existingIdx !== -1) {
        trips[existingIdx] = { ...trips[existingIdx], ...incoming, id: trips[existingIdx].id };
        activeTripId = trips[existingIdx].id;
      } else {
        incoming.id = 'trip-' + Date.now();
        trips.push(incoming);
        activeTripId = incoming.id;
      }
      saveState();
      renderAll();
      showToast(`✅ Ficheiro "${incoming.tripTitle}" importado com sucesso!`);
    } catch (err) {
      showToast(`❌ Erro ao ler ficheiro JSON: ${err.message}`);
    }
  });
}
