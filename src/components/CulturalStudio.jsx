import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase';

export default function CulturalStudio({ tripId, onDataChanged }) {
  const supabase = getSupabaseClient();
  const [loadingAI, setLoadingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPois, setSavedPois] = useState([]);
  const [form, setForm] = useState({
    name: '',
    city: '',
    category: 'monument',
    scheduled_time: '',
    location_details: '',
    classification: '',
    construction_period: '',
    dimensions_specs: '',
    architectural_styles: '',
    curiosities: '',
    visitor_tips: '',
    latitude: null,
    longitude: null,
  });

  useEffect(() => {
    if (tripId) loadPois();
  }, [tripId]);

  async function loadPois() {
    const { data } = await supabase
      .from('pois')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    setSavedPois(data || []);
  }

  async function handleAI() {
    if (!form.name || !form.city) return alert('Indica o nome do monumento e a cidade.');
    setLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-poi-sheet', {
        body: { poiName: form.name, city: form.city, category: form.category },
      });
      if (error) throw error;
      setForm((prev) => ({ ...prev, ...data }));
    } catch (err) {
      alert('Erro IA: ' + err.message);
    } finally {
      setLoadingAI(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pois')
        .insert([{ trip_id: tripId, ...form, scheduled_time: form.scheduled_time || null }]);
      if (error) throw error;
      setForm({
        name: '',
        city: '',
        category: 'monument',
        scheduled_time: '',
        location_details: '',
        classification: '',
        construction_period: '',
        dimensions_specs: '',
        architectural_styles: '',
        curiosities: '',
        visitor_tips: '',
        latitude: null,
        longitude: null,
      });
      loadPois();
      if (onDataChanged) onDataChanged();
      alert('Ficha cultural guardada no Supabase!');
    } catch (err) {
      alert('Erro ao guardar ficha: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePoi(poi) {
    if (!confirm(`Remover "${poi.name}"?`)) return;
    await supabase.from('pois').delete().eq('id', poi.id);
    loadPois();
    if (onDataChanged) onDataChanged();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSave} className="df-card p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--line)' }}>
          <div>
            <h2 className="text-lg font-bold m-0">🏛️ Nova Ficha Técnica Cultural</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Sincronizada com o guia offline MotoAtlas Tour
            </p>
          </div>
          <button
            type="button"
            onClick={handleAI}
            disabled={loadingAI}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow transition"
            style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
          >
            {loadingAI ? '⏳ A gerar com Gemini...' : '✨ Preencher Ficha com IA'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            required
            placeholder="Monumento / Local *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="df-input md:col-span-2 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Cidade *"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
          <input
            type="time"
            value={form.scheduled_time}
            onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            placeholder="Localização"
            value={form.location_details}
            onChange={(e) => setForm({ ...form, location_details: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
          <input
            placeholder="Classificação Patrimonial"
            value={form.classification}
            onChange={(e) => setForm({ ...form, classification: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
          <input
            placeholder="Período de Construção"
            value={form.construction_period}
            onChange={(e) => setForm({ ...form, construction_period: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
          <input
            placeholder="Estilos Arquitetónicos"
            value={form.architectural_styles}
            onChange={(e) => setForm({ ...form, architectural_styles: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
        </div>

        <input
          placeholder="Dimensões & Especificações"
          value={form.dimensions_specs}
          onChange={(e) => setForm({ ...form, dimensions_specs: e.target.value })}
          className="df-input w-full px-3 py-2 text-sm"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <textarea
            rows={3}
            placeholder="Curiosidades históricas"
            value={form.curiosities}
            onChange={(e) => setForm({ ...form, curiosities: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Dicas de visita"
            value={form.visitor_tips}
            onChange={(e) => setForm({ ...form, visitor_tips: e.target.value })}
            className="df-input px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            📍 {form.latitude && form.longitude ? `GPS: ${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}` : 'Coordenadas GPS preenchidas pela IA'}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow transition"
            style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
          >
            {saving ? 'A guardar...' : '💾 Guardar Ficha Cultural'}
          </button>
        </div>
      </form>

      {savedPois.length > 0 && (
        <div className="df-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold m-0">📚 Fichas Culturais Guardadas</h3>
            <span className="df-pill">{savedPois.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedPois.map((p) => (
              <div key={p.id} className="df-input p-3.5 flex justify-between items-start text-xs">
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-sm truncate">{p.name}</div>
                  <div className="mt-0.5" style={{ color: 'var(--accent-bright)' }}>
                    {p.city} {p.scheduled_time ? `• ${p.scheduled_time.slice(0, 5)}` : ''}
                  </div>
                  {p.classification && (
                    <div className="truncate mt-1" style={{ color: 'var(--muted)' }}>
                      {p.classification}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePoi(p)}
                  style={{ color: 'var(--red)' }}
                  className="font-bold p-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
