// MOTOATLAS Studio — Módulo de Importação KMZ / KML (Google Earth & Google My Maps)
// Requer JSZip (https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js) no index.html do Studio

(function () {
  const TYPE_KEYWORDS = [
    { type: 'fuel', words: ['gasolina', 'combustível', 'combustivel', 'repsol', 'galp', 'bp', 'cepsa', 'shell', 'posto', 'abastecimento', 'fuel'] },
    { type: 'sleep', words: ['hotel', 'dormida', 'alojamento', 'hostel', 'pousada', 'camping', 'campismo', 'apartamento', 'airbnb', 'sleep'] },
    { type: 'viewpoint', words: ['miradouro', 'mirador', 'vista', 'paisagem', 'serra', 'puerto', 'porto', 'café', 'cafe', 'viewpoint'] },
    { type: 'monument', words: ['castelo', 'castillo', 'igreja', 'catedral', 'museu', 'monumento', 'plaza', 'praça', 'centro', 'monument'] }
  ];

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

  function parseKmlDocument(kmlString, fallbackTitle = 'Viagem Importada KMZ') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlString, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('O ficheiro KML interno está corrompido ou é inválido.');
    }

    const docName =
      doc.querySelector('Document > name')?.textContent?.trim() ||
      doc.querySelector('Folder > name')?.textContent?.trim() ||
      fallbackTitle.replace(/\.(kmz|kml)$/i, '');

    const placemarks = Array.from(doc.querySelectorAll('Placemark'));
    const rawPoints = [];
    let mergedRouteCoords = [];
    const stages = [];

    placemarks.forEach((pm, pmIdx) => {
      const pmName = pm.querySelector('name')?.textContent?.trim() || `Ponto ${pmIdx + 1}`;
      const pmDesc = pm.querySelector('description')?.textContent?.replace(/<[^>]+>/g, ' ').trim() || '';
      const folderName = pm.closest('Folder')?.querySelector(':scope > name')?.textContent?.trim() || '';

      // 1. Extrair Pontos / Waypoints (<Point>)
      const pointCoordsNode = pm.querySelector('Point > coordinates');
      if (pointCoordsNode) {
        const pts = parseKmlCoordinatesBlock(pointCoordsNode.textContent);
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

      // 2. Extrair Traçados (<LineString> ou <MultiGeometry>)
      const lineNodes = Array.from(pm.querySelectorAll('LineString > coordinates'));
      if (lineNodes.length > 0) {
        const lineCoords = [];
        lineNodes.forEach(ln => {
          lineCoords.push(...parseKmlCoordinatesBlock(ln.textContent));
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
      throw new Error('O ficheiro KMZ/KML não contém marcadores nem traçados válidos.');
    }

    // Construir lista final de waypoints com cálculo de quilometragem acumulada
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

    // Calcular distância total pelo traçado se existir, senão pelos waypoints
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
      if (typeof JSZip === 'undefined') {
        throw new Error('Biblioteca JSZip não carregada no HTML do MOTOATLAS Studio.');
      }
      const arrayBuf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuf);

      // Procurar doc.kml ou qualquer ficheiro .kml dentro do arquivo KMZ
      let kmlEntry = zip.file('doc.kml');
      if (!kmlEntry) {
        const allKmls = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.kml'));
        if (allKmls.length === 0) {
          throw new Error('Nenhum ficheiro .kml encontrado dentro do arquivo .kmz.');
        }
        kmlEntry = zip.file(allKmls[0]);
      }

      const kmlText = await kmlEntry.async('string');
      return parseKmlDocument(kmlText, file.name);
    }

    throw new Error('Formato não suportado. Seleciona um ficheiro .kmz ou .kml.');
  }

  // Expor API global para o MOTOATLAS Studio
  window.MOTOATLAS_KMZ = {
    importKmzOrKmlFile,
    parseKmlDocument
  };
})();
