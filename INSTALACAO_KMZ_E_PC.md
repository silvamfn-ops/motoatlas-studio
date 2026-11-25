# MOTOATLAS Studio — Correção KMZ + Botão Instalar no PC

## Porque é que o KMZ falhava antes?
1. O ficheiro `kmz-importer.js` anterior dependia de `JSZip` ser carregado manualmente antes no `index.html`, não aceitava subpastas nem tags `<gx:Track>` (usadas pelo Google Earth) e não ligava automaticamente o botão se o ID do `<input>` fosse diferente.
2. Para o browser permitir o botão **"💻 Instalar no PC"** (PWA Desktop no Chrome/Edge), o Studio precisa também de um `manifest.json` e de um `sw.js` ativos na mesma pasta.

## Como aplicar no repositório do MOTOATLAS Studio (2 minutos)
1. Copia os 3 ficheiros deste ZIP (`kmz-importer.js`, `manifest.json` e `sw.js`) para a raiz do repositório do **MOTOATLAS Studio** no GitHub Pages (substituindo o `kmz-importer.js` antigo).
2. No `<head>` do `index.html` do Studio, garante apenas estas 2 linhas:
```html
<link rel="manifest" href="manifest.json" />
<script src="kmz-importer.js"></script>
```
3. Antes de fechar o `</body>` do `index.html` do Studio, regista o Service Worker para ativar a instalação no PC:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

## O que este novo `kmz-importer.js` faz sozinho
- **Injeta automaticamente o botão `🌍 Importar KMZ / KML`** ao lado dos botões de importação existentes (e também se liga a qualquer `<input id="studioKmzInput">` que já tenhas colocado).
- **Carrega o `JSZip` automaticamente** caso não esteja no HTML, descompacta qualquer `.kmz` (incluindo subpastas e `<gx:Track>` do Google Earth) e atualiza o mapa e o roadbook.
- **Injeta automaticamente o botão `💻 Instalar no PC`** no cabeçalho do Studio e abre o diálogo nativo de instalação do Chrome/Edge no Windows ou Mac.
