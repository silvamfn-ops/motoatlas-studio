# MOTOATLAS Studio v1.0 (Repositório PC)

Aplicação de secretária dedicada à **criação, edição, arquivo e exportação** de expedições, concebida para alimentar a aplicação complementar de guiador **MOTOATLAS Road**.

## Funcionalidades Principais
1. **Bancada de 3 Colunas para Computador:**
   * **Arquivo de Viagens (Esquerda):** Gestão e pesquisa de múltiplas expedições (Moto ou Lazer), duplicação de roteiros e receção de registos concluídos da estrada.
   * **Editor Central:** Configuração de código curto da viagem (`trip_code`), dados de autonomia, tabela de paragens/roadbook, relatório de despesas pós-viagem e exportação.
   * **Mapa Interativo (Direita):** Cartografia OpenStreetMap detalhada com inserção rápida de coordenadas por clique no mapa.
2. **Ponte com MOTOATLAS Road (Nuvem ou Offline):**
   * **Via Supabase:** Publicação com 1 clique (`🚀 Enviar Viagem para o Telemóvel`) e receção dos registos efetuados durante a viagem (`📥 Receber Registos da Estrada`).
   * **Via Ficheiro Leve (`.motoatlas.json`):** Exportação individual da viagem selecionada para transferência 100% offline.
3. **Impressão A4 Limpa:** Botão dedicado para imprimir o roadbook da viagem em folha A4.
