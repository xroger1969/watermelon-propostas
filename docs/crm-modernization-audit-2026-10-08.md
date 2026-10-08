# Watermelon CRM — baseline de auditoria (2026-10-08)

## Âmbito e segurança
- Projeto: `xroger1969/watermelon-propostas`.
- Baseline: `main` no commit `973d941ce8d54fb00c4e8ca6aad8690f4e8f01fb`.
- Trabalho isolado em `audit-crm-ui-20261008`.
- Sem migrações, sem alterações a dados de clientes e sem deploy de produção nesta fase.
- Todas as alterações seguintes exigem verificação visual, testes de regressão e validação antes de integração na `main`.

## Constatações verificadas no código
1. `components/AdminCRM.tsx` agrega autenticação, listas de pedidos, ações comerciais, estados, comunicações, notificações e layout (~2935 linhas). Convém dividir por responsabilidades.
2. O dashboard apresenta nove cartões clicáveis e oito comandos de navegação/ação na barra superior. `CRMMarketingPerformance` e `CRMAnalytics` aparecem antes da lista operacional.
3. `loadCRM` consulta pedidos, contactos e mensagens, com subscrição Realtime, atualizações por foco e fallback de polling de mensagens a cada 2 segundos enquanto visível.
4. Algumas mensagens WhatsApp usam a função de envio do backend, enquanto outras geram um URL `wa.me`. Os resultados de envio devem ser explicitamente distinguidos.
5. Certas alterações de estado escrevem `watermelon_requests` e, em chamada separada, `watermelon_activities`. Avaliar atomicidade/auditoria.
6. Notificações Web Push implementadas com `public/watermelon-crm-sw.js` e funções RPC Supabase. Não assumir dependência OneSignal.
7. Existência de `tests/pricing.cjs` com casos de preços por grupo, por pessoa e transferência ao CRM; `package.json` não inclui script `test`.

## Constatações verificadas na base de dados (apenas leitura)
- `watermelon_requests`: 1 registo, estado `awaiting_customer` (conta corretamente como `In progress`).
- `watermelon_contacts`: 2 registos.
- `watermelon_booking_requests`: 1 registo.
- `watermelon_messages`: 5 registos.
- `watermelon_push_subscriptions`: 6 registos com `enabled=true`.
- `watermelon_analytics_events`: 162 eventos `page_view`, 3 `booking_request`, 3 `ai_crm_lead`.
- **Nota:** eventos analíticos históricos não equivalem necessariamente ao número atual de pedidos ativos; não transformar o desfasamento num erro sem rever semântica, retenção, origem e eventual eliminação.

## Regras de apresentação
- Área privada em português de Portugal; comunicação pública e com clientes em inglês.
- Navegação operacional prioritária: Pedidos, WhatsApp, Reservas/Pagamentos, Contactos, Product Studio, Marketing, Definições.
- Botões destrutivos fora da navegação principal e sempre com confirmação.
- Indicadores com definições inequívocas: atividade histórica, pedidos existentes, leads únicos e conversões Google Ads.
- Preservar a lógica `group` / `per_person` nas opções, reservas, propostas, CRM e pagamentos.

## Critérios de aceitação para a próxima etapa
- Criar testes de regressão para contadores, preço por grupo e transições de estado.
- Garantir que preço por grupo não é multiplicado por participantes.
- Garantir que uma atividade de marketing não aparece como pedido comercial sem a entidade correspondente.
- Garantir que não há perda nem duplicação de mensagens, subscrições ou pedidos.
- Validar em desktop e dispositivos móveis antes de publicar.

## Estado
- Baseline registada; nenhuma alteração funcional nesta etapa.
- Próxima tarefa: desenhar/implementar uma primeira melhoria isolada em branch e demonstrar os testes respetivos.
