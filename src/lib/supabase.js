import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
let cachedConfigKey = '';

export function applyMagicLinkIfPresent() {
  try {
    const params = new URLSearchParams(window.location.search);
    const setupToken = params.get('setup');
    if (setupToken) {
      const decoded = JSON.parse(atob(setupToken));
      if (decoded.url && decoded.key) {
        localStorage.setItem('ma_supa_url', decoded.url.trim());
        localStorage.setItem('ma_supa_key', decoded.key.trim());
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return true;
      }
    }
  } catch (e) {
    console.warn('Token de setup invalido ignorado.');
  }
  return false;
}

export function buildMagicSetupUrl() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return '';
  const payload = btoa(JSON.stringify({ url, key }));
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?setup=${encodeURIComponent(payload)}`;
}

export function getSupabaseConfig() {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const localUrl = (localStorage.getItem('ma_supa_url') || '').trim();
  const localKey = (localStorage.getItem('ma_supa_key') || '').trim();

  const url = envUrl && !envUrl.includes('O-TEU-PROJECT-ID') ? envUrl : localUrl;
  const key = envKey && !envKey.includes('A-TUA-SUPABASE') ? envKey : localKey;

  return {
    url,
    key,
    isFromEnv: Boolean(envUrl && !envUrl.includes('O-TEU-PROJECT-ID') && envKey && !envKey.includes('A-TUA-SUPABASE')),
  };
}

export function saveSupabaseConfig(url, key) {
  localStorage.setItem('ma_supa_url', url.trim());
  localStorage.setItem('ma_supa_key', key.trim());
  cachedClient = null;
  cachedConfigKey = '';
}

export function clearSupabaseConfig() {
  localStorage.removeItem('ma_supa_url');
  localStorage.removeItem('ma_supa_key');
  cachedClient = null;
  cachedConfigKey = '';
}

export function getSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const signature = `${url}::${key}`;
  if (!cachedClient || cachedConfigKey !== signature) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'motoatlas-studio-auth',
      },
    });
    cachedConfigKey = signature;
  }
  return cachedClient;
}
