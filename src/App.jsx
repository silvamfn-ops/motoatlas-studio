import React, { useState, useEffect } from 'react';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  applyMagicLinkIfPresent,
  buildMagicSetupUrl,
} from './lib/supabase';
import StageBuilder from './components/StageBuilder';
import CulturalStudio from './components/CulturalStudio';
import VaultAndStaysStudio from './components/VaultAndStaysStudio';

const APP_VERSION = '8.1.0';

applyMagicLinkIfPresent();

function MotoAtlasLogo({ size = 38 }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#12263D" stroke="#C5CCD4" strokeWidth="2" />
      <path
        d="M14 46V18h7l11 17 11-17h7v28h-6V29L32 46 20 29v17h-6z"
        fill="#C5CCD4"
      />
      <circle cx="50" cy="44" r="4.5" fill="#6BA5D8" />
    </svg>
  );
}

export default function App() {
  const [config, setConfig] = useState(() => getSupabaseConfig());
  const [urlInput, setUrlInput] = useState(() => getSupabaseConfig().url);
  const [keyInput, setKeyInput] = useState(() => getSupabaseConfig().key);

  const supabase = getSupabaseClient();

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(Boolean(supabase));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('ma_theme_mode') || 'dark');
  const [summaryLevel, setSummaryLevel] = useState(() => localStorage.getItem('ma_summary_level') || 'detailed');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => localStorage.getItem('ma_selected_trip') || '');
  const [tripStats, setTripStats] = useState({
    stagesCount: 0,
    totalKm: 0,
    totalMinutes: 0,
    poisCount: 0,
    docsCount: 0,
    staysCount: 0,
  });

  const [activeTab, setActiveTab] = useState('resumo');
  const [copiedLink, setCopiedLink] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  function showToast(text) {
    setToastMsg(text);
    setTimeout(() => setToastMsg(''), 3200);
  }

  useEffect(() => {
    localStorage.setItem('ma_theme_mode', themeMode);
    const root = document.documentElement;
    const metaTheme = document.getElementById('metaThemeColor');

    function applyResolvedTheme() {
      let resolved = themeMode;
      if (themeMode === 'auto') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      root.setAttribute('data-theme', resolved);
      if (metaTheme) {
        metaTheme.setAttribute('content', resolved === 'dark' ? '#12263d' : '#ffffff');
      }
    }

    applyResolvedTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyResolvedTheme);
    return () => mq.removeEventListener('change', applyResolvedTheme);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem('ma_summary_level', summaryLevel);
  }, [summaryLevel]);

  function cycleThemeQuickly() {
    const order = ['dark', 'light', 'auto'];
    const next = order[(order.indexOf(themeMode) + 1) % order.length];
    setThemeMode(next);
    const labels = { dark: 'Tema Escuro (Moto)', light: 'Tema Claro', auto: 'Tema Automático (Sistema)' };
    showToast(labels[next]);
  }

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
      showToast('Link rápido copiado! Abre-o no PC do gabinete ou telemóvel.');
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
    const [stRes, poiRes, docRes, stayRes] = await Promise.all([
      supabase.from('stages').select('estimated_distance_km, estimated_duration_minutes').eq('trip_id', tripId),
      supabase.from('pois').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('vault_documents').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('accommodations').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    ]);
    const stages = stRes.data || [];
    const totalKm = stages.reduce((acc, s) => acc + (Number(s.estimated_distance_km) || 0), 0);
    const totalMinutes = stages.reduce((acc, s) => acc + (Number(s.estimated_duration_minutes) || 0), 0);
    setTripStats({
      stagesCount: stages.length,
      totalKm: Math.round(totalKm * 10) / 10,
      totalMinutes,
      poisCount: poiRes.count || 0,
      docsCount: docRes.count || 0,
      staysCount: stayRes.count || 0,
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
    const title = prompt('Nome da nova viagem (ex: Rota da Andaluzia 2026):');
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
      showToast(`Viagem "${data.title}" criada!`);
    }
  }

  function stepTrip(delta) {
    if (trips.length <= 1) return;
    const idx = trips.findIndex((t) => t.id === selectedTripId);
    if (idx === -1) return;
    const nextIdx = (idx + delta + trips.length) % trips.length;
    setSelectedTripId(trips[nextIdx].id);
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || null;
  const totalHours = Math.floor(tripStats.totalMinutes / 60);
  const remMins = tripStats.totalMinutes % 60;

  // Ecra 1: Configuracao inicial API Supabase
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5">
        <form onSubmit={handleSaveApiConfig} className="df-card p-7 w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MotoAtlasLogo size={42} />
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">
                  MotoAtlas<span style={{ color: 'var(--accent-bright)' }}>Studio</span>
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  O teu roteiro, sob controlo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={cycleThemeQuickly}
              className="df-input px-2.5 py-1.5 text-sm"
              title="Alternar tema Claro / Escuro"
            >
              {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🌓'}
            </button>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Introduz o endereço e a chave pública do teu projeto Supabase uma única vez neste navegador (ou abre o Link Rápido gerado no outro computador).
          </p>
          <div>
            <label className="block text-xs font-semibold mb-1">Supabase Project URL</label>
            <input
              type="url"
              required
              placeholder="https://xxxxxx.supabase.co"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="df-input w-full px-3.5 py-2.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Supabase Anon Public Key</label>
            <input
              type="text"
              required
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="df-input w-full px-3.5 py-2.5 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white shadow transition"
            style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
          >
            Guardar e Ligar ao Supabase
          </button>
          <p className="text-center text-[11px] font-mono opacity-55 m-0" style={{ color: 'var(--muted)' }}>
            MotoAtlas Studio · v{APP_VERSION}
          </p>
        </form>
      </div>
    );
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <MotoAtlasLogo size={54} />
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          A carregar o teu workspace...
        </p>
      </div>
    );
  }

  // Ecra 2: Login Supabase
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5">
        <form onSubmit={handleLogin} className="df-card p-7 w-full max-w-md space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <MotoAtlasLogo size={40} />
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">
                  MotoAtlas<span style={{ color: 'var(--accent-bright)' }}>Studio</span>
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Inicia sessão para sincronizar
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleThemeQuickly}
                className="df-input px-2.5 py-1.5 text-sm"
                title="Alternar tema"
              >
                {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🌓'}
              </button>
              {!config.isFromEnv && (
                <button
                  type="button"
                  onClick={handleResetApiConfig}
                  className="text-xs underline"
                  style={{ color: 'var(--muted)' }}
                >
                  API
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email</label>
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="df-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Palavra-passe</label>
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="df-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white shadow transition"
            style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
          >
            Entrar no Studio
          </button>
          <p className="text-center text-[11px] font-mono opacity-55 m-0" style={{ color: 'var(--muted)' }}>
            MotoAtlas Studio · v{APP_VERSION}
          </p>
        </form>
      </div>
    );
  }

  const navItems = [
    { id: 'resumo', icon: '🗺️', label: 'Etapas & Mapa' },
    { id: 'cultural', icon: '🏛️', label: 'Fichas IA' },
    { id: 'vault', icon: '🎟️', label: 'Cofre & Hotéis' },
    { id: 'dados', icon: '⚙️', label: 'Dados & Sync' },
  ];

  return (
    <div className="min-h-screen flex flex-col mobile-bottom-safe">
      <header
        className="sticky top-0 z-30 backdrop-blur border-b"
        style={{ background: 'var(--header-bg)', borderColor: 'var(--line)' }}
      >
        <div className={`${isFullscreen ? 'max-w-full px-6' : 'max-w-7xl px-4 sm:px-6'} mx-auto py-2.5 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <MotoAtlasLogo size={36} />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight leading-none truncate">
                MotoAtlas<span style={{ color: 'var(--accent-bright)' }}>Studio</span>
              </h1>
              <p className="text-[11px] truncate mt-0.5 hidden sm:block" style={{ color: 'var(--muted)' }}>
                O teu roteiro, sob controlo.
              </p>
            </div>
          </div>

          <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-1.5 p-1 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active ? 'text-white shadow-sm' : ''
                  }`}
                  style={
                    active
                      ? { background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }
                      : { color: 'var(--muted)' }
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={cycleThemeQuickly}
              className="df-input w-9 h-9 flex items-center justify-center text-sm hover:opacity-80"
              title="Alternar tema (Escuro / Claro / Automático)"
              aria-label="Alternar tema"
            >
              {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🌓'}
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="df-input w-9 h-9 hidden sm:flex items-center justify-center text-sm hover:opacity-80"
              title="Alternar Ecrã Inteiro"
              aria-label="Alternar ecrã inteiro"
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>

            <button
              type="button"
              onClick={handleCopyMagicLink}
              className="df-input px-2.5 h-9 flex items-center gap-1.5 text-xs font-semibold hover:opacity-80"
              title="Copiar link rápido para sincronizar outro PC ou telemóvel"
            >
              <span>{copiedLink ? '✅' : '🔗'}</span>
              <span className="hidden sm:inline">{copiedLink ? 'Copiado' : 'Sync PC'}</span>
            </button>

            <span
              className="df-pill hidden lg:inline-flex"
              style={{ color: 'var(--good)', borderColor: 'rgba(16, 185, 129, 0.35)' }}
              title={`Ligado como ${session.user.email} · v${APP_VERSION}`}
            >
              ● Cloud
            </span>
          </div>
        </div>
      </header>

      <nav
        aria-label="Navegação mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t flex justify-around items-center py-1.5 px-1 backdrop-blur"
        style={{
          background: 'var(--header-bg)',
          borderColor: 'var(--line)',
          paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        }}
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center py-1 px-2 rounded-lg flex-1 transition"
              style={{ color: active ? 'var(--accent-bright)' : 'var(--muted)' }}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10.5px] font-semibold mt-1">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main className={`${isFullscreen ? 'max-w-full px-6' : 'max-w-7xl px-4 sm:px-6'} w-full mx-auto py-4 sm:py-6 space-y-4 sm:space-y-5 flex-1`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <b className="text-base sm:text-lg truncate">
                {selectedTrip ? selectedTrip.title : 'Nenhuma viagem selecionada'}
              </b>
              {selectedTrip && (
                <span className="df-pill hidden sm:inline-flex">🏍️ Planeamento</span>
              )}
            </div>
            {summaryLevel === 'detailed' && selectedTrip && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {tripStats.stagesCount} etapas • {tripStats.totalKm} km acumulados ({totalHours}h {remMins}m estimados)
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div
              className="inline-flex p-0.5 rounded-xl border text-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
              role="group"
              aria-label="Nível de detalhe"
            >
              <button
                type="button"
                onClick={() => setSummaryLevel('basic')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  summaryLevel === 'basic' ? 'text-white' : ''
                }`}
                style={
                  summaryLevel === 'basic'
                    ? { background: 'var(--accent)' }
                    : { color: 'var(--muted)' }
                }
              >
                Básico
              </button>
              <button
                type="button"
                onClick={() => setSummaryLevel('detailed')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  summaryLevel === 'detailed' ? 'text-white' : ''
                }`}
                style={
                  summaryLevel === 'detailed'
                    ? { background: 'var(--accent)' }
                    : { color: 'var(--muted)' }
                }
              >
                Detalhado
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => stepTrip(1)}
                className="df-input w-8 h-8 flex items-center justify-center font-bold"
                title="Viagem anterior"
              >
                ‹
              </button>
              <select
                value={selectedTripId}
                onChange={(e) => setSelectedTripId(e.target.value)}
                aria-label="Selecionar viagem"
                className="df-input px-3 h-8 text-xs sm:text-sm font-semibold max-w-[190px] sm:max-w-[240px]"
              >
                {trips.length === 0 && <option value="">Sem viagens criadas</option>}
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => stepTrip(-1)}
                className="df-input w-8 h-8 flex items-center justify-center font-bold"
                title="Viagem seguinte"
              >
                ›
              </button>
              <button
                type="button"
                onClick={handleCreateTrip}
                className="px-3 h-8 rounded-xl text-xs font-semibold text-white shadow-sm transition"
                style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
              >
                + Nova
              </button>
            </div>
          </div>
        </div>

        {selectedTripId && (
          <div className={`grid ${summaryLevel === 'basic' ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-3 sm:gap-4`}>
            <div className="df-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Distância total
                </span>
                <span className="text-sm">🏍️</span>
              </div>
              <b className="block text-xl sm:text-2xl font-extrabold font-mono mt-1" style={{ color: 'var(--accent-bright)' }}>
                {tripStats.totalKm} km
              </b>
              {summaryLevel === 'detailed' && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  Tempo estimado: {totalHours}h {remMins}m
                </div>
              )}
            </div>

            <div className="df-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Etapas planeadas
                </span>
                <span className="text-sm">🗺️</span>
              </div>
              <b className="block text-xl sm:text-2xl font-extrabold font-mono mt-1">
                {tripStats.stagesCount}
              </b>
              {summaryLevel === 'detailed' && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  Média {tripStats.stagesCount > 0 ? Math.round(tripStats.totalKm / tripStats.stagesCount) : 0} km / dia
                </div>
              )}
            </div>

            {summaryLevel === 'detailed' && (
              <>
                <div className="df-card p-3.5 sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                      Fichas culturais
                    </span>
                    <span className="text-sm">🏛️</span>
                  </div>
                  <b className="block text-xl sm:text-2xl font-extrabold font-mono mt-1" style={{ color: 'var(--good)' }}>
                    {tripStats.poisCount}
                  </b>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                    Monumentos e pontos de interesse
                  </div>
                </div>

                <div className="df-card p-3.5 sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                      Cofre &amp; Hotéis
                    </span>
                    <span className="text-sm">🎟️</span>
                  </div>
                  <b className="block text-xl sm:text-2xl font-extrabold font-mono mt-1">
                    {tripStats.docsCount + tripStats.staysCount}
                  </b>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                    {tripStats.docsCount} bilhetes • {tripStats.staysCount} dormidas
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'dados' ? (
          <div className="space-y-4">
            <div className="df-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold m-0">🎨 Aparência (Este dispositivo)</h2>
                <span className="df-pill">Local</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Tema da interface</label>
                  <select
                    value={themeMode}
                    onChange={(e) => setThemeMode(e.target.value)}
                    className="df-input w-full px-3 py-2.5 text-sm"
                  >
                    <option value="dark">Escuro (Cores Honda NC750X)</option>
                    <option value="light">Claro (Alta visibilidade diurna)</option>
                    <option value="auto">Automático (Seguir o Windows / Telemóvel)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Nível de detalhe por defeito</label>
                  <select
                    value={summaryLevel}
                    onChange={(e) => setSummaryLevel(e.target.value)}
                    className="df-input w-full px-3 py-2.5 text-sm"
                  >
                    <option value="detailed">Detalhado (Todos os indicadores e mapas)</option>
                    <option value="basic">Básico (Vista compacta e limpa)</option>
                  </select>
                </div>
              </div>
              <p className="text-xs m-0" style={{ color: 'var(--muted)' }}>
                Estas preferências ficam guardadas apenas neste dispositivo e aplicam-se de imediato.
              </p>
            </div>

            <div className="df-card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold m-0">☁️ Sincronização &amp; Mobilidade entre PCs</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    Sessão ativa: <b>{session.user.email}</b> · <span className="font-mono">v{APP_VERSION}</span>
                  </p>
                </div>
                <span className="df-pill" style={{ color: 'var(--good)' }}>● Sincronizado</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyMagicLink}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white transition"
                  style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
                >
                  🔗 Copiar Link Rápido para outro PC
                </button>
                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallPwa}
                    className="df-input px-4 py-2 text-xs sm:text-sm font-semibold"
                  >
                    📲 Instalar Aplicação no Ambiente de Trabalho
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border"
                  style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                >
                  Terminar sessão
                </button>
              </div>
            </div>
          </div>
        ) : !selectedTripId ? (
          <div className="df-card p-10 text-center space-y-3">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Ainda não tens nenhuma viagem criada.
            </p>
            <button
              onClick={handleCreateTrip}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
            >
              + Criar Primeira Viagem
            </button>
          </div>
        ) : activeTab === 'resumo' ? (
          <StageBuilder
            tripId={selectedTripId}
            summaryLevel={summaryLevel}
            onDataChanged={() => loadTripStats(selectedTripId)}
          />
        ) : activeTab === 'cultural' ? (
          <CulturalStudio
            tripId={selectedTripId}
            onDataChanged={() => loadTripStats(selectedTripId)}
          />
        ) : (
          <VaultAndStaysStudio
            tripId={selectedTripId}
            userId={session.user.id}
            onDataChanged={() => loadTripStats(selectedTripId)}
          />
        )}
      </main>

      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--accent-bright)',
            color: 'var(--text)',
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
