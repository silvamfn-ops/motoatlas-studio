import React, { useState, useEffect } from 'react';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  applyMagicLinkIfPresent,
  buildMagicSetupUrl,
} from './lib/supabase';
import {
  Maximize2,
  Minimize2,
  Share2,
  Check,
  Map,
  Landmark,
  Ticket,
  Route,
  Gauge,
  LogOut,
  Plus,
  Download,
} from 'lucide-react';
import StageBuilder from './components/StageBuilder';
import CulturalStudio from './components/CulturalStudio';
import VaultAndStaysStudio from './components/VaultAndStaysStudio';

applyMagicLinkIfPresent();

export default function App() {
  const [config, setConfig] = useState(() => getSupabaseConfig());
  const [urlInput, setUrlInput] = useState(() => getSupabaseConfig().url);
  const [keyInput, setKeyInput] = useState(() => getSupabaseConfig().key);

  const supabase = getSupabaseClient();

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(Boolean(supabase));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => localStorage.getItem('ma_selected_trip') || '');
  const [tripStats, setTripStats] = useState({ stagesCount: 0, totalKm: 0, poisCount: 0, docsCount: 0 });
  const [activeTab, setActiveTab] = useState('stages');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [copiedLink, setCopiedLink] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function handleInstallPwa() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function handleCopyMagicLink() {
    const link = buildMagicSetupUrl();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  }

  useEffect(() => {
    if (!supabase) {
      setLoadingAuth(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setLoadingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, [config.url, config.key]);

  useEffect(() => {
    if (session && supabase) {
      loadTrips();
    }
  }, [session, config.url, config.key]);

  useEffect(() => {
    if (selectedTripId) {
      localStorage.setItem('ma_selected_trip', selectedTripId);
      if (session && supabase) loadTripStats(selectedTripId);
    }
  }, [selectedTripId, session]);

  async function loadTrips() {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar viagens:', error);
      return;
    }
    if (data) {
      setTrips(data);
      if (data.length > 0 && (!selectedTripId || !data.some((t) => t.id === selectedTripId))) {
        setSelectedTripId(data[0].id);
      }
    }
  }

  async function loadTripStats(tripId) {
    const [stRes, poiRes, docRes] = await Promise.all([
      supabase.from('stages').select('estimated_distance_km').eq('trip_id', tripId),
      supabase.from('pois').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('vault_documents').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    ]);
    const stages = stRes.data || [];
    const totalKm = stages.reduce((acc, s) => acc + (Number(s.estimated_distance_km) || 0), 0);
    setTripStats({
      stagesCount: stages.length,
      totalKm: Math.round(totalKm * 10) / 10,
      poisCount: poiRes.count || 0,
      docsCount: docRes.count || 0,
    });
  }

  function handleSaveApiConfig(e) {
    e.preventDefault();
    if (!urlInput.trim().startsWith('http')) {
      return alert('O URL do Supabase tem de começar por https://');
    }
    saveSupabaseConfig(urlInput, keyInput);
    setConfig(getSupabaseConfig());
  }

  function handleResetApiConfig() {
    clearSupabaseConfig();
    setUrlInput('');
    setKeyInput('');
    setConfig(getSupabaseConfig());
    setSession(null);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Erro de login: ' + error.message);
  }

  async function handleCreateTrip() {
    const title = prompt('Nome da nova viagem (ex: Caminhos do Sul 2026):');
    if (!title || !title.trim()) return;
    const { data, error } = await supabase
      .from('trips')
      .insert([
        {
          user_id: session.user.id,
          title: title.trim(),
          trip_type: 'motorcycle',
          status: 'planning',
        },
      ])
      .select()
      .single();

    if (error) {
      alert('Erro ao criar viagem: ' + error.message);
    } else if (data) {
      setTrips([data, ...trips]);
      setSelectedTripId(data.id);
    }
  }

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0B131E]">
        <form onSubmit={handleSaveApiConfig} className="bg-[#131F2E] border border-[#24374E] p-8 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-3 h-8 rounded-sm bg-gradient-to-b from-[#2B5B84] via-[#C5CCD4] to-[#1A3654]"></div>
            <div>
              <h1 className="text-xl font-bold tracking-wide text-[#E2E8F0]">
                MOTOATLAS <span className="text-[#6BA5D8]">STUDIO</span>
              </h1>
              <p className="text-[11px] text-[#9AA6B5]">Ligação ao projeto Supabase</p>
            </div>
          </div>
          <p className="text-xs text-[#9AA6B5] leading-relaxed">
            Introduz o endereço e a chave uma única vez neste navegador (ou abre o Link Rápido gerado no teu outro PC).
          </p>
          <div>
            <label className="block text-xs text-[#C5CCD4] mb-1">Supabase Project URL</label>
            <input
              type="url"
              required
              placeholder="https://xxxxxx.supabase.co"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-4 py-2.5 text-sm font-mono text-[#E2E8F0] focus:border-[#5B9BD5] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#C5CCD4] mb-1">Supabase Anon Public Key</label>
            <input
              type="text"
              required
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-4 py-2.5 text-sm font-mono text-[#E2E8F0] focus:border-[#5B9BD5] outline-none"
            />
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-[#1E466E] to-[#2B5B84] hover:from-[#265685] hover:to-[#356FA0] text-white border border-[#6BA5D8]/40 font-semibold py-2.5 rounded-lg text-sm transition shadow-md">
            Guardar e Ligar ao Supabase
          </button>
        </form>
      </div>
    );
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#9AA6B5] text-sm">
        A verificar sessão...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0B131E]">
        <form onSubmit={handleLogin} className="bg-[#131F2E] border border-[#24374E] p-8 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-7 rounded-sm bg-gradient-to-b from-[#2B5B84] via-[#C5CCD4] to-[#1A3654]"></div>
              <h1 className="text-xl font-bold tracking-wide text-[#E2E8F0]">
                MOTOATLAS <span className="text-[#6BA5D8]">STUDIO</span>
              </h1>
            </div>
            {!config.isFromEnv && (
              <button type="button" onClick={handleResetApiConfig} className="text-[11px] text-[#9AA6B5] hover:text-[#C5CCD4]">
                Alterar API
              </button>
            )}
          </div>
          <p className="text-xs text-[#9AA6B5]">Inicia sessão com a tua conta Supabase</p>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-4 py-2.5 text-sm text-[#E2E8F0] focus:border-[#5B9BD5] outline-none"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#091019] border border-[#24374E] rounded-lg px-4 py-2.5 text-sm text-[#E2E8F0] focus:border-[#5B9BD5] outline-none"
          />
          <button type="submit" className="w-full bg-gradient-to-r from-[#1E466E] to-[#2B5B84] hover:from-[#265685] hover:to-[#356FA0] text-white border border-[#6BA5D8]/40 font-semibold py-2.5 rounded-lg text-sm transition shadow-md">
            Entrar no Studio
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B131E] flex flex-col">
      {/* Barra Superior estilo DuoFin2 nas cores da mota */}
      <header className="sticky top-0 z-30 bg-[#131F2E]/95 backdrop-blur border-b border-[#24374E] shadow-lg">
        <div className={`${isFullscreen ? 'max-w-full px-8' : 'max-w-7xl px-6'} mx-auto py-3.5 flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 pr-2">
              <div className="w-2.5 h-7 rounded-sm bg-gradient-to-b from-[#2B5B84] via-[#C5CCD4] to-[#1A3654]"></div>
              <div>
                <h1 className="text-lg font-bold tracking-wide text-[#E2E8F0] leading-none">
                  MOTOATLAS <span className="text-[#6BA5D8]">STUDIO</span>
                </h1>
                <span className="text-[10px] text-[#9AA6B5] uppercase tracking-widest">Cloud Workspace</span>
              </div>
            </div>

            <div className="h-6 w-px bg-[#24374E] hidden sm:block"></div>

            <select
              value={selectedTripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              className="bg-[#091019] border border-[#2D435E] text-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm font-medium focus:border-[#5B9BD5] outline-none"
            >
              {trips.length === 0 && <option value="">Sem viagens criadas</option>}
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>

            <button
              onClick={handleCreateTrip}
              className="flex items-center gap-1 bg-[#1C2D42] hover:bg-[#253B56] border border-[#355070] text-[#E2E8F0] px-3 py-1.5 rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5 text-[#6BA5D8]" /> Nova Viagem
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="flex items-center gap-1.5 bg-[#C5CCD4] hover:bg-white text-[#0B131E] px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                title="Criar ícone desta aplicação no Ambiente de Trabalho"
              >
                <Download className="w-3.5 h-3.5" /> Instalar App
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyMagicLink}
              className="flex items-center gap-1.5 bg-[#091019] hover:bg-[#1C2D42] border border-[#24374E] text-[#C5CCD4] px-3 py-1.5 rounded-lg text-xs font-medium transition"
              title="Copiar link com configuração Supabase para abrir noutro computador (casa/gabinete)"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-[#6BA5D8]" />}
              {copiedLink ? 'Link Copiado!' : 'Sincronizar PC'}
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 bg-[#091019] hover:bg-[#1C2D42] border border-[#24374E] text-[#C5CCD4] px-3 py-1.5 rounded-lg text-xs font-medium transition"
              title="Alternar Ecrã Inteiro (F11)"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-[#6BA5D8]" /> : <Maximize2 className="w-3.5 h-3.5 text-[#6BA5D8]" />}
              {isFullscreen ? 'Janela' : 'Ecrã Inteiro'}
            </button>

            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1 text-xs text-[#9AA6B5] hover:text-red-400 px-2 py-1.5 transition"
              title="Terminar sessão"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className={`${isFullscreen ? 'max-w-full px-8' : 'max-w-7xl px-6'} w-full mx-auto py-6 space-y-6 flex-1`}>
        {selectedTripId && (
          <>
            {/* Cartoes KPI de Resumo da Viagem (identico ao estilo dashboard DuoFin2) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#131F2E] border border-[#24374E] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#9AA6B5] font-medium">Etapas Planeadas</span>
                  <div className="text-2xl font-bold text-[#E2E8F0] mt-0.5 font-mono">{tripStats.stagesCount}</div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1C2D42] border border-[#2B5B84]/40 flex items-center justify-center text-[#6BA5D8]">
                  <Route className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[#131F2E] border border-[#24374E] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#9AA6B5] font-medium">Distância Total</span>
                  <div className="text-2xl font-bold text-[#C5CCD4] mt-0.5 font-mono">{tripStats.totalKm} <span className="text-xs font-normal text-[#9AA6B5]">km</span></div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1C2D42] border border-[#2B5B84]/40 flex items-center justify-center text-[#C5CCD4]">
                  <Gauge className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[#131F2E] border border-[#24374E] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#9AA6B5] font-medium">Fichas Culturais</span>
                  <div className="text-2xl font-bold text-[#E2E8F0] mt-0.5 font-mono">{tripStats.poisCount}</div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1C2D42] border border-[#2B5B84]/40 flex items-center justify-center text-[#6BA5D8]">
                  <Landmark className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[#131F2E] border border-[#24374E] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#9AA6B5] font-medium">Cofre & Bilhetes</span>
                  <div className="text-2xl font-bold text-[#E2E8F0] mt-0.5 font-mono">{tripStats.docsCount}</div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1C2D42] border border-[#2B5B84]/40 flex items-center justify-center text-[#C5CCD4]">
                  <Ticket className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Navegacao por Separadores */}
            <div className="flex flex-wrap gap-2 bg-[#131F2E] p-1.5 rounded-xl border border-[#24374E] w-fit">
              <button
                onClick={() => setActiveTab('stages')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'stages'
                    ? 'bg-gradient-to-r from-[#1E466E] to-[#2B5B84] text-white border border-[#6BA5D8]/40 shadow'
                    : 'text-[#9AA6B5] hover:text-[#E2E8F0]'
                }`}
              >
                <Map className="w-4 h-4" /> 1. Etapas (GPX / KMZ)
              </button>
              <button
                onClick={() => setActiveTab('cultural')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'cultural'
                    ? 'bg-gradient-to-r from-[#1E466E] to-[#2B5B84] text-white border border-[#6BA5D8]/40 shadow'
                    : 'text-[#9AA6B5] hover:text-[#E2E8F0]'
                }`}
              >
                <Landmark className="w-4 h-4" /> 2. Fichas Culturais (IA)
              </button>
              <button
                onClick={() => setActiveTab('vault')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'vault'
                    ? 'bg-gradient-to-r from-[#1E466E] to-[#2B5B84] text-white border border-[#6BA5D8]/40 shadow'
                    : 'text-[#9AA6B5] hover:text-[#E2E8F0]'
                }`}
              >
                <Ticket className="w-4 h-4" /> 3. Bilhetes & Hotéis
              </button>
            </div>
          </>
        )}

        {!selectedTripId ? (
          <div className="bg-[#131F2E] p-10 rounded-xl border border-[#24374E] text-center space-y-3">
            <p className="text-[#C5CCD4]">Ainda não tens nenhuma viagem criada.</p>
            <button onClick={handleCreateTrip} className="bg-gradient-to-r from-[#1E466E] to-[#2B5B84] hover:from-[#265685] hover:to-[#356FA0] text-white font-semibold px-5 py-2.5 rounded-lg text-sm">
              Criar Primeira Viagem
            </button>
          </div>
        ) : activeTab === 'stages' ? (
          <StageBuilder tripId={selectedTripId} onDataChanged={() => loadTripStats(selectedTripId)} />
        ) : activeTab === 'cultural' ? (
          <CulturalStudio tripId={selectedTripId} onDataChanged={() => loadTripStats(selectedTripId)} />
        ) : (
          <VaultAndStaysStudio tripId={selectedTripId} userId={session.user.id} onDataChanged={() => loadTripStats(selectedTripId)} />
        )}
      </main>
    </div>
  );
}
