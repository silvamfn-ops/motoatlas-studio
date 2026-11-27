import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import JSZip from 'jszip';
import { getSupabaseClient } from '../lib/supabase';

const WAYPOINT_CONFIG = {
  fuel: { label: 'Combustível', color: '#2B5B84', icon: '⛽' },
  zbe_warning: { label: 'Alerta ZBE', color: '#dc2626', icon: '⚠️' },
  coffee_stop: { label: 'Paragem / Café', color: '#0d9488', icon: '☕' },
  viewpoint: { label: 'Miradouro', color: '#4f46e5', icon: '📷' },
  meeting_point: { label: 'Encontro', color: '#475569', icon: '📍' },
};

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseKmlString(kmlText) {
  const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
  const coordsNodes = Array.from(xml.querySelectorAll('LineString coordinates'));
  const routePoints = [];

  coordsNodes.forEach((node) => {
    const pairs = node.textContent.trim().split(/\s+/);
    pairs.forEach((pair) => {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          routePoints.push([lat, lon]);
        }
      }
    });
  });

  const placemarks = Array.from(xml.querySelectorAll('Placemark'));
  const extractedPins = [];
  placemarks.forEach((pm) => {
    const pointNode = pm.querySelector('Point coordinates');
    if (pointNode) {
      const name = pm.querySelector('name')?.textContent?.trim() || 'Ponto KMZ';
      const desc = pm.querySelector('description')?.textContent?.trim() || '';
      const parts = pointNode.textContent.trim().split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          extractedPins.push({
            name,
            notes: desc.replace(/<[^>]*>?/gm, '').slice(0, 120),
            latitude: lat,
            longitude: lon,
          });
        }
      }
    }
  });

  return { routePoints, extractedPins };
}

export default function StageBuilder({ tripId, summaryLevel = 'detailed', onDataChanged }) {
  const supabase = getSupabaseClient();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layerGroup = useRef(null);

  const [activeTool, setActiveTool] = useState('fuel');
  const activeToolRef = useRef('fuel');
  const [routeCoords, setRouteCoords] = useState([]);
  const routeCoordsRef = useRef([]);
  const [waypoints, setWaypoints] = useState([]);
  const [savedStages, setSavedStages] = useState([]);
  const [editingStageId, setEditingStageId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Acordeoes recolhiveis em mobile/compacto (estilo DuoFin 2)
  const [showBuilderCard, setShowBuilderCard] = useState(true);
  const [showSavedListCard, setShowSavedListCard] = useState(true);

  const [form, setForm] = useState({
    day_number: 1,
    stage_date: '',
    title: '',
    origin_name: '',
    destination_name: '',
    estimated_distance_km: 0,
    estimated_duration_minutes: 0,
    traffic_zbe_alerts: '',
  });

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    routeCoordsRef.current = routeCoords;
  }, [routeCoords]);

  useEffect(() => {
    if (tripId) {
      cancelEditing(false);
      loadSavedStages();
    }
  }, [tripId]);

  async function loadSavedStages() {
    const { data, error } = await supabase
      .from('stages')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (!error && data) {
      setSavedStages(data);
      if (!editingStageId) {
        setForm((prev) => ({
          ...prev,
          day_number: data.length > 0 ? Math.max(...data.map((s) => s.day_number)) + 1 : 1,
        }));
      }
    }
  }

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([38.75, -8.5], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerGroup.current = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      const tool = activeToolRef.current;
      const coords = routeCoordsRef.current;
      let kmFromStart = 0;

      if (coords.length > 0) {
        let minDist = Infinity;
        let closestIdx = 0;
        coords.forEach((pt, idx) => {
          const d = haversineKm(pt, [e.latlng.lat, e.latlng.lng]);
          if (d < minDist) {
            minDist = d;
            closestIdx = idx;
          }
        });
        for (let i = 1; i <= closestIdx; i++) {
          kmFromStart += haversineKm(coords[i - 1], coords[i]);
        }
      }

      setWaypoints((prev) =>
        [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: `${WAYPOINT_CONFIG[tool].label} #${prev.length + 1}`,
            waypoint_type: tool,
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            km_from_start: Math.round(kmFromStart * 10) / 10,
            notes: '',
          },
        ].sort((a, b) => a.km_from_start - b.km_from_start)
      );
    });

    mapInstance.current = map;

    // Garante que o mapa se adapta corretamente quando o contentor muda de tamanho
    const ro = new ResizeObserver(() => {
      if (mapInstance.current) mapInstance.current.invalidateSize();
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [showBuilderCard]);

  useEffect(() => {
    if (!layerGroup.current || !mapInstance.current) return;
    layerGroup.current.clearLayers();

    if (routeCoords.length > 0) {
      L.polyline(routeCoords, { color: '#C5CCD4', weight: 8, opacity: 0.8 }).addTo(layerGroup.current);
      const poly = L.polyline(routeCoords, { color: '#1E466E', weight: 5, opacity: 0.95 }).addTo(layerGroup.current);
      mapInstance.current.fitBounds(poly.getBounds(), { padding: [30, 30] });
    }

    waypoints.forEach((wp) => {
      const cfg = WAYPOINT_CONFIG[wp.waypoint_type] || WAYPOINT_CONFIG.meeting_point;
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${cfg.color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.45);">${cfg.icon}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([wp.latitude, wp.longitude], { icon })
        .bindPopup(`<b>${wp.name}</b><br>km ${wp.km_from_start}`)
        .addTo(layerGroup.current);
    });
  }, [routeCoords, waypoints]);

  function applyExtractedRoute(pts, fileName, extractedPins = []) {
    if (pts.length === 0) {
      alert('O ficheiro não contém pontos de rota válidos.');
      return;
    }
    const step = Math.max(1, Math.floor(pts.length / 400));
    const simplified = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    let totalKm = 0;
    for (let i = 1; i < pts.length; i++) {
      totalKm += haversineKm(pts[i - 1], pts[i]);
    }
    const roundedKm = Math.round(totalKm * 10) / 10;
    const cleanTitle = fileName.replace(/\.(gpx|kmz|kml)$/i, '');

    setRouteCoords(simplified);
    setForm((prev) => ({
      ...prev,
      title: prev.title || cleanTitle,
      origin_name: prev.origin_name || 'Partida',
      destination_name: prev.destination_name || 'Chegada',
      estimated_distance_km: roundedKm,
      estimated_duration_minutes: Math.round((roundedKm / 68) * 60),
    }));

    if (extractedPins.length > 0) {
      const newWps = extractedPins.map((pin) => {
        let kmFromStart = 0;
        let minDist = Infinity;
        let closestIdx = 0;
        simplified.forEach((pt, idx) => {
          const d = haversineKm(pt, [pin.latitude, pin.longitude]);
          if (d < minDist) {
            minDist = d;
            closestIdx = idx;
          }
        });
        for (let i = 1; i <= closestIdx; i++) {
          kmFromStart += haversineKm(simplified[i - 1], simplified[i]);
        }

        const lowerName = pin.name.toLowerCase();
        let wpType = 'meeting_point';
        if (lowerName.includes('gas') || lowerName.includes('combust') || lowerName.includes('repsol') || lowerName.includes('galp') || lowerName.includes('cepsa')) wpType = 'fuel';
        else if (lowerName.includes('zbe') || lowerName.includes('alerta') || lowerName.includes('radar')) wpType = 'zbe_warning';
        else if (lowerName.includes('caf') || lowerName.includes('almo') || lowerName.includes('restaurante')) wpType = 'coffee_stop';
        else if (lowerName.includes('miradouro') || lowerName.includes('vista')) wpType = 'viewpoint';

        return {
          id: crypto.randomUUID(),
          name: pin.name,
          waypoint_type: wpType,
          latitude: pin.latitude,
          longitude: pin.longitude,
          km_from_start: Math.round(kmFromStart * 10) / 10,
          notes: pin.notes,
        };
      });
      setWaypoints((prev) => [...prev, ...newWps].sort((a, b) => a.km_from_start - b.km_from_start));
    }
  }

  async function handleRouteFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();

    try {
      if (lower.endsWith('.gpx')) {
        const text = await file.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        const pts = Array.from(xml.querySelectorAll('trkpt, rtept')).map((p) => [
          parseFloat(p.getAttribute('lat')),
          parseFloat(p.getAttribute('lon')),
        ]);
        applyExtractedRoute(pts, file.name);
      } else if (lower.endsWith('.kml')) {
        const text = await file.text();
        const { routePoints, extractedPins } = parseKmlString(text);
        applyExtractedRoute(routePoints, file.name, extractedPins);
      } else if (lower.endsWith('.kmz')) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const kmlFileName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));
        if (!kmlFileName) {
          return alert('O ficheiro KMZ não contém nenhum mapa KML válido no interior.');
        }
        const kmlText = await zip.files[kmlFileName].async('text');
        const { routePoints, extractedPins } = parseKmlString(kmlText);
        applyExtractedRoute(routePoints, file.name, extractedPins);
      } else {
        alert('Formato não suportado. Escolhe .GPX, .KMZ ou .KML.');
      }
    } catch (err) {
      alert('Erro ao ler ficheiro de rota: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }

  async function handleEditStage(stage) {
    setLoadingEdit(true);
    setStatusMsg(null);
    setShowBuilderCard(true);
    try {
      const { data: wpsData, error: wpErr } = await supabase
        .from('route_waypoints')
        .select('*')
        .eq('stage_id', stage.id)
        .order('km_from_start', { ascending: true });

      if (wpErr) throw wpErr;

      setEditingStageId(stage.id);
      setForm({
        day_number: stage.day_number ?? 1,
        stage_date: stage.stage_date || '',
        title: stage.title || '',
        origin_name: stage.origin_name || '',
        destination_name: stage.destination_name || '',
        estimated_distance_km: stage.estimated_distance_km ?? 0,
        estimated_duration_minutes: stage.estimated_duration_minutes ?? 0,
        traffic_zbe_alerts: stage.traffic_zbe_alerts || '',
      });

      setRouteCoords(Array.isArray(stage.route_geometry) ? stage.route_geometry : []);
      setWaypoints(
        (wpsData || []).map((w) => ({
          id: w.id || crypto.randomUUID(),
          name: w.name,
          waypoint_type: w.waypoint_type,
          latitude: w.latitude,
          longitude: w.longitude,
          km_from_start: w.km_from_start,
          notes: w.notes || '',
        }))
      );

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert('Erro ao abrir etapa para edição: ' + err.message);
    } finally {
      setLoadingEdit(false);
    }
  }

  function cancelEditing(resetDay = true) {
    setEditingStageId(null);
    setRouteCoords([]);
    setWaypoints([]);
    setStatusMsg(null);
    setForm({
      day_number: resetDay && savedStages.length > 0 ? Math.max(...savedStages.map((s) => s.day_number)) + 1 : 1,
      stage_date: '',
      title: '',
      origin_name: '',
      destination_name: '',
      estimated_distance_km: 0,
      estimated_duration_minutes: 0,
      traffic_zbe_alerts: '',
    });
  }

  function updateWaypointName(id, newName) {
    setWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, name: newName } : w)));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!tripId) {
      setStatusMsg({ type: 'error', text: 'Seleciona ou cria uma viagem primeiro.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    try {
      const payload = {
        trip_id: tripId,
        day_number: Number(form.day_number) || 1,
        stage_date: form.stage_date || null,
        title: form.title.trim(),
        origin_name: form.origin_name.trim(),
        destination_name: form.destination_name.trim(),
        estimated_distance_km: Number(form.estimated_distance_km) || 0,
        estimated_duration_minutes: Number(form.estimated_duration_minutes) || 0,
        route_geometry: routeCoords.length > 0 ? routeCoords : null,
        traffic_zbe_alerts: form.traffic_zbe_alerts.trim() || null,
      };

      let targetStageId = editingStageId;

      if (editingStageId) {
        const { error: updErr } = await supabase
          .from('stages')
          .update(payload)
          .eq('id', editingStageId);
        if (updErr) throw updErr;

        const { error: delWpErr } = await supabase
          .from('route_waypoints')
          .delete()
          .eq('stage_id', editingStageId);
        if (delWpErr) throw delWpErr;
      } else {
        const { data: stage, error } = await supabase
          .from('stages')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        targetStageId = stage.id;
      }

      if (waypoints.length > 0 && targetStageId) {
        const wpRows = waypoints.map((w, idx) => ({
          stage_id: targetStageId,
          order_index: idx + 1,
          name: w.name,
          waypoint_type: w.waypoint_type,
          latitude: w.latitude,
          longitude: w.longitude,
          km_from_start: w.km_from_start,
          notes: w.notes || null,
        }));

        const { error: wpErr } = await supabase.from('route_waypoints').insert(wpRows);
        if (wpErr) throw wpErr;
      }

      const wasEditing = Boolean(editingStageId);
      setEditingStageId(null);
      setRouteCoords([]);
      setWaypoints([]);

      const { data: refreshed } = await supabase
        .from('stages')
        .select('*')
        .eq('trip_id', tripId)
        .order('day_number', { ascending: true });

      const nextDay = refreshed && refreshed.length > 0 ? Math.max(...refreshed.map((s) => s.day_number)) + 1 : 1;
      setSavedStages(refreshed || []);
      if (onDataChanged) onDataChanged();

      setForm({
        day_number: nextDay,
        stage_date: '',
        title: '',
        origin_name: '',
        destination_name: '',
        estimated_distance_km: 0,
        estimated_duration_minutes: 0,
        traffic_zbe_alerts: '',
      });

      setStatusMsg({
        type: 'success',
        text: wasEditing
          ? `Alterações na etapa "${payload.title}" guardadas com sucesso!`
          : `Etapa "${payload.title}" guardada com sucesso!`,
      });
    } catch (err) {
      console.error('Erro detalhado ao guardar etapa:', err);
      setStatusMsg({
        type: 'error',
        text: `Erro ao guardar: ${err.message || JSON.stringify(err)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStage(stage) {
    if (!confirm(`Remover a etapa "${stage.title}"?`)) return;
    const { error } = await supabase.from('stages').delete().eq('id', stage.id);
    if (error) alert('Erro ao remover: ' + error.message);
    else {
      if (editingStageId === stage.id) cancelEditing();
      loadSavedStages();
      if (onDataChanged) onDataChanged();
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Cartao 1: Construtor + Mapa (com cabecalho recolhivel estilo DuoFin 2) */}
      <div
        className="df-card p-4 sm:p-6"
        style={editingStageId ? { borderColor: 'var(--accent-bright)' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowBuilderCard(!showBuilderCard)}
            className="flex items-center gap-2 text-left"
          >
            <h2 className="text-base sm:text-lg font-bold m-0">
              {editingStageId ? '✎ Editar Etapa Guardada' : '🗺️ Construtor de Etapa & Mapa'}
            </h2>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {showBuilderCard ? '▴' : '▾'}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {editingStageId && (
              <button
                type="button"
                onClick={() => cancelEditing()}
                className="df-input px-2.5 py-1.5 text-xs font-semibold"
              >
                ✕ Cancelar
              </button>
            )}
            <label
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
            >
              <span>📂</span>
              <span>{editingStageId ? 'Substituir GPX/KMZ' : 'Importar GPX / KMZ'}</span>
              <input type="file" accept=".gpx,.kmz,.kml" onChange={handleRouteFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {showBuilderCard && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
            <form onSubmit={handleSave} className="lg:col-span-5 space-y-3.5">
              {statusMsg && (
                <div
                  className="p-3 rounded-xl text-xs font-medium border"
                  style={
                    statusMsg.type === 'success'
                      ? { background: 'rgba(16,185,129,0.12)', borderColor: 'var(--good)', color: 'var(--good)' }
                      : { background: 'rgba(239,68,68,0.12)', borderColor: 'var(--red)', color: 'var(--red)' }
                  }
                >
                  {statusMsg.type === 'success' ? '✅ ' : '⚠️ '}
                  {statusMsg.text}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Dia Nº *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.day_number}
                    onChange={(e) => setForm({ ...form, day_number: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Data</label>
                  <input
                    type="date"
                    value={form.stage_date}
                    onChange={(e) => setForm({ ...form, stage_date: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Título da Etapa *</label>
                <input
                  required
                  placeholder="Ex.: Etapa 1 - Lisboa a Zafra"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="df-input w-full px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Partida *</label>
                  <input
                    required
                    placeholder="Ex.: Lisboa"
                    value={form.origin_name}
                    onChange={(e) => setForm({ ...form, origin_name: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Chegada *</label>
                  <input
                    required
                    placeholder="Ex.: Zafra"
                    value={form.destination_name}
                    onChange={(e) => setForm({ ...form, destination_name: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Distância (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.estimated_distance_km}
                    onChange={(e) => setForm({ ...form, estimated_distance_km: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Duração (min)</label>
                  <input
                    type="number"
                    value={form.estimated_duration_minutes}
                    onChange={(e) => setForm({ ...form, estimated_duration_minutes: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              {summaryLevel === 'detailed' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Alertas ZBE / Trânsito</label>
                  <input
                    placeholder="Ex.: ZBE ativa no centro de Granada"
                    value={form.traffic_zbe_alerts}
                    onChange={(e) => setForm({ ...form, traffic_zbe_alerts: e.target.value })}
                    className="df-input w-full px-3 py-2 text-sm"
                  />
                </div>
              )}

              {waypoints.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {waypoints.map((w) => (
                    <div
                      key={w.id}
                      className="df-input p-2 flex items-center gap-2 text-xs"
                    >
                      <span>{(WAYPOINT_CONFIG[w.waypoint_type] || WAYPOINT_CONFIG.meeting_point).icon}</span>
                      <input
                        value={w.name}
                        onChange={(e) => updateWaypointName(w.id, e.target.value)}
                        className="bg-transparent border-b border-transparent focus:border-current flex-1 outline-none px-1"
                      />
                      <span className="font-mono shrink-0" style={{ color: 'var(--muted)' }}>
                        km {w.km_from_start}
                      </span>
                      <button
                        type="button"
                        onClick={() => setWaypoints(waypoints.filter((x) => x.id !== w.id))}
                        style={{ color: 'var(--red)' }}
                        className="px-1 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white shadow transition disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
              >
                {saving
                  ? 'A guardar...'
                  : editingStageId
                  ? '💾 Guardar Alterações da Etapa'
                  : '💾 Guardar Nova Etapa'}
              </button>
            </form>

            {/* Painel do Mapa Adaptativo */}
            <div className="lg:col-span-7 space-y-2.5 flex flex-col">
              <div
                className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}
              >
                <span className="text-xs font-semibold px-1.5" style={{ color: 'var(--muted)' }}>
                  📍 Marcar:
                </span>
                {Object.entries(WAYPOINT_CONFIG).map(([k, cfg]) => {
                  const selected = activeTool === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setActiveTool(k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        selected ? 'text-white font-semibold' : ''
                      }`}
                      style={
                        selected
                          ? { background: 'var(--accent)' }
                          : { background: 'var(--surface)', color: 'var(--text)' }
                      }
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  );
                })}
              </div>
              <div
                ref={mapRef}
                className="h-[340px] sm:h-[470px] w-full rounded-xl border z-0 flex-1"
                style={{ borderColor: 'var(--line)' }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Cartao 2: Etapas Guardadas (recolhivel estilo DuoFin 2) */}
      <div className="df-card p-4 sm:p-5 space-y-3">
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setShowSavedListCard(!showSavedListCard)}
            className="flex items-center gap-2 text-left"
          >
            <h3 className="text-sm sm:text-base font-bold m-0">
              📋 Etapas Guardadas nesta Viagem
            </h3>
            <span className="df-pill">{savedStages.length}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {showSavedListCard ? '▴' : '▾'}
            </span>
          </button>

          {editingStageId && (
            <button
              type="button"
              onClick={() => cancelEditing()}
              className="text-xs font-semibold underline"
              style={{ color: 'var(--accent-bright)' }}
            >
              + Nova etapa
            </button>
          )}
        </div>

        {showSavedListCard && (
          savedStages.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Ainda não existem etapas guardadas nesta viagem.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedStages.map((st) => {
                const isBeingEdited = editingStageId === st.id;
                return (
                  <div
                    key={st.id}
                    className="df-input p-3.5 flex justify-between items-center text-xs transition"
                    style={
                      isBeingEdited
                        ? { borderColor: 'var(--accent-bright)', borderWidth: '2px' }
                        : undefined
                    }
                  >
                    <div className="pr-2 min-w-0">
                      <div className="font-bold" style={{ color: 'var(--accent-bright)' }}>
                        Dia {st.day_number} • {st.estimated_distance_km} km
                      </div>
                      <div className="font-semibold text-sm truncate mt-0.5">{st.title}</div>
                      <div className="truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                        {st.origin_name} → {st.destination_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={loadingEdit}
                        onClick={() => handleEditStage(st)}
                        className="px-2.5 py-1.5 rounded-lg font-semibold text-white transition"
                        style={{ background: 'var(--accent)' }}
                      >
                        ✎ Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStage(st)}
                        title="Remover etapa"
                        className="p-1.5 font-bold"
                        style={{ color: 'var(--red)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
