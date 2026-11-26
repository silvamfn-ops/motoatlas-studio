# MotoAtlas Studio (GitHub Pages Ready)

Repositório pronto a publicar no **GitHub Pages** sem necessidade de build, Node.js ou terminal no computador.

## Estrutura do Repositório
- `index.html` — Aplicação completa (Ecrã de configuração Supabase, Login, Seletor de Viagens, Construtor de Etapas com GPX e Mapa Leaflet, e Estúdio Cultural com IA Gemini).
- `supabase/setup-database.sql` — Script SQL único para criar as 9 tabelas, regras de segurança RLS, view de consumos e bucket privado no Supabase.
- `supabase/functions/generate-poi-sheet/index.ts` — Código da Edge Function para preencher fichas culturais automaticamente com Gemini.

## Instalação Rápida (3 Passos)

### 1. Publicar no GitHub Pages
1. Faz upload dos ficheiros deste ZIP para o teu repositório GitHub.
2. Vai a **Settings** > **Pages**, escolhe a branch `main` (pasta `/root`) e clica em **Save**.

### 2. Configurar a Base de Dados e IA no Supabase
1. No painel do Supabase, abre **SQL Editor** > **New Query**, cola o conteúdo de `supabase/setup-database.sql` e clica em **Run**.
2. Vai a **Authentication** > **Users** > **Add User** e cria o teu utilizador e password.
3. Vai a **Edge Functions** > **Deploy a new function** > **Via Editor**, cria a função `generate-poi-sheet` com o código de `supabase/functions/generate-poi-sheet/index.ts` e adiciona o segredo `GEMINI_API_KEY`.

### 3. Abrir e Ligar
1. Abre o link do teu GitHub Pages no navegador.
2. Na primeira abertura, cola o **Project URL** e a **Anon Public Key** do teu Supabase (ficam guardados no navegador) e inicia sessão com o utilizador criado no passo 2.
