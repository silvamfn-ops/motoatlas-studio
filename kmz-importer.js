// MOTOATLAS Studio — Módulo Completo: Importação KMZ/KML (Google Earth / My Maps) + Instalação PWA no PC
// Não requer scripts externos manuais: carrega JSZip automaticamente se faltar e regista os eventos sozinho.

(function () {
  const TYPE_KEYWORDS = [
    { type: 'fuel', words: ['gasolina', 'combustível', 'combustivel', 'repsol', 'galp', 'bp', 'cepsa', 'shell', 'posto', 'abastecimento', 'fuel'] },
    { type: 'sleep', words: ['hotel', 'dormida', 'alojamento', 'hostel', 'pousada', 'camping', 'campismo', 'apartamento', 'airbnb', 'sleep'] },
    { type: 'viewpoint', words: ['miradouro', 'mirador', 'vista', 'paisagem', 'serra', 'puerto', 'porto', 'café', 'cafe', 'viewpoint'] },
    { type: 'monument', words: ['castelo', 'castillo', 'igreja', 'catedral', 'museu', 'monumento', 'plaza', 'praça', 'centro', 'monument'] }
  ];

  // Garante que a biblioteca JSZip está disponível mesmo que não tenha sido incluída no HTML
  function ensureJsZipLoaded() {
    if (typeof window.JSZip !== 'undefined') {
      return Promise.resolve(window.JSZip);
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-motoatlas-jszip]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.JSZip));
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar JSZip.')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.setAttribute('data-motoatlas-jszip', 'true');
      script.onload = () => {
        if (typeof window.JSZip !== 'undefined') resolve(window.JSZip);
        else reject(new Error('JSZip carregado mas indisponível.'));
      };
      script.onerror = () => reject(new Error('Sem ligação à internet para carregar o leitor de ficheiros .kmz (JSZip).'));
      document.head.appendChild(script);
    });
  }

  function inferWaypointType(name, desc, idx, total) {
    if (idx === 0) return 'start';
    if (idx === total - 1 && total > 1) return 'sleep';
    const hay = `${name} ${desc}`.toLowerCase();
    for (const rule of TYPE_KEYWORDS) {
      if (rule.words.some(w => hay.includes(w))) return rule.type;
    }
    return 'viewpoint';
  }

  function calcHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function parseKmlCoordinatesBlock(rawText) {
    if (!rawText) return [];
    return rawText
      .trim()
      .split(/\s+/)
      .map(token => {
        const parts = token.split(',');
        if (parts.length < 2) return null;
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return [lat, lng];
      })
      .filter(Boolean);
  }

  // Limpa namespaces XML estranhos (ex: gx:Track) antes de fazer parse para evitar erros no DOMParser
  function sanitizeKmlXml(rawXml) {
    return rawXml
      .replace(/^\uFEFF/, '')
      .replace(/<gx:Track[^>]*>([\s\S]*?)<\/gx:Track>/gi, (_, inner) => {
        const coords = [];
        const regex = /<gx:coord>([^<]+)<\/gx:coord>/gi;
        let m;
        while ((m = regex.exec(inner)) !== null) {
          const parts = m[1].trim().split(/\s+/);
          if (parts.length >= 2) coords.push(`${parts[0]},${parts[1]},${parts[2] || 0}`);
        }
        return coords.length ? `<LineString><coordinates>${coords.join(' ')}</coordinates></LineString>` : '';
      });
  }

  function parseKmlDocument(kmlString, fallbackTitle = 'Viagem Importada KMZ') {
    const cleanedXml = sanitizeKmlXml(kmlString);
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedXml, 'application/xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('O ficheiro KML interno tem estrutura XML inválida.');
    }

    const docName =
      doc.querySelector('Document > name')?.textContent?.trim() ||
      doc.querySelector('Folder > name')?.textContent?.trim() ||
      fallbackTitle.replace(/\.(kmz|kml)$/i, '');

    const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
    const rawPoints = [];
    let mergedRouteCoords = [];
    const stages = [];

    placemarks.forEach((pm, pmIdx) => {
      const nameEl = pm.getElementsByTagName('name')[0];
      const descEl = pm.getElementsByTagName('description')[0];
      const pmName = nameEl?.textContent?.trim() || `Ponto ${pmIdx + 1}`;
      const pmDesc = descEl?.textContent?.replace(/<[^>]+>/g, ' ').trim() || '';

      let folderName = '';
      let parent = pm.parentElement;
      while (parent) {
        if (parent.tagName === 'Folder') {
          const fNameEl = Array.from(parent.children).find(c => c.tagName === 'name');
          if (fNameEl) {
            folderName = fNameEl.textContent.trim();
            break;
          }
        }
        parent = parent.parentElement;
      }

      // 1. Extrair Pontos / Waypoints (<Point>)
      const pointEls = Array.from(pm.getElementsByTagName('Point'));
      pointEls.forEach(ptEl => {
        const coordEl = ptEl.getElementsByTagName('coordinates')[0];
        if (coordEl) {
          const pts = parseKmlCoordinatesBlock(coordEl.textContent);
          if (pts.length > 0) {
            rawPoints.push({
              name: pmName,
              description: pmDesc,
              folder: folderName,
              lat: pts[0][0],
              lng: pts[0][1]
            });
          }
        }
      });

      // 2. Extrair Traçados (<LineString>)
      const lineEls = Array.from(pm.getElementsByTagName('LineString'));
      if (lineEls.length > 0) {
        const lineCoords = [];
        lineEls.forEach(lnEl => {
          const coordEl = lnEl.getElementsByTagName('coordinates')[0];
          if (coordEl) lineCoords.push(...parseKmlCoordinatesBlock(coordEl.textContent));
        });
        if (lineCoords.length > 1) {
          mergedRouteCoords = mergedRouteCoords.concat(lineCoords);
          stages.push({
            name: pmName,
            folder: folderName,
            coordsCount: lineCoords.length
          });
        }
      }
    });

    if (rawPoints.length === 0 && mergedRouteCoords.length < 2) {
      throw new Error('O ficheiro KMZ/KML não contém marcadores nem linhas de trajeto.');
    }

    const basePoints = rawPoints.length > 0
      ? rawPoints
      : [
          { name: `Partida: ${docName}`, description: '', lat: mergedRouteCoords[0][0], lng: mergedRouteCoords[0][1] },
          { name: `Chegada: ${docName}`, description: '', lat: mergedRouteCoords[mergedRouteCoords.length - 1][0], lng: mergedRouteCoords[mergedRouteCoords.length - 1][1] }
        ];

    let cumKm = 0;
    const waypoints = basePoints.map((pt, idx) => {
      if (idx > 0) {
        cumKm += calcHaversineKm(basePoints[idx - 1].lat, basePoints[idx - 1].lng, pt.lat, pt.lng);
      }
      return {
        name: pt.name,
        type: inferWaypointType(pt.name, pt.description, idx, basePoints.length),
        lat: pt.lat,
        lng: pt.lng,
        km: Math.round(cumKm),
        notes: pt.description || pt.folder || ''
      };
    });

    let totalKm = Math.round(cumKm);
    if (mergedRouteCoords.length > 1) {
      let lineKm = 0;
      for (let i = 1; i < mergedRouteCoords.length; i++) {
        lineKm += calcHaversineKm(
          mergedRouteCoords[i - 1][0], mergedRouteCoords[i - 1][1],
          mergedRouteCoords[i][0], mergedRouteCoords[i][1]
        );
      }
      totalKm = Math.round(lineKm);
    } else {
      mergedRouteCoords = waypoints.map(w => [w.lat, w.lng]);
    }

    return {
      id: `kmz-${Date.now()}`,
      tripCode: `KMZ-${Math.floor(100 + Math.random() * 900)}`,
      profile: 'moto',
      tripTitle: docName,
      stageSubtitle: `${waypoints.length} paragens • ${totalKm} km (${stages.length || 1} traçado${stages.length === 1 ? '' : 's'})`,
      stageDistanceKm: totalKm,
      odometerKm: 0,
      tankCapacityL: 14.1,
      avgConsumptionL100: 3.8,
      waypoints,
      routeCoords: mergedRouteCoords,
      expenses: []
    };
  }

  async function importKmzOrKmlFile(file) {
    if (!file) throw new Error('Nenhum ficheiro selecionado.');
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.kml')) {
      const kmlText = await file.text();
      return parseKmlDocument(kmlText, file.name);
    }

    if (lower.endsWith('.kmz')) {
      const JSZipLib = await ensureJsZipLoaded();
      const arrayBuf = await file.arrayBuffer();
      const zip = await JSZipLib.loadAsync(arrayBuf);

      // Procura doc.kml na raiz ou em qualquer subpasta (case-insensitive)
      const fileNames = Object.keys(zip.files).filter(n => !zip.files[n].dir);
      let kmlName = fileNames.find(n => n.toLowerCase() === 'doc.kml')
        || fileNames.find(n => n.toLowerCase().endsWith('/doc.kml'))
        || fileNames.find(n => n.toLowerCase().endsWith('.kml'));

      if (!kmlName) {
        throw new Error('O arquivo .kmz não contém nenhum ficheiro .kml interno.');
      }

      const kmlText = await zip.file(kmlName).async('string');
      return parseKmlDocument(kmlText, file.name);
    }

    throw new Error('Formato inválido. Escolhe um ficheiro .kmz ou .kml.');
  }

  // --- AUTO-DETEÇÃO E INJEÇÃO NO STUDIO (SEM DEPENDER DE NADA MANUAL) ---
  function applyTripToStudioState(importedTrip) {
    // 1. Tenta atualizar variáveis globais comuns do MOTOATLAS Studio
    if (typeof window.currentTrip !== 'undefined') window.currentTrip = importedTrip;
    if (typeof window.activeTrip !== 'undefined') window.activeTrip = importedTrip;
    if (typeof window.tripData !== 'undefined') window.tripData = importedTrip;

    // 2. Guarda no localStorage do Studio (chaves v5 / v6)
    try {
      localStorage.setItem('motoatlas_studio_active_trip', JSON.stringify(importedTrip));
      localStorage.setItem('motoatlas_active_trip', JSON.stringify(importedTrip));
    } catch {}

    // 3. Dispara evento customizado para o app.js do Studio reagir
    window.dispatchEvent(new CustomEvent('motoatlas:tripImported', { detail: importedTrip }));

    // 4. Chama funções de renderização se existirem no escopo global
    if (typeof window.saveStudioTrip === 'function') window.saveStudioTrip();
    if (typeof window.renderStudioUI === 'function') window.renderStudioUI();
    if (typeof window.renderAll === 'function') window.renderAll();
    if (typeof window.updateMapAndRoadbook === 'function') window.updateMapAndRoadbook();
  }

  // --- BOTÃO "INSTALAR NO PC" (PWA DESKTOP CHROME / EDGE) ---
  let deferredInstallPrompt = null;

  function initDesktopInstallButton() {
    let installBtn = document.getElementById('btnInstallDesktopPwa');

    // Se o botão ainda não existir no HTML, cria e insere automaticamente no cabeçalho do Studio
    if (!installBtn) {
      const headerTarget =
        document.querySelector('header .header-actions') ||
        document.querySelector('header .actions') ||
        document.querySelector('header nav') ||
        document.querySelector('header');

      if (headerTarget) {
        installBtn = document.createElement('button');
        installBtn.type = 'button';
        installBtn.id = 'btnInstallDesktopPwa';
        installBtn.className = 'btn-studio-install-pc';
        installBtn.innerHTML = '💻 Instalar no PC';
        installBtn.title = 'Instalar MOTOATLAS Studio como aplicação no Windows/Mac';
        installBtn.style.cssText = [
          'background:#10b981',
          'color:#050811',
          'border:none',
          'border-radius:8px',
          'padding:0.45rem 0.85rem',
          'font-weight:800',
          'font-size:0.82rem',
          'cursor:pointer',
          'display:inline-flex',
          'align-items:center',
          'gap:0.35rem',
          'box-shadow:0 2px 8px rgba(16,185,129,0.35)'
        ].join(';');
        headerTarget.appendChild(installBtn);
      }
    }

    // Verifica se já está instalado (modo standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone && installBtn) {
      installBtn.style.display = 'none';
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
        installBtn.innerHTML = '💻 Instalar no PC';
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installBtn) {
        installBtn.innerHTML = '✅ Instalado no PC';
        setTimeout(() => { installBtn.style.display = 'none'; }, 2500);
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            deferredInstallPrompt = null;
          }
        } else {
          alert(
            '💻 Como instalar o MOTOATLAS Studio no PC:\n\n' +
            '• No Google Chrome ou Microsoft Edge: clica no ícone de instalação (🖥️➕) no lado direito da barra de endereços, ou abre o menu (⋮ / ⋯) → "Guardar e partilhar" → "Instalar MOTOATLAS Studio".\n\n' +
            'Nota: Certifica-te de que o ficheiro manifest.json e o sw.js estão na raiz do repositório GitHub Pages.'
          );
        }
      });
    }
  }

  // --- AUTO-INJEÇÃO DO BOTÃO IMPORTAR KMZ SE NÃO EXISTIR NO HTML ---
  function initKmzAutoBinder() {
    // 1. Liga a qualquer input existente que aceite .kmz ou .gpx
    const existingKmzInput = document.getElementById('studioKmzInput') || document.querySelector('input[type="file"][accept*="kmz"]');
    if (existingKmzInput) {
      existingKmzInput.setAttribute('accept', '.kmz,.kml,.gpx,application/vnd.google-earth.kmz+xml,application/vnd.google-earth.kml+xml');
      existingKmzInput.addEventListener('change', handleFileInputChange);
      return;
    }

    // 2. Se não houver input KMZ no HTML, injeta o botão junto ao importador de GPX/PPTX do Studio
    const gpxInput = document.querySelector('input[type="file"][accept*="gpx"], input[type="file"][accept*="pptx"], input[type="file"]');
    if (gpxInput && gpxInput.parentElement) {
      const container = gpxInput.parentElement.parentElement || gpxInput.parentElement;
      const wrapper = document.createElement('label');
      wrapper.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:0.4rem',
        'background:#1f2937',
        'color:#f59e0b',
        'border:1px solid #f59e0b',
        'border-radius:8px',
        'padding:0.45rem 0.85rem',
        'font-weight:700',
        'font-size:0.82rem',
        'cursor:pointer',
        'margin-left:0.4rem'
      ].join(';');
      wrapper.innerHTML = '🌍 Importar KMZ / KML <input type="file" id="studioKmzInput" accept=".kmz,.kml" hidden />';
      container.appendChild(wrapper);
      wrapper.querySelector('input').addEventListener('change', handleFileInputChange);
    }
  }

  async function handleFileInputChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.kmz') && !lower.endsWith('.kml')) return;

    try {
      const importedTrip = await importKmzOrKmlFile(file);
      applyTripToStudioState(importedTrip);
      alert(`✅ KMZ "${importedTrip.tripTitle}" importado com sucesso!\n• ${importedTrip.waypoints.length} paragens\n• ${importedTrip.stageDistanceKm} km`);
    } catch (err) {
      console.error('Erro KMZ:', err);
      alert(`❌ Erro ao importar KMZ: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  }

  // Inicializa automaticamente quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDesktopInstallButton();
      initKmzAutoBinder();
    });
  } else {
    initDesktopInstallButton();
    initKmzAutoBinder();
  }

  window.MOTOATLAS_KMZ = {
    importKmzOrKmlFile,
    parseKmlDocument,
    applyTripToStudioState
  };
})();
