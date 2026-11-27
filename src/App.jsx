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

const APP_VERSION = '8.2.0';

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

  // Preferencias locais do PC
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('ma_theme_mode') || 'dark');
  const [navOrientation, setNavOrientation] = useState(() => localStorage.getItem('ma_nav_orientation') || 'horizontal');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => localStorage.getItem('ma_selected_trip') || '');
  const [deletingTrip, setDeletingTrip] = useState(false);
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
    setTimeout(() => setToastMsg(''), 3400);
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
    localStorage.setItem('ma_nav_orientation', navOrientation);
  }, [navOrientation]);

  function cycleThemeQuickly() {
    const order = ['dark', 'light', 'auto'];
    const next = order[(order.indexOf(themeMode) + 1) % order.length];
    setThemeMode(next);
    const labels = { dark: 'Tema Escuro (Moto)', light: 'Tema Claro', auto: 'Tema Automático (Sistema)' };
    showToast(labels[next]);
  }

  function toggleNavOrientation() {
    const next = navOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    setNavOrientation(next);
    showToast(next === 'vertical' ? 'Barra de separadores na vertical (lateral)' : 'Barra de separadores na horizontal (topo)');
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
      showToast('Link rápido copiado! Abre-o no outro PC para ligar automaticamente.');
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
    } else {
      localStorage.removeItem('ma_selected_trip');
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
      } else if (data.length === 0) {
        setSelectedTripId('');
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

  async function handleDeleteCurrentTrip() {
    const current = trips.find((t) => t.id === selectedTripId);
    if (!current) return;

    const firstConfirm = confirm(
      `Tens a certeza que queres APAGAR permanentemente a viagem "${current.title}" e todas as suas etapas, fichas culturais, bilhetes e alojamentos?`
    );
    if (!firstConfirm) return;

    setDeletingTrip(true);
    try {
      // Remove ficheiros fisicos do bucket Storage se existirem
      const { data: docs } = await supabase
        .from('vault_documents')
        .select('storage_path')
        .eq('trip_id', current.id);

      const pathsToRemove = (docs || []).map((d) => d.storage_path).filter(Boolean);
      if (pathsToRemove.length > 0) {
        await supabase.storage.from('mototour-vault').remove(pathsToRemove);
      }

      // Apaga registos dependentes caso alguma FK nao tenha ON DELETE CASCADE
      const { data: stageRows } = await supabase.from('stages').select('id').eq('trip_id', current.id);
      const stageIds = (stageRows || []).map((s) => s.id);
      if (stageIds.length > 0) {
        await supabase.from('route_waypoints').delete().in('stage_id', stageIds);
      }
      await Promise.all([
        supabase.from('stages').delete().eq('trip_id', current.id),
        supabase.from('pois').delete().eq('trip_id', current.id),
        supabase.from('vault_documents').delete().eq('trip_id', current.id),
        supabase.from('accommodations').delete().eq('trip_id', current.id),
      ]);

      const { error } = await supabase.from('trips').delete().eq('id', current.id);
      if (error) throw error;

      const remaining = trips.filter((t) => t.id !== current.id);
      setTrips(remaining);
      setSelectedTripId(remaining.length > 0 ? remaining[0].id : '');
      showToast(`Viagem "${current.title}" apagada com sucesso.`);
    } catch (err) {
      alert('Erro ao apagar viagem: ' + (err.message || err));
    } finally {
      setDeletingTrip(false);
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
    { id: 'resumo', icon: '🗺️', label: 'Etapas & Mapa', hint: 'Traçado GPX/KMZ e visão global' },
    { id: 'cultural', icon: '🏛️', label: 'Fichas IA', hint: 'Monumentos e pontos de interesse' },
    { id: 'vault', icon: '🎟️', label: 'Cofre & Hotéis', hint: 'Bilhetes, QR e alojamentos' },
    { id: 'dados', icon: '⚙️', label: 'Dados & Sync', hint: 'Tema, disposição e sincronização' },
  ];

  const isVerticalNav = navOrientation === 'vertical';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Cabecalho Superior */}
      <header
        className="sticky top-0 z-30 backdrop-blur border-b"
        style={{ background: 'var(--header-bg)', borderColor: 'var(--line)' }}
      >
        <div className={`${isFullscreen || isVerticalNav ? 'max-w-full px-6' : 'max-w-7xl px-6'} mx-auto py-2.5 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3 min-w-0">
            <MotoAtlasLogo size={38} />
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight leading-none truncate">
                MotoAtlas<span style={{ color: 'var(--accent-bright)' }}>Studio</span>
              </h1>
              <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                O teu roteiro, sob controlo.
              </p>
            </div>
          </div>

          {/* Barra de Separadores na Horizontal (quando selecionada) */}
          {!isVerticalNav && (
            <nav
              aria-label="Navegação principal"
              className="flex items-center gap-1.5 p-1 rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}
            >
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
          )}

          {/* Controlos Rapidos do Cabecalho */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleNavOrientation}
              className="df-input px-2.5 h-9 flex items-center gap-1.5 text-xs font-semibold hover:opacity-85"
              title="Alternar barra de separadores entre Horizontal (Topo) e Vertical (Lateral)"
              aria-label="Alternar orientação dos separadores"
            >
              <span>{isVerticalNav ? '◫' : '☰'}</span>
              <span className="hidden xl:inline">{isVerticalNav ? 'Menu Topo' : 'Menu Lateral'}</span>
            </button>

            <button
              type="button"
              onClick={cycleThemeQuickly}
              className="df-input w-9 h-9 flex items-center justify-center text-sm hover:opacity-85"
              title="Alternar tema (Escuro / Claro / Automático)"
              aria-label="Alternar tema"
            >
              {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🌓'}
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="df-input w-9 h-9 flex items-center justify-center text-sm hover:opacity-85"
              title="Alternar Ecrã Inteiro"
              aria-label="Alternar ecrã inteiro"
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>

            <button
              type="button"
              onClick={handleCopyMagicLink}
              className="df-input px-2.5 h-9 flex items-center gap-1.5 text-xs font-semibold hover:opacity-85"
              title="Copiar link rápido para sincronizar outro PC"
            >
              <span>{copiedLink ? '✅' : '🔗'}</span>
              <span>{copiedLink ? 'Copiado' : 'Sync PC'}</span>
            </button>

            <span
              className="df-pill"
              style={{ color: 'var(--good)', borderColor: 'rgba(16, 185, 129, 0.35)' }}
              title={`Ligado como ${session.user.email} · v${APP_VERSION}`}
            >
              ● Cloud
            </span>
          </div>
        </div>
      </header>

      {/* Corpo da Aplicacao (suporta Sidebar Vertical ou Layout Horizontal) */}
      <div className="flex flex-1 min-h-0">
        {isVerticalNav && (
          <aside
            aria-label="Navegação lateral"
            className="w-60 shrink-0 border-r p-4 flex flex-col justify-between gap-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
          >
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider px-2.5 pb-1" style={{ color: 'var(--muted)' }}>
                Ferramentas Studio
              </div>
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition ${
                      active ? 'text-white shadow-sm' : 'hover:opacity-90'
                    }`}
                    style={
                      active
                        ? { background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }
                        : { color: 'var(--text)' }
                    }
                  >
                    <span className="text-base leading-none mt-0.5">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{item.label}</div>
                      <div
                        className="text-[10.5px] leading-tight mt-0.5 truncate"
                        style={{ color: active ? 'rgba(255,255,255,0.82)' : 'var(--muted)' }}
                      >
                        {item.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--line)' }}>
              <button
                type="button"
                onClick={toggleNavOrientation}
                className="df-input w-full px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <span>⇄</span>
                <span>Mudar para barra horizontal</span>
              </button>
              <div className="text-center text-[11px] font-mono opacity-60" style={{ color: 'var(--muted)' }}>
                MotoAtlas Studio · v{APP_VERSION}
              </div>
            </div>
          </aside>
        )}

        <main className={`${isFullscreen || isVerticalNav ? 'max-w-full px-6' : 'max-w-7xl px-6'} w-full mx-auto py-5 space-y-5 flex-1 min-w-0`}>
          {/* Barra de Controlo da Viagem */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="text-lg truncate">
                  {selectedTrip ? selectedTrip.title : 'Nenhuma viagem selecionada'}
                </b>
                {selectedTrip && (
                  <span className="df-pill">🏍️ Planeamento</span>
                )}
              </div>
              {selectedTrip && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {tripStats.stagesCount} etapas • {tripStats.totalKm} km acumulados ({totalHours}h {remMins}m estimados)
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
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
                className="df-input px-3 h-8 text-sm font-semibold min-w-[210px] max-w-[280px]"
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
                + Nova viagem
              </button>
              {selectedTrip && (
                <button
                  type="button"
                  disabled={deletingTrip}
                  onClick={handleDeleteCurrentTrip}
                  title="Apagar viagem selecionada"
                  className="df-input px-2.5 h-8 flex items-center gap-1 text-xs font-semibold transition hover:opacity-85 disabled:opacity-50"
                  style={{ borderColor: 'rgba(239, 68, 68, 0.45)', color: 'var(--red)' }}
                >
                  <span>🗑️</span>
                  <span>{deletingTrip ? 'A apagar...' : 'Apagar'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Cartoes KPI de Resumo */}
          {selectedTripId && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="df-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Distância total
                  </span>
                  <span className="text-sm">🏍️</span>
                </div>
                <b className="block text-2xl font-extrabold font-mono mt-1" style={{ color: 'var(--accent-bright)' }}>
                  {tripStats.totalKm} km
                </b>
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  Tempo estimado: {totalHours}h {remMins}m
                </div>
              </div>

              <div className="df-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Etapas planeadas
                  </span>
                  <span className="text-sm">🗺️</span>
                </div>
                <b className="block text-2xl font-extrabold font-mono mt-1">
                  {tripStats.stagesCount}
                </b>
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  Média {tripStats.stagesCount > 0 ? Math.round(tripStats.totalKm / tripStats.stagesCount) : 0} km / dia
                </div>
              </div>

              <div className="df-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Fichas culturais
                  </span>
                  <span className="text-sm">🏛️</span>
                </div>
                <b className="block text-2xl font-extrabold font-mono mt-1" style={{ color: 'var(--good)' }}>
                  {tripStats.poisCount}
                </b>
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  Monumentos e pontos de interesse
                </div>
              </div>

              <div className="df-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Cofre &amp; Hotéis
                  </span>
                  <span className="text-sm">🎟️</span>
                </div>
                <b className="block text-2xl font-extrabold font-mono mt-1">
                  {tripStats.docsCount + tripStats.staysCount}
                </b>
                <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  {tripStats.docsCount} bilhetes • {tripStats.staysCount} dormidas
                </div>
              </div>
            </div>
          )}

          {/* Separadores de Conteudo */}
          {activeTab === 'dados' ? (
            <div className="space-y-4">
              <div className="df-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold m-0">🎨 Aparência &amp; Disposição (Este PC)</h2>
                  <span className="df-pill">Local</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Tema da interface</label>
                    <select
                      value={themeMode}
                      onChange={(e) => setThemeMode(e.target.value)}
                      className="df-input w-full px-3 py-2.5 text-sm"
                    >
                      <option value="dark">Escuro (Cores Honda NC750X)</option>
                      <option value="light">Claro (Alta visibilidade diurna)</option>
                      <option value="auto">Automático (Seguir o Windows)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Orientação da barra de separadores</label>
                    <select
                      value={navOrientation}
                      onChange={(e) => setNavOrientation(e.target.value)}
                      className="df-input w-full px-3 py-2.5 text-sm"
                    >
                      <option value="horizontal">Horizontal (Barra superior)</option>
                      <option value="vertical">Vertical (Painel lateral esquerdo)</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs m-0" style={{ color: 'var(--muted)' }}>
                  Estas preferências ficam guardadas neste computador e aplicam-se de imediato.
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
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
                    style={{ background: 'linear-gradient(135deg, #1E466E, #2B5B84)' }}
                  >
                    🔗 Copiar Link Rápido para outro PC
                  </button>
                  {deferredPrompt && (
                    <button
                      type="button"
                      onClick={handleInstallPwa}
                      className="df-input px-4 py-2 text-sm font-semibold"
                    >
                      📲 Instalar Aplicação no Ambiente de Trabalho
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border"
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
      </div>

      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border"
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
