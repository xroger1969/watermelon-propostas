# Watermelon Experiences — plano de melhorias após a aprovação da App Store

**Preparado em 25-10-2026.** Este documento define os procedimentos de trabalho; não confirma aprovação da Apple, não publica builds nem modifica dados de clientes.

## Versões e responsabilidades

- **1.0 (build 7401)**: candidata pública em revisão no App Store Connect em 25-10-2026. Não substituir, retirar da revisão ou modificar a configuração por causa do desenvolvimento em curso.
- **Correção já preparada (PR #57)**: guardar pedidos criados pela Watermelon AI e distinguir códigos de pedidos `WM-AI-…` de ligações privadas de propostas; testes e revisão são obrigatórios antes da integração.
- **Atualização posterior (1.0.1, ou 1.1 se vier a incluir novas funcionalidades)**: escolher a versão apenas quando o conjunto exato de alterações estiver validado. Um novo binário exige novo número de compilação; não assumir que uma edição no GitHub altera a app instalada.
- **Site e CRM**: continuar operacionais. Não alterar pagamentos, preços, dados de hóspedes ou produção para validar mudanças da app sem testes específicos e plano de reversão.

## Condição de arranque

1. Confirmar **aprovação efetiva** no App Store Connect ou disponibilidade pública oficial da versão 1.0; aprovação para beta/TestFlight não é aprovação pública.
2. Confirmar se a versão pública foi **lançada** (uma versão aprovada pode estar retida para lançamento manual).
3. Confirmar testes do iOS PR #57 sem falhas e completar a revisão de segurança/privacidade.
4. Integrar o PR aprovado sem mudanças simultâneas ao backend. Executar os testes em `main`.
5. **Enviar uma nova compilação para TestFlight através de uma execução explicitamente autorizada** do workflow de iOS. Confirmar funcionamento em iPhone e, se suportado, Mac/iPad.
6. Criar a nova versão no App Store Connect, atualizar notas e questionários se necessário; associar build e **submeter à Apple só com aprovação explícita do proprietário**.
7. Disponibilizar publicamente depois da revisão da Apple. A publicação de atualizações não é automática por apenas haver push no GitHub.

## Matriz mínima de regressão por atualização

- Explorar experiências (catálogo Product Studio e parceiros), pesquisa, filtros, fotografias, preços por grupo/pessoa e variações/opções; sem login obrigatório.
- Criar pedido Watermelon AI; verificar **uma** referência no CRM e no histórico local da app; fechar/reabrir e confirmar persistência, sem duplicação.
- Pedido `WM-AI-…` é **referência de pedido**, nunca um token de acesso a uma proposta privada. Introdução manual permite guardar a referência mas não consulta dados confidenciais.
- Proposta verdadeira emitida no CRM: só URL `https://www.watermelonexperiences.pt/proposal/<reference>?token=<uuid>` permite abrir/aceitar/pedir mudanças; rejeitar host desconhecido, URL sem token e token inválido.
- Fluxos de reserva e estado: confirmação manual da Watermelon, ligação de pagamento apenas após aprovação, nunca declarar pagamento concluído pela mera abertura da ligação.
- AI: confirmação de consentimento, microfone, privacidade, rate limiting e recuperação de erros sem criar pedidos fantasma.
- Estados offline, rede lenta, arranque limpo, localização PT-PT/EN, VoiceOver, ecrã pequeno, data/fuso de Portugal.
- CRM, envio de e-mail/WhatsApp, referência e acesso à proposta testados de ponta a ponta com **dados de teste não reais**.

## Ordem de melhorias (sem alterar a versão 1.0 em revisão)

**P0 — fiabilidade (primeira atualização):**
- Validar testes do PR #57, corrigir qualquer regressão e enviar para TestFlight só após aprovação 1.0.
- Envio de ligação privada da proposta do CRM para a app, com testes end-to-end e sem exposição de dados pessoais.
- Mensagens distintas: «Pedido recebido», «Proposta enviada», «Reserva confirmada»; nunca confundir fases.

**P1 — continuidade entre dispositivos:**
- Recuperar pedidos de um cliente noutro dispositivo através de identificação segura e consentida (p. ex., ligação por e-mail de uso único). **Não** permitir consulta por `WM-AI` ou nome/telefone isolado. Continuar a permitir exploração sem conta.
- Prevenir pedidos duplicados, documentar eliminação de dados e retenção e integrar a sincronização somente após revisão da política de privacidade.

**P2 — qualidade e crescimento:**
- Completar testes automáticos iPhone, iPad/Mac, links universais/deep links, idiomas, acessibilidade e erros de rede.
- Instrumentar diagnósticos mínimos com consentimento e sem recolher transcrições nem dados sensíveis desnecessários.
- Melhorar o percurso catálogo → proposta → reserva confirmada a partir de observação de falhas reais, sem alterar o modelo de pagamentos autorizado.

## Ritmo de trabalho

- **Semanal**: rever erros observados, avaliações públicas, relatórios do CRM, segurança, dependências e issues do GitHub; priorizar por impacto e risco.
- **Em cada PR**: incluir descrição, testes, revisão de privacidade/segurança, evidência de CI e notas para versão.
- **Antes de qualquer envio público**: testar em TestFlight, confirmar versão e build, validar metadados e solicitar revisão da Apple.
- **Após lançamento**: verificar erros e estabilidade; se houver regressão grave, preparar nova atualização corretiva. Nunca prometer rollback instantâneo de uma versão já instalada.

## Links operacionais

- App Store Connect: https://appstoreconnect.apple.com/apps/6821932993
- Código: https://github.com/xroger1969/watermelon-propostas
- Correção de pedidos da IA: https://github.com/xroger1969/watermelon-propostas/pull/57
- Testes da correção: https://github.com/xroger1969/watermelon-propostas/actions/runs/40211707171
- Workflow TestFlight: `.github/workflows/watermelon-ios.yml` (verificar os controlos atuais antes de executar)

**Regra de segurança:** nenhuma nova compilação, migração de produção, pagamento, mudança de preços ou publicação na App Store sem validação técnica e autorização específica para a etapa correspondente.
