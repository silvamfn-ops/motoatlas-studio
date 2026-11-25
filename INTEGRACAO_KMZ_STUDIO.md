# Integração de Importação KMZ / KML no MOTOATLAS Studio

Para ativares a leitura direta de ficheiros `.kmz` (exportados do **Google My Maps** ou **Google Earth**) e `.kml` no **MOTOATLAS Studio**, segue estes 3 passos simples:

## 1. Adicionar JSZip e o módulo `kmz-importer.js` no `index.html` do Studio
Antes do `app.js` do Studio, inclui:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="kmz-importer.js"></script>
```

## 2. Adicionar o botão de importação no painel do Studio
No formulário de importação do Studio, adiciona um `<input type="file">`:
```html
<label class="btn-studio-outline">
  🌍 Importar KMZ / KML (Google My Maps)
  <input type="file" id="studioKmzInput" accept=".kmz,.kml,application/vnd.google-earth.kmz+xml,application/vnd.google-earth.kml+xml" hidden />
</label>
```

## 3. Ligar o evento no `app.js` do Studio
```javascript
document.getElementById('studioKmzInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const importedTrip = await window.MOTOATLAS_KMZ.importKmzOrKmlFile(file);
    // Atribuir ao estado ativo do Studio e atualizar mapa + roadbook
    currentTrip = importedTrip;
    saveStudioTrip();
    renderStudioUI();
    alert(`✅ KMZ "${importedTrip.tripTitle}" importado com ${importedTrip.waypoints.length} paragens e ${importedTrip.stageDistanceKm} km!`);
  } catch (err) {
    alert(`❌ Erro ao importar KMZ: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});
```

## Funcionalidades Incluídas no `kmz-importer.js`
- **Descompactação em memória:** Lê `doc.kml` (ou qualquer `.kml` interno) diretamente do `.kmz` sem precisar de servidor.
- **Deteção automática de categorias:** Reconhece palavras-chave nos nomes e descrições dos pins (*Repsol, Galp, Hotel, Miradouro, Castelo, Plaza*) e atribui o ícone certo (`⛽`, `🏨`, `📸`, `🏛️`).
- **Compatibilidade imediata com o MOTOATLAS Road v1.4:** O objeto gerado segue exatamente a estrutura `.motoatlas.json` / Supabase consumida pelo iPhone, onde o motor OSRM gera depois as ruas, saídas de rotundas e avisos de voz.
