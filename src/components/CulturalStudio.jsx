import React, { useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { Sparkles, Save, MapPin } from 'lucide-react';

export default function CulturalStudio({ tripId, onDataChanged }) {
  const supabase = getSupabaseClient();
  const [loadingAI, setLoadingAI] = useState(false);
  const [saving, setSaving] = useState(false);
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
      if (onDataChanged) onDataChanged();
      alert('Ficha cultural guardada no Supabase!');
    } catch (err) {
      alert('Erro ao guardar ficha: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="bg-[#131F2E] p-6 rounded-xl border border-[#24374E] space-y-4">
      <div className="flex justify-between items-center border-b border-[#24374E] pb-4">
        <h2 className="text-lg font-semibold text-[#E2E8F0]">Nova Ficha Técnica Cultural</h2>
        <button
          type="button"
          onClick={handleAI}
          disabled={loadingAI}
          className="flex items-center gap-2 bg-[#C5CCD4] hover:bg-white text-[#0B131E] font-semibold px-4 py-2 rounded-lg text-sm transition"
        >
          <Sparkles className="w-4 h-4" />
          {loadingAI ? 'A gerar com Gemini...' : 'Preencher Ficha com IA'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          required
          placeholder="Monumento / Local"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="md:col-span-2 bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <input
          required
          placeholder="Cidade"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <input
          type="time"
          value={form.scheduled_time}
          onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          placeholder="Localização"
          value={form.location_details}
          onChange={(e) => setForm({ ...form, location_details: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <input
          placeholder="Classificação Patrimonial"
          value={form.classification}
          onChange={(e) => setForm({ ...form, classification: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <input
          placeholder="Período de Construção"
          value={form.construction_period}
          onChange={(e) => setForm({ ...form, construction_period: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <input
          placeholder="Estilos Arquitetónicos"
          value={form.architectural_styles}
          onChange={(e) => setForm({ ...form, architectural_styles: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
      </div>
      <input
        placeholder="Dimensões & Especificações"
        value={form.dimensions_specs}
        onChange={(e) => setForm({ ...form, dimensions_specs: e.target.value })}
        className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <textarea
          rows={3}
          placeholder="Curiosidades"
          value={form.curiosities}
          onChange={(e) => setForm({ ...form, curiosities: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
        <textarea
          rows={3}
          placeholder="Dicas de Visita"
          value={form.visitor_tips}
          onChange={(e) => setForm({ ...form, visitor_tips: e.target.value })}
          className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-[#9AA6B5] flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#6BA5D8]" />
          {form.latitude && form.longitude ? `GPS: ${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}` : 'Coordenadas preenchidas pela IA'}
        </span>
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gradient-to-r from-[#1E466E] to-[#2B5B84] hover:from-[#265685] hover:to-[#356FA0] text-white border border-[#6BA5D8]/40 px-5 py-2 rounded-lg text-sm font-semibold">
          <Save className="w-4 h-4" />
          {saving ? 'A guardar...' : 'Guardar Ficha Cultural'}
        </button>
      </div>
    </form>
  );
}
