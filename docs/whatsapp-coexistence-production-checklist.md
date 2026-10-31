# WhatsApp empresarial Watermelon — publicação aprovada

Estado em 31/10/2026: **configuração aprovada para publicação da receção empresarial e de respostas exclusivamente manuais**. O teste real foi confirmado pelo proprietário e pelos recibos Meta: entregue às **13:03:27** e lido às **13:03:37** (Europe/Lisbon), com WAMID presente. A autorização Meta, a subscrição e a receção real também foram validadas.

A publicação desta configuração normal deve ser executada e verificada pela checklist abaixo. Este documento não afirma que esse deployment já terminou. Não são necessários novos envios de teste para cumprir o gate de entrega.

## Conta autorizada

| Elemento | Valor autorizado |
| --- | --- |
| WhatsApp empresarial | +351 965 637 736 |
| Phone Number ID | 1423415737522090 |
| WABA | 4408982439363483 |
| Aplicação Meta | Watermelon CRM — 1725466825210094 |
| Portefólio | Watermelon Auto — 759014320107772 |
| Configuração CRM | https://www.watermelonexperiences.pt/admin/whatsapp |
| Webhook | https://bwujfaptrrkshxarzbid.supabase.co/functions/v1/watermelon-whatsapp-webhook |

O WhatsApp pessoal +351 918 404 101 e o antigo Phone Number ID 874910289048462 ficam excluídos da integração. Não registar, migrar ou voltar a associar essa conta pessoal; não importar a sua agenda, histórico ou conversas.

Os identificadores acima não são credenciais. Uma alteração de IDs exige nova confirmação da correspondência com o número empresarial antes de atualizar a allowlist. Nunca colocar tokens, App Secret ou códigos de autorização em chat, GitHub, imagens ou logs.

## Comportamento aprovado

- Receção: `CRM_INBOUND_ENABLED=true` e `CRM_INBOUND_TEST_ONLY=false`, apenas para a correspondência exata de número, Phone ID e WABA empresariais.
- O webhook mantém `CRM_OUTBOUND_ENABLED=false`. Os endpoints antigos `send` e `send-v2` continuam a devolver 503. Filas, templates automáticos, lembretes, cron e envios em lote permanecem bloqueados.
- O botão da conversa chama apenas `watermelon-whatsapp-reply`, com `request_id`, texto aprovado pelo operador e `idempotency_key` UUIDv4 estável por tentativa. Não há chamadas de envio ao carregar, atualizar ou receber uma mensagem.
- O servidor deriva o destinatário do pedido/contacto, exige privacidade explicitamente false e uma mensagem recebida no mesmo pedido, contacto e endpoint empresarial há menos de 24 horas para responder com texto livre. Fora dessa janela bloqueia a resposta livre; não a substitui automaticamente por um modelo.
- Mensagens espontâneas podem criar um contacto e pedido empresariais. Um contacto privado ou com privacidade indefinida impede a importação. Pedidos antigos do mesmo telefone não são escolhidos apenas por essa coincidência.
- Uma mensagem citada exige associação válida a uma resposta manual do CRM ou ao teste controlado. Fontes antigas, templates, filas e contextos desconhecidos não qualificam nem abrem uma importação alternativa.
- Apenas eventos live `messages` são considerados. Histórico, sincronização de agenda/contactos, ecos da aplicação e tipos não admitidos continuam excluídos.
- A conversa apresenta apenas mensagens com `is_private===false`, Phone ID empresarial exato e source `cloud_api`, `crm_cloud_api_manual` ou `crm_cloud_api_controlled_test`. O campo de escrita fica só de leitura durante a submissão.

## Reserva e bloqueio de tentativas

O endpoint manual usa uma reserva UUID na PK de `watermelon_messages` para cada tentativa. A chave fica vinculada ao pedido, destinatário, texto e administrador. Repetições da mesma chave não voltam a chamar a Graph.

Um segundo registo **privado**, também com PK UUID em `watermelon_messages`, serializa tentativas de chaves diferentes para a mesma conversa. Usa source `crm_cloud_api_manual_guard`, `is_private=true`, texto nulo e metadados `manual_guard`. Não altera o esquema e não usa a coluna identity de `watermelon_activities`.

O guard não aparece na conversa e não qualifica como prova de janela, contexto citado ou recibo. A aquisição e libertação usam INSERT/CAS. Resultados pending/unknown conservam o bloqueio; só um resultado definitivo permite libertá-lo. O mesmo texto e prova de entrada já submetidos são reconhecidos mesmo com outra UUID, sem novo envio.

O esquema não possui status pending. As reservas usam status conservador `failed` com estado explícito em `raw_payload.manual_reply.state`. A interface mostra preparação/incerteza para pending/unknown, sem alegar rejeição ou envio. Apenas um WAMID válido permite `sent`. Uma falha de transporte, persistência ou resultado ambíguo nunca provoca repetição automática. Não apagar reservas para repetir um envio incerto.

O código `MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT` significa bloqueio antes da Graph. A interface preserva o rascunho e a UUID, apresenta esse bloqueio e aguarda o esclarecimento da tentativa anterior.

## Recibos e privacidade

Recibos manuais exigem source manual, endpoint exato, WAMID guardado, destinatário correspondente e pedido/contacto não privados. Preservam integralmente `raw_payload.manual_reply`, incluindo ator, hash, prova e estado de submissão. O estado de entrega é acrescentado em `manual_delivery`; não substitui os metadados da tentativa.

Atualizações usam compare-and-set e progressão sent → delivered → read. Recibos antecipados ou concorrentes sem correlação estável pedem retry; nunca iniciam mensagens. Dados brutos e mensagens externas de erro não são guardados nem devolvidos. Diagnósticos Meta limitam-se a códigos/subcódigos numéricos finitos.

O endpoint e a reserva globais do teste único mantêm a sua proteção contra repetição. O teste concluído não deve ser reenviado nem a sua reserva apagada.

## Checklist de publicação

1. Confirmar os checks e as revisões dos PRs do endpoint manual e da integração UI/webhook. O gate de entrega real acima está cumprido.
2. Integrar e publicar `watermelon-whatsapp-reply` com `verify_jwt=true`; confirmar que a fonte publicada coincide com a versão revista.
3. Integrar a UI e publicar o webhook revisto com HMAC, `verify_jwt=false` e `deno.json` preservados. Um deployment Vercel não publica funções Supabase.
4. Confirmar no servidor os três IDs empresariais, a subscrição da aplicação e do campo `messages`, a URL de callback e a verificação do webhook. Manter history, app-state/contact sync e echoes sem subscrição.
5. Confirmar que a produção Vercel está READY no commit integrado e que a UI indica receção ativa/respostas manuais.
6. Verificar que `send` e `send-v2` continuam 503, que o helper outbound continua false e que não existe cron ou processamento de filas ativado.
7. Preservar o funcionamento independente do WhatsApp pessoal e do WhatsApp Business. Não enviar outras mensagens de teste sem instrução explícita. Confirmar também que os links de contacto das versões distribuídas da app apontam ao número empresarial.

As verificações de publicação devem usar presença/configuração, metadados e fontes revistas, sem expor credenciais ou ler conversas pessoais.

## Rollback

Suspender a receção com `CRM_INBOUND_ENABLED=false`, ou restaurar `CRM_INBOUND_TEST_ONLY=true` para limitar a entrada à frase de teste. Manter `CRM_OUTBOUND_ENABLED=false`, a allowlist empresarial e os endpoints antigos em 503. Desativar o botão manual e suspender o novo endpoint, preservando as reservas e metadados de resultados incertos.

Confirmar a fonte efetivamente publicada após o rollback. Não restaurar a configuração do número pessoal, apagar guards para repetir mensagens ou drenar filas antigas.

## Validação

Os testes sintéticos cobrem identidade/autorização, privacidade, endpoint exato, janela de 24 horas, fontes admitidas, concorrência, UUIDs diferentes, fingerprints, resultados incertos, preservação de rascunhos, guards invisíveis e recibos com CAS. Não usam credenciais ou conversas reais.

A evidência real concluída é o inbound empresarial e a resposta única entregue/lida acima. A conclusão do deployment normal depende exclusivamente da checklist de publicação.

## Primeiro contacto manual com pedido do site

Pedidos ativos de origem ai_concierge sem qualquer inbound empresarial anterior no próprio pedido podem ser iniciados através de um modelo Meta aprovado. Este fluxo usa o endpoint separado watermelon-whatsapp-initiate-template, autenticado e com verify_jwt=true. Não reabre automaticamente conversas expiradas nem envia texto livre em vez do modelo.

O operador carrega explicitamente o catálogo, escolhe um modelo APPROVED/UTILITY com BODY estático, consulta o destinatário internacional e o texto, confirma «O cliente autorizou o contacto por WhatsApp sobre este pedido.» e carrega em «Iniciar conversa». Não há outro diálogo de confirmação nem envio ao carregar o catálogo. O telefone digitado no pedido e a origem do site não substituem esta confirmação.

O preview usa exclusivamente o número canónico devolvido pelo servidor. O POST aceita apenas request_id, template_name, language, client_attempt_id e consent_confirmed=true. O backend revalida a aprovação, o corpo estático, a elegibilidade, a privacidade e a associação; deriva o destinatário e regista operador/hora do consentimento. Uma reserva durável impede repetições com a mesma UUID ou com outra tentativa incerta. Nenhuma fila ou texto do rascunho é enviado após a aceitação do modelo.

Uma submissão confirmada usa source crm_whatsapp_manual_template e conserva a auditoria em raw_payload.manual_template. Os recibos preservam essa auditoria e o consentimento, com CAS/ranks e retry de correlação antecipada. Pending/unknown bloqueiam tanto o novo modelo como uma resposta livre; a interface mantém a UUID e o rascunho.

Quando o cliente responde, o webhook resolve primeiro a proveniência do modelo submetido mais recente para o mesmo destinatário/endpoint, antes de escolher um contacto genérico. Reconhece o mesmo número PT local ou E.164 e o prefixo internacional 00, sem alterar o contacto. Duplicados privados bloqueiam a associação. Depois da primeira resposta, a conversa segue o inbound mais recente do mesmo contacto, sem saltar para outro modelo antigo ainda sem resposta.

A aceitação do modelo não abre a janela de texto livre: é necessária uma mensagem efetiva do cliente nesse pedido há menos de 24 horas. Mantêm-se os legados em 503, o helper outbound false e a exclusão do número pessoal como origem da integração.

Publicar e verificar primeiro o endpoint de iniciação e a normalização do endpoint manual, depois o webhook revisto e só então a UI. Não enviar mensagens de teste ou comerciais durante a publicação sem uma ação explicitamente autorizada do operador.

