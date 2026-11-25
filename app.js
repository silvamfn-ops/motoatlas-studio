// MOTOATLAS Studio v1.0 (PC) — Gestão, Arquivo Multi-Viagem & Sincronização Supabase/JSON para MOTOATLAS Road
const STUDIO_STORAGE_KEY = 'motoatlas_studio_v1_trips';
const STUDIO_ACTIVE_ID_KEY = 'motoatlas_studio_v1_active_id';
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
    sharedAlbumUrl: '',
    notes: 'Honda NC750X • Verificar pressões antes da saída. Sem restrições ZBE previstas no percurso.',
    updatedAt: '2026-11-25 11:00',
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
    expenses: [
      { id: 1, category: 'Combustível', amount: 21.40, payer: 'Condutor', liters: 12.1, tripKm: 318, note: 'Repsol Mérida' },
      { id: 2, category: 'Alimentação', amount: 28.50, payer: 'Pendura', liters: 0, tripKm: 0, note: 'Almoço em Zafra' }
    ]
  },
  {
    id: 'trip-acores-26',
    tripCode: 'ACORES-SMIGUEL',
    profile: 'leisure',
    tripTitle: 'Roteiro São Miguel — Açores',
    stageSubtitle: 'Dia 1: Ponta Delgada → Sete Cidades & Mosteiros',
    stageDistanceKm: 95,
    odometerKm: 0,
    tankCapacityL: 45,
    avgConsumptionL100: 5.5,
    sharedAlbumUrl: '',
    notes: 'Viagem de lazer • Levar impermeável leve para miradouros em altitude.',
    updatedAt: '2026-11-20 18:30',
    waypoints: [
      { name: 'Partida: Ponta Delgada', type: 'start', lat: 37.7412, lng: -25.6756, km: 0 },
      { name: 'Miradouro da Vista do Rei', type: 'viewpoint', lat: 37.8394, lng: -25.7944, km: 28 },
      { name: 'Piscinas Naturais dos Mosteiros', type: 'monument', lat: 37.8906, lng: -25.8211, km: 44 },
      { name: 'Regresso: Ponta Delgada', type: 'sleep', lat: 37.7412, lng: -25.6756, km: 95 }
    ],
    routeCoords: [
      [37.7412, -25.6756],
      [37.8394, -25.7944],
      [37.8906, -25.8211],
      [37.7412, -25.6756]
    ],
    expenses: []
  }
];

const PIN_ICONS = {
  start: '🏁',
  fuel: '⛽',
  viewpoint: '📸',
  monument: '🏛️',
  sleep: '🏨'
};

let trips = loadTrips();
let activeTripId = localStorage.getItem(STUDIO_ACTIVE_ID_KEY) || trips[0].id;
let map = null;
let routeLayer = null;
let markersLayer = null;

function loadTrips() {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.length > 0 ? parsed : structuredClone(SAMPLE_TRIPS);
  } catch {
    return structuredClone(SAMPLE_TRIPS);
  }
}

function saveTrips() {
  localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(trips));
  localStorage.setItem(STUDIO_ACTIVE_ID_KEY, activeTripId);
}

function getActiveTrip() {
  return trips.find(t => t.id === activeTripId) || trips[0];
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initMap();
  updateSupabaseIndicator();
  renderArchiveList();
  loadTripIntoEditor(getActiveTrip());
  bindEvents();
});

function initTabs() {
  document.querySelectorAll('.s-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.s-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.s-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.pane).classList.add('active');
    });
  });
}

// --- MAP ---
function initMap() {
  map = L.map('studio-map').setView([38.5, -8.0], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    document.getElementById('newWpLat').value = e.latlng.lat.toFixed(5);
    document.getElementById('newWpLng').value = e.latlng.lng.toFixed(5);
    // Muda automaticamente para o separador Etapas & Paragens se não estiver lá
    document.querySelector('.s-tab[data-pane="pane-roadbook"]').click();
    document.getElementById('newWpName').focus();
  });
}

function renderMapForTrip(trip) {
  if (!map) return;
  routeLayer.clearLayers();
  markersLayer.clearLayers();

  const coords = trip.routeCoords && trip.routeCoords.length > 1
    ? trip.routeCoords
    : (trip.waypoints || []).map(w => [w.lat, w.lng]);

  if (coords.length > 1) {
    const poly = L.polyline(coords, { color: '#d97706', weight: 5, opacity: 0.92 }).addTo(routeLayer);
    map.fitBounds(poly.getBounds(), { padding: [25, 25] });
  } else if (coords.length === 1) {
    map.setView(coords[0], 11);
  }

  (trip.waypoints || []).forEach((wp, idx) => {
    const iconHtml = `<div style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.65))">${PIN_ICONS[wp.type] || '📍'}</div>`;
    const customIcon = L.divIcon({ html: iconHtml, className: 'custom-pin', iconSize: [24, 24] });
    L.marker([wp.lat, wp.lng], { icon: customIcon })
      .bindPopup(`<strong>${idx + 1}. ${wp.name}</strong><br/>Km ${wp.km}`)
      .addTo(markersLayer);
  });
}

// --- ARCHIVE LIST ---
function renderArchiveList(filterText = '') {
  const list = document.getElementById('tripArchiveList');
  const badge = document.getElementById('archiveCountBadge');
  const q = filterText.trim().toLowerCase();

  const filtered = trips.filter(t =>
    t.tripTitle.toLowerCase().includes(q) ||
    t.tripCode.toLowerCase().includes(q) ||
    t.stageSubtitle.toLowerCase().includes(q)
  );

  badge.textContent = trips.length;
  list.innerHTML = '';

  filtered.forEach(trip => {
    const li = document.createElement('li');
    li.className = `archive-item ${trip.id === activeTripId ? 'active' : ''}`;
    li.innerHTML = `
      <div class="archive-item-top">
        <span class="code-chip">${trip.profile === 'moto' ? '🏍️' : '🧭'} ${trip.tripCode}</span>
        <button type="button" class="btn-sm" title="Eliminar viagem" onclick="event.stopPropagation(); deleteTrip('${trip.id}')">🗑️</button>
      </div>
      <strong>${trip.tripTitle}</strong>
      <div class="archive-meta">${trip.stageDistanceKm} km • ${(trip.waypoints || []).length} paragens</div>
    `;
    li.addEventListener('click', () => {
      activeTripId = trip.id;
      saveTrips();
      renderArchiveList(document.getElementById('archiveSearchInput').value);
      loadTripIntoEditor(trip);
    });
    list.appendChild(li);
  });
}

window.deleteTrip = function(id) {
  if (trips.length <= 1) {
    alert('Deves manter pelo menos uma expedição no arquivo.');
    return;
  }
  trips = trips.filter(t => t.id !== id);
  if (activeTripId === id) activeTripId = trips[0].id;
  saveTrips();
  renderArchiveList();
  loadTripIntoEditor(getActiveTrip());
};

// --- EDITOR ---
function loadTripIntoEditor(trip) {
  document.getElementById('activeTripCodeTag').textContent = `CÓDIGO SYNC: ${trip.tripCode}`;
  document.getElementById('editorTripHeading').textContent = trip.tripTitle;

  document.getElementById('fldTripCode').value = trip.tripCode;
  document.getElementById('fldTripProfile').value = trip.profile || 'moto';
  document.getElementById('fldTripTitle').value = trip.tripTitle;
  document.getElementById('fldStageSubtitle').value = trip.stageSubtitle;
  document.getElementById('fldStageKm').value = trip.stageDistanceKm;
  document.getElementById('fldOdoKm').value = trip.odometerKm || 0;
  document.getElementById('fldTankL').value = trip.tankCapacityL || 14.1;
  document.getElementById('fldAvgL100').value = trip.avgConsumptionL100 || 3.8;
  document.getElementById('fldAlbumUrl').value = trip.sharedAlbumUrl || '';
  document.getElementById('fldTripNotes').value = trip.notes || '';

  renderWaypointsTable(trip);
  renderExpensesReport(trip);
  renderMapForTrip(trip);
}

function saveEditorFormToTrip() {
  const trip = getActiveTrip();
  trip.tripCode = document.getElementById('fldTripCode').value.trim().toUpperCase() || trip.tripCode;
  trip.profile = document.getElementById('fldTripProfile').value;
  trip.tripTitle = document.getElementById('fldTripTitle').value.trim() || trip.tripTitle;
  trip.stageSubtitle = document.getElementById('fldStageSubtitle').value.trim();
  trip.stageDistanceKm = parseFloat(document.getElementById('fldStageKm').value) || 0;
  trip.odometerKm = parseFloat(document.getElementById('fldOdoKm').value) || 0;
  trip.tankCapacityL = parseFloat(document.getElementById('fldTankL').value) || 14.1;
  trip.avgConsumptionL100 = parseFloat(document.getElementById('fldAvgL100').value) || 3.8;
  trip.sharedAlbumUrl = document.getElementById('fldAlbumUrl').value.trim();
  trip.notes = document.getElementById('fldTripNotes').value.trim();
  trip.updatedAt = new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });

  saveTrips();
  renderArchiveList(document.getElementById('archiveSearchInput').value);
  loadTripIntoEditor(trip);
}

function renderWaypointsTable(trip) {
  const tbody = document.getElementById('wpTableBody');
  tbody.innerHTML = '';
  (trip.waypoints || []).forEach((wp, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${PIN_ICONS[wp.type] || '📍'}</td>
      <td><strong>${wp.name}</strong></td>
      <td>${wp.km} km</td>
      <td>${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</td>
      <td>
        <button type="button" class="btn-sm" onclick="focusWaypoint(${idx})" title="Ver no mapa">🎯</button>
        <button type="button" class="btn-sm" onclick="removeWaypoint(${idx})" title="Remover">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.focusWaypoint = function(idx) {
  const wp = getActiveTrip().waypoints[idx];
  if (wp && map) map.setView([wp.lat, wp.lng], 13);
};

window.removeWaypoint = function(idx) {
  const trip = getActiveTrip();
  trip.waypoints.splice(idx, 1);
  saveTrips();
  renderWaypointsTable(trip);
  renderMapForTrip(trip);
};

function renderExpensesReport(trip) {
  const stats = document.getElementById('studioExpenseStats');
  const tbody = document.getElementById('studioExpenseBody');
  const exps = trip.expenses || [];
  const total = exps.reduce((s, e) => s + e.amount, 0);
  const fuelTotal = exps.filter(e => e.category === 'Combustível').reduce((s, e) => s + e.amount, 0);

  stats.innerHTML = `
    <div class="stat-box"><span class="archive-meta">Total Despesas</span><br/><strong>${total.toFixed(2)} €</strong></div>
    <div class="stat-box"><span class="archive-meta">Combustível</span><br/><strong>${fuelTotal.toFixed(2)} €</strong></div>
    <div class="stat-box"><span class="archive-meta">Registos</span><br/><strong>${exps.length}</strong></div>
  `;

  tbody.innerHTML = exps.length === 0
    ? '<tr><td colspan="5" class="muted">Sem despesas registadas nesta viagem (serão preenchidas após o regresso da estrada).</td></tr>'
    : exps.map(e => `
        <tr>
          <td>${e.category}</td>
          <td>${e.payer}</td>
          <td><strong>${e.amount.toFixed(2)} €</strong></td>
          <td>${e.liters ? `${e.liters} L / ${e.tripKm} km` : '—'}</td>
          <td>${e.note || ''}</td>
        </tr>
      `).join('');
}

// --- SUPABASE SYNC BRIDGE (STUDIO <-> ROAD) ---
function getSupabaseCreds() {
  return {
    url: (localStorage.getItem(SB_URL_KEY) || '').trim().replace(/\/$/, ''),
    key: (localStorage.getItem(SB_ANON_KEY) || '').trim()
  };
}

function updateSupabaseIndicator() {
  const { url, key } = getSupabaseCreds();
  const dot = document.getElementById('sbDot');
  const txt = document.getElementById('sbStatusText');
  if (url && key) {
    dot.className = 'dot online';
    txt.textContent = 'Supabase Ligado';
  } else {
    dot.className = 'dot offline';
    txt.textContent = 'Modo Local (Supabase Off)';
  }
}

async function pushActiveTripToSupabase() {
  saveEditorFormToTrip();
  const trip = getActiveTrip();
  const statusEl = document.getElementById('pushStatusMsg');
  const { url, key } = getSupabaseCreds();

  if (!url || !key) {
    statusEl.textContent = '⚠️ Configura primeiro o URL e a Anon Key do Supabase no botão superior.';
    return;
  }

  statusEl.textContent = '⏳ A enviar expedição para a Supabase...';
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
        trip_code: trip.tripCode,
        trip_title: trip.tripTitle,
        status: 'active_road',
        payload: trip,
        updated_at: new Date().toISOString()
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} — Verifica se a tabela motoatlas_trips existe.`);
    statusEl.textContent = `✅ Viagem "${trip.tripCode}" publicada! Já podes importá-la no MOTOATLAS Road.`;
  } catch (err) {
    statusEl.textContent = `❌ Erro ao enviar: ${err.message}`;
  }
}

async function pullCompletedTripFromSupabase() {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) {
    alert('Configura primeiro a ligação Supabase para receber registos enviados pela app de estrada.');
    return;
  }

  const trip = getActiveTrip();
  try {
    const resp = await fetch(
      `${url}/rest/v1/motoatlas_trips?trip_code=eq.${encodeURIComponent(trip.tripCode)}&select=*`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      }
    );
    const rows = await resp.json();
    if (!rows || rows.length === 0) {
      alert(`Não foi encontrada nenhuma viagem com o código "${trip.tripCode}" na Supabase.`);
      return;
    }
    const remotePayload = rows[0].payload;
    const idx = trips.findIndex(t => t.id === trip.id);
    if (idx !== -1 && remotePayload) {
      trips[idx] = { ...trips[idx], ...remotePayload, id: trip.id };
      saveTrips();
      renderArchiveList();
      loadTripIntoEditor(trips[idx]);
      alert(`✅ Dados atualizados recebidos da estrada para "${trip.tripTitle}"!`);
    }
  } catch (err) {
    alert(`Erro ao sincronizar da Supabase: ${err.message}`);
  }
}

// --- FILE IMPORT / EXPORT ---
function downloadSingleTripPackage() {
  saveEditorFormToTrip();
  const trip = getActiveTrip();
  const pkg = {
    format: 'motoatlas-road-package-v1',
    exportedAt: new Date().toISOString(),
    trip
  };
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${trip.tripCode.toLowerCase()}.motoatlas.json`;
  a.click();
}

async function handleStudioFileImport(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    const parsed = JSON.parse(await file.text());
    const importedTrip = parsed.trip ? parsed.trip : parsed;
    importedTrip.id = `trip-${Date.now()}`;
    importedTrip.tripCode = importedTrip.tripCode || `IMP-${Math.floor(Math.random() * 900 + 100)}`;
    trips.unshift(importedTrip);
    activeTripId = importedTrip.id;
    saveTrips();
    renderArchiveList();
    loadTripIntoEditor(importedTrip);
    return;
  }

  let xmlText = '';
  if (name.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(file);
    const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
    if (!kmlFile) throw new Error('KML não encontrado no KMZ');
    xmlText = await kmlFile.async('text');
  } else {
    xmlText = await file.text();
  }

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const coords = [];
  const wpts = [];

  if (name.endsWith('.gpx')) {
    doc.querySelectorAll('trkpt, rtept').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lng)) coords.push([lat, lng]);
    });
    doc.querySelectorAll('wpt').forEach((pt, idx) => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      const wName = pt.querySelector('name')?.textContent || `Paragem ${idx + 1}`;
      wpts.push({ name: wName, type: 'viewpoint', lat, lng, km: idx * 45 });
    });
  } else {
    doc.querySelectorAll('LineString coordinates').forEach(node => {
      node.textContent.trim().split(/\s+/).forEach(pair => {
        const [lng, lat] = pair.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) coords.push([lat, lng]);
      });
    });
    doc.querySelectorAll('Placemark').forEach((pm, idx) => {
      const pt = pm.querySelector('Point coordinates');
      if (pt) {
        const [lng, lat] = pt.textContent.trim().split(',').map(Number);
        const wName = pm.querySelector('name')?.textContent || `Ponto ${idx + 1}`;
        wpts.push({ name: wName, type: 'monument', lat, lng, km: idx * 40 });
      }
    });
  }

  const newTrip = {
    id: `trip-${Date.now()}`,
    tripCode: file.name.replace(/\.[^/.]+$/, '').toUpperCase().slice(0, 14),
    profile: 'moto',
    tripTitle: file.name.replace(/\.[^/.]+$/, ''),
    stageSubtitle: `Rota importada (${coords.length} pontos)`,
    stageDistanceKm: wpts.length > 0 ? wpts[wpts.length - 1].km : 150,
    odometerKm: 0,
    tankCapacityL: 14.1,
    avgConsumptionL100: 3.8,
    sharedAlbumUrl: '',
    notes: '',
    waypoints: wpts,
    routeCoords: coords,
    expenses: []
  };

  trips.unshift(newTrip);
  activeTripId = newTrip.id;
  saveTrips();
  renderArchiveList();
  loadTripIntoEditor(newTrip);
}

// --- EVENTS ---
function bindEvents() {
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', curr === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('archiveSearchInput').addEventListener('input', (e) => {
    renderArchiveList(e.target.value);
  });

  document.getElementById('btnNewTrip').addEventListener('click', () => {
    const newTrip = {
      id: `trip-${Date.now()}`,
      tripCode: `EXP-${Math.floor(Math.random() * 900 + 100)}`,
      profile: 'moto',
      tripTitle: 'Nova Expedição',
      stageSubtitle: 'Etapa 1: Partida → Destino',
      stageDistanceKm: 250,
      odometerKm: 0,
      tankCapacityL: 14.1,
      avgConsumptionL100: 3.8,
      sharedAlbumUrl: '',
      notes: '',
      waypoints: [],
      routeCoords: [],
      expenses: []
    };
    trips.unshift(newTrip);
    activeTripId = newTrip.id;
    saveTrips();
    renderArchiveList();
    loadTripIntoEditor(newTrip);
  });

  document.getElementById('btnDuplicateTrip').addEventListener('click', () => {
    const copy = structuredClone(getActiveTrip());
    copy.id = `trip-${Date.now()}`;
    copy.tripCode = `${copy.tripCode}-CP`;
    copy.tripTitle = `${copy.tripTitle} (Cópia)`;
    trips.unshift(copy);
    activeTripId = copy.id;
    saveTrips();
    renderArchiveList();
    loadTripIntoEditor(copy);
  });

  document.getElementById('btnSaveTrip').addEventListener('click', saveEditorFormToTrip);

  document.getElementById('addWpForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const trip = getActiveTrip();
    trip.waypoints.push({
      name: document.getElementById('newWpName').value.trim(),
      type: document.getElementById('newWpType').value,
      km: parseFloat(document.getElementById('newWpKm').value) || 0,
      lat: parseFloat(document.getElementById('newWpLat').value),
      lng: parseFloat(document.getElementById('newWpLng').value)
    });
    trip.waypoints.sort((a, b) => a.km - b.km);
    saveTrips();
    renderWaypointsTable(trip);
    renderMapForTrip(trip);
    e.target.reset();
  });

  document.getElementById('btnFitRoute').addEventListener('click', () => renderMapForTrip(getActiveTrip()));

  document.getElementById('btnDownloadRoadPackage').addEventListener('click', downloadSingleTripPackage);
  document.getElementById('btnPrintRoadbook').addEventListener('click', () => window.print());

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    const trip = getActiveTrip();
    const rows = [['Categoria', 'Pagador', 'Valor_EUR', 'Litros', 'Km', 'Nota']];
    (trip.expenses || []).forEach(e => {
      rows.push([e.category, e.payer, e.amount.toFixed(2), e.liters || 0, e.tripKm || 0, `"${e.note || ''}"`]);
    });
    const blob = new Blob([rows.map(r => r.join(',')).join('
')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.tripCode.toLowerCase()}_despesas.csv`;
    a.click();
  });

  document.getElementById('studioFileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handleStudioFileImport(e.target.files[0]);
  });

  // Supabase Modal & Sync
  document.getElementById('btnOpenSupabaseModal').addEventListener('click', () => {
    const { url, key } = getSupabaseCreds();
    document.getElementById('sbUrlInput').value = url;
    document.getElementById('sbKeyInput').value = key;
    document.getElementById('supabaseModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseSupabaseModal').addEventListener('click', () => {
    document.getElementById('supabaseModal').classList.add('hidden');
  });

  document.getElementById('btnShowSqlSchema').addEventListener('click', () => {
    document.getElementById('sqlSchemaBox').classList.toggle('hidden');
  });

  document.getElementById('supabaseConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('sbUrlInput').value.trim().replace(/\/$/, '');
    const key = document.getElementById('sbKeyInput').value.trim();
    localStorage.setItem(SB_URL_KEY, url);
    localStorage.setItem(SB_ANON_KEY, key);
    updateSupabaseIndicator();

    const resEl = document.getElementById('sbTestResult');
    resEl.textContent = '⏳ A testar ligação à tabela motoatlas_trips...';
    try {
      const resp = await fetch(`${url}/rest/v1/motoatlas_trips?limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} (cria a tabela usando o botão "Ver SQL da Tabela")`);
      resEl.textContent = '✅ Ligação Supabase verificada com sucesso!';
    } catch (err) {
      resEl.textContent = `⚠️ Guardado localmente, mas o teste falhou: ${err.message}`;
    }
  });

  document.getElementById('btnPushToSupabase').addEventListener('click', pushActiveTripToSupabase);
  document.getElementById('btnPullFromRoad').addEventListener('click', pullCompletedTripFromSupabase);
}
