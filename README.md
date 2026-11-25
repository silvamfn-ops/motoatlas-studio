# MOTOATLAS Studio v6.2 (Repositório Principal / PC)

Versão blindada contra bloqueios de cache, falhas de carregamento offline do mapa ou incompatibilidades de `<dialog>` entre navegadores.

## Melhorias de Estabilidade v6.2
- **Abertura Garantida do Modal Supabase:** Controlo híbrido (`window.openSupabaseModal()` + overlay CSS dedicado) independente da ordem de carregamento de bibliotecas externas.
- **Isolamento de Erros de Rede:** Se o Leaflet/OpenStreetMap estiver temporariamente inacessível, o Studio continua 100% operacional sem interromper os eventos dos botões.
- **Sincronização Direta Studio ↔ Road:** Publica a viagem ativa pelo código curto (`ANDALUZIA-26`) e consolida despesas, abastecimentos e odómetro no regresso.
