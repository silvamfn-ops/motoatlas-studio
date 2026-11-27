import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase';

export default function VaultAndStaysStudio({ tripId, userId, onDataChanged }) {
  const supabase = getSupabaseClient();
  const [pois, setPois] = useState([]);
  const [docs, setDocs] = useState([]);
  const [stays, setStays] = useState([]);
  const [savingDoc, setSavingDoc] = useState(false);
  const [savingStay, setSavingStay] = useState(false);
  const [file, setFile] = useState(null);

  const [docForm, setDocForm] = useState({
    title: '',
    doc_type: 'ticket',
    poi_id: '',
    qr_code_payload: '',
    valid_date: '',
    notes: '',
  });

  const [stayForm, setStayForm] = useState({
    name: '',
    address: '',
    check_in_date: '',
    check_out_date: '',
    booking_reference: '',
    has_private_parking: true,
    parking_notes: '',
    total_cost: '',
  });

  useEffect(() => {
    loadData();
  }, [tripId]);

  async function loadData() {
    const [pRes, dRes, sRes] = await Promise.all([
      supabase.from('pois').select('id, name, city').eq('trip_id', tripId),
      supabase.from('vault_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
      supabase.from('accommodations').select('*').eq('trip_id', tripId).order('check_in_date', { ascending: true }),
    ]);
    setPois(pRes.data || []);
    setDocs(dRes.data || []);
    setStays(sRes.data || []);
  }

  async function handleSaveDocument(e) {
    e.preventDefault();
    if (!file && !docForm.qr_code_payload) {
      return alert('Anexa um ficheiro (PDF/Imagem) ou introduz o texto/código do QR Code.');
    }
    setSavingDoc(true);
    try {
      let storagePath = '';
      let mimeType = null;

      if (file) {
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        storagePath = `${userId}/${tripId}/${safeName}`;
        mimeType = file.type;
        const { error: upErr } = await supabase.storage.from('mototour-vault').upload(storagePath, file);
        if (upErr) throw upErr;
      }

      const { error: dbErr } = await supabase.from('vault_documents').insert([
        {
          trip_id: tripId,
          poi_id: docForm.poi_id || null,
          title: docForm.title,
          doc_type: docForm.doc_type,
          storage_path: storagePath,
          file_mime_type: mimeType,
          qr_code_payload: docForm.qr_code_payload || null,
          valid_date: docForm.valid_date || null,
          notes: docForm.notes || null,
        },
      ]);
      if (dbErr) throw dbErr;

      setDocForm({ title: '', doc_type: 'ticket', poi_id: '', qr_code_payload: '', valid_date: '', notes: '' });
      setFile(null);
      loadData();
      if (onDataChanged) onDataChanged();
      alert('Bilhete / Documento guardado no Cofre!');
    } catch (err) {
      alert('Erro ao guardar documento: ' + err.message);
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleDeleteDoc(doc) {
    if (!confirm(`Remover "${doc.title}"?`)) return;
    if (doc.storage_path) await supabase.storage.from('mototour-vault').remove([doc.storage_path]);
    await supabase.from('vault_documents').delete().eq('id', doc.id);
    loadData();
    if (onDataChanged) onDataChanged();
  }

  async function handleSaveStay(e) {
    e.preventDefault();
    setSavingStay(true);
    try {
      const { error } = await supabase.from('accommodations').insert([
        {
          trip_id: tripId,
          name: stayForm.name,
          address: stayForm.address || null,
          check_in_date: stayForm.check_in_date || null,
          check_out_date: stayForm.check_out_date || null,
          booking_reference: stayForm.booking_reference || null,
          has_private_parking: stayForm.has_private_parking,
          parking_notes: stayForm.parking_notes || null,
          total_cost: stayForm.total_cost ? Number(stayForm.total_cost) : null,
        },
      ]);
      if (error) throw error;
      setStayForm({ name: '', address: '', check_in_date: '', check_out_date: '', booking_reference: '', has_private_parking: true, parking_notes: '', total_cost: '' });
      loadData();
      alert('Alojamento registado!');
    } catch (err) {
      alert('Erro ao guardar hotel: ' + err.message);
    } finally {
      setSavingStay(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-[#131F2E] p-6 rounded-xl border border-[#24374E] space-y-5">
        <div className="border-b border-[#24374E] pb-3">
          <h2 className="text-lg font-semibold text-[#E2E8F0]">🎟️ Cofre de Bilhetes & Documentos</h2>
          <p className="text-xs text-[#9AA6B5]">Sincroniza offline com o MotoAtlas Tour (Android)</p>
        </div>
        <form onSubmit={handleSaveDocument} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              placeholder="Título (ex: Alhambra 10h30)"
              value={docForm.title}
              onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
              className="col-span-2 bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
            />
            <select
              value={docForm.doc_type}
              onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
              className="bg-[#091019] border border-[#24374E] rounded-lg px-2 py-2 text-xs text-[#E2E8F0]"
            >
              <option value="ticket">🎟️ Bilhete</option>
              <option value="hotel_voucher">🏨 Voucher Hotel</option>
              <option value="insurance">🛡️ Seguro / Carta Verde</option>
              <option value="vehicle_doc">🏍️ Doc. Mota</option>
              <option value="personal_id">🪪 Identificação</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={docForm.poi_id}
              onChange={(e) => setDocForm({ ...docForm, poi_id: e.target.value })}
              className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs text-[#E2E8F0]"
            >
              <option value="">Associar a Monumento (Opcional)</option>
              {pois.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={docForm.valid_date}
              onChange={(e) => setDocForm({ ...docForm, valid_date: e.target.value })}
              className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs text-[#E2E8F0]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#9AA6B5] mb-1">Código / Texto para QR Offline (Opcional)</label>
            <input
              placeholder="Cola o código do bilhete para gerar QR no telemóvel"
              value={docForm.qr_code_payload}
              onChange={(e) => setDocForm({ ...docForm, qr_code_payload: e.target.value })}
              className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs font-mono text-[#6BA5D8]"
            />
          </div>
          <div className="flex items-center justify-between gap-3 bg-[#091019] p-3 rounded-lg border border-[#24374E]">
            <span className="text-xs text-[#9AA6B5] truncate">{file ? file.name : 'Anexar PDF ou Imagem (Opcional)'}</span>
            <label className="cursor-pointer bg-[#1C2D42] hover:bg-[#253B56] px-3 py-1.5 rounded-lg text-xs font-medium text-[#E2E8F0] shrink-0">
              Escolher Ficheiro
              <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
          </div>
          <button type="submit" disabled={savingDoc} className="w-full bg-[#C5CCD4] hover:bg-white text-[#0B131E] font-semibold py-2.5 rounded-lg text-sm transition">
            {savingDoc ? 'A enviar para o cofre...' : 'Guardar no Cofre'}
          </button>
        </form>
        <div className="space-y-2 pt-3 border-t border-[#24374E] max-h-60 overflow-y-auto">
          {docs.map((d) => (
            <div key={d.id} className="bg-[#091019] p-3 rounded-lg border border-[#24374E] flex justify-between items-center text-xs">
              <div>
                <div className="font-semibold text-[#E2E8F0]">{d.title}</div>
                <div className="text-[#9AA6B5] text-[11px]">
                  {d.qr_code_payload ? 'QR Code ativo' : ''} {d.storage_path ? '• PDF/Imagem anexado' : ''}
                </div>
              </div>
              <button onClick={() => handleDeleteDoc(d)} className="text-[#9AA6B5] hover:text-red-400 px-2">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#131F2E] p-6 rounded-xl border border-[#24374E] space-y-5">
        <div className="border-b border-[#24374E] pb-3">
          <h2 className="text-lg font-semibold text-[#E2E8F0]">🏨 Alojamentos & Pernoitas</h2>
          <p className="text-xs text-[#9AA6B5]">Reservas e estacionamento sincronizados com o Tour</p>
        </div>
        <form onSubmit={handleSaveStay} className="space-y-3">
          <input
            required
            placeholder="Nome do Hotel / Alojamento *"
            value={stayForm.name}
            onChange={(e) => setStayForm({ ...stayForm, name: e.target.value })}
            className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
          />
          <input
            placeholder="Morada completa"
            value={stayForm.address}
            onChange={(e) => setStayForm({ ...stayForm, address: e.target.value })}
            className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#9AA6B5] mb-1">Check-in</label>
              <input
                type="date"
                value={stayForm.check_in_date}
                onChange={(e) => setStayForm({ ...stayForm, check_in_date: e.target.value })}
                className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs text-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9AA6B5] mb-1">Check-out</label>
              <input
                type="date"
                value={stayForm.check_out_date}
                onChange={(e) => setStayForm({ ...stayForm, check_out_date: e.target.value })}
                className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs text-[#E2E8F0]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Ref. Reserva (ex: Booking #1234)"
              value={stayForm.booking_reference}
              onChange={(e) => setStayForm({ ...stayForm, booking_reference: e.target.value })}
              className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0]"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Custo Total (€)"
              value={stayForm.total_cost}
              onChange={(e) => setStayForm({ ...stayForm, total_cost: e.target.value })}
              className="bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#C5CCD4] cursor-pointer">
            <input
              type="checkbox"
              checked={stayForm.has_private_parking}
              onChange={(e) => setStayForm({ ...stayForm, has_private_parking: e.target.checked })}
            />
            Tem garagem / estacionamento privativo para mota
          </label>
          <input
            placeholder="Notas de estacionamento"
            value={stayForm.parking_notes}
            onChange={(e) => setStayForm({ ...stayForm, parking_notes: e.target.value })}
            className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-3 py-2 text-xs text-[#E2E8F0]"
          />
          <button type="submit" disabled={savingStay} className="w-full bg-gradient-to-r from-[#1E466E] to-[#2B5B84] hover:from-[#265685] hover:to-[#356FA0] text-white border border-[#6BA5D8]/40 font-semibold py-2.5 rounded-lg text-sm transition">
            {savingStay ? 'A guardar...' : 'Guardar Alojamento'}
          </button>
        </form>
        <div className="space-y-2 pt-3 border-t border-[#24374E] max-h-60 overflow-y-auto">
          {stays.map((s) => (
            <div key={s.id} className="bg-[#091019] p-3 rounded-lg border border-[#24374E] text-xs flex justify-between items-center">
              <div>
                <div className="font-semibold text-[#E2E8F0]">{s.name}</div>
                <div className="text-[#9AA6B5] text-[11px]">
                  {s.check_in_date} → {s.check_out_date} {s.booking_reference ? `• Ref: ${s.booking_reference}` : ''}
                </div>
              </div>
              {s.has_private_parking && <span className="text-[#6BA5D8] font-bold">🅿️ Mota</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
