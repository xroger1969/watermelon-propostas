# Watermelon Experiences — primeira app iOS

Versão 0.1.0. Bundle ID: `pt.watermelonexperiences.app`. iPhone e iPad, iOS 17 ou posterior. Interface nativa SwiftUI, inglês e português de Portugal. Projeto: `ios/Watermelon/Watermelon.xcodeproj`.

## O que esta versão faz

- Explora os produtos publicados no Product Studio e os produtos ativos recebidos da Viator através das APIs já existentes do site. Junta as duas fontes por código, dando prioridade ao Studio. Rascunhos não são publicados pela app.
- Pesquisa e filtra experiências; guarda favoritos e os textos do catálogo para consulta sem internet.
- Monta um programa com até 20 experiências e envia um pedido de proposta para o CRM existente.
- Envia um pedido de reserva de uma experiência; preserva a distinção entre pedido pendente e confirmação da Watermelon.
- Importa uma proposta através da ligação privada enviada ao cliente; permite analisá-la, aceitar ou pedir alterações. Os totais e versões vêm do CRM.
- Guarda programas e referências no dispositivo, partilha resumos e abre o Maps e o editor do Calendário Apple. Uma entrada de calendário é identificada como data prevista; só fica guardada se o utilizador carregar em Guardar no editor Apple.
- Abre as opções de pagamento já existentes da proposta através de ligação privada HTTPS.
- Abre um contacto WhatsApp por ação do utilizador, sem enviar mensagens automaticamente.

## Integração e limites desta primeira versão

Usa `https://www.watermelonexperiences.pt` como servidor. Não inclui passwords, chaves Viator, chaves Supabase privilegiadas ou credenciais Apple no binário. Não altera o esquema de dados nem a associação do número WhatsApp profissional.

Os preços por grupo não são multiplicados pelo número de participantes. Opções com preço por confirmar continuam sem preço; o valor base não é usado para inventar o valor de uma opção com transfer. Os dados de uma fonte indisponível não dão autorização para enviar pedidos de produtos guardados. O servidor volta a validar preços e capacidades.

O acompanhamento de reservas nesta versão consiste em guardar a referência e o estado inicial pendente: a API atual não fornece ao cliente uma consulta autenticada de estados de reserva. Não é apresentada uma falsa confirmação nem uma atualização em tempo real. Propostas recebidas podem ser atualizadas com a respetiva ligação privada. As descrições dos produtos conservam o idioma do catálogo; os controlos da app têm localização inglesa e portuguesa.

Dados locais usam a proteção de ficheiros do iOS. As ligações de propostas são credenciais de acesso do cliente e só se partilham a seu pedido. Pode remover os dados locais em Mais → Remover dados guardados. Os pedidos já enviados ficam no CRM.

## Abrir e testar no Mac

Descarregar este repositório e abrir `ios/Watermelon/Watermelon.xcodeproj`. Não precisa de npm, CocoaPods, Capacitor, Fastlane ou XcodeGen para a app nativa.

1. Escolher o esquema **Watermelon** e um simulador iPhone.
2. Product → Test testa os preços, ligações privadas, payloads do CRM e navegação.
3. Para correr no iPhone, em Signing & Capabilities selecionar a equipa **Carlos Vasconcelos**, mantendo `pt.watermelonexperiences.app`.

Alternativamente: `bash scripts/watermelon-ios.sh open` ou `bash scripts/watermelon-ios.sh check`.

Os testes simulam pedidos e não criam leads nem enviam mensagens reais. O modo de navegação de teste só é compilado em Debug. O projeto Xcode pode ser regenerado com `python3 scripts/generate-watermelon-project.py`.

## Primeiro envio para TestFlight

É uma app nova, com registo e perfil próprios. O perfil de assinatura de `pt.familyflow.app` não serve para assinar `pt.watermelonexperiences.app`.

No Apple Developer, registar o Bundle ID **pt.watermelonexperiences.app**. No [App Store Connect](https://appstoreconnect.apple.com/apps), criar uma app iOS:

| Campo | Valor |
|---|---|
| Nome | Watermelon Experiences |
| Idioma principal | Inglês (Reino Unido) |
| Bundle ID | pt.watermelonexperiences.app |
| SKU | WATERMELON-IOS-001 |
| Acesso dos utilizadores | Acesso completo |

A Apple exige criar o registo inicial no site App Store Connect; a API não permite criar uma app nova. Depois de selecionar a equipa em Xcode: Product → Archive → Distribute App → App Store Connect → Upload. Este procedimento reutiliza a conta Apple do Mac e não exige copiar chaves para esta conversa. O build ainda tem de ser processado pela Apple e associado a um grupo TestFlight.

## Envio automático preparado no GitHub

Workflow: `.github/workflows/watermelon-ios.yml`. Qualquer alteração à app em `main` compila e executa testes no macOS. O job `signing-status` mostra apenas nomes de configurações em falta, nunca os seus valores. O envio exige os testes aprovados e configuração Apple no repositório Watermelon:

Variáveis: `APPLE_TEAM_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_API_KEY_ID`.

Secrets: `APPSTORE_API_PRIVATE_KEY`, `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`, `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`, `WATERMELON_PROVISIONING_PROFILE_BASE64`. O último deve ser um perfil App Store para **pt.watermelonexperiences.app**, associado à mesma equipa e certificado.

Executar o workflow com `send_to_testflight=true`. Para envios posteriores a cada push, definir `WATERMELON_TESTFLIGHT_ENABLED=true` após validar o primeiro envio. O workflow apenas envia builds beta para TestFlight; não submete uma versão à App Store pública.

## Notas para a revisão beta

App de viagens com catálogo nativo, favoritos, programas personalizados, propostas privadas, resumo de pedidos offline, Maps e Calendário Apple. Não é necessário criar uma conta para explorar ou pedir uma proposta. Para testar propostas recebidas, fornecer ao revisor uma ligação de teste válida e sem dados de clientes reais.

Política de privacidade: `https://www.watermelonexperiences.pt/privacy`. Apoio ao cliente: site e contacto WhatsApp da Watermelon. Declarar no App Store Connect a recolha de nome, telefone, e-mail opcional e conteúdo do pedido para tratar propostas/reservas; sem tracking publicitário nesta app nativa.

A aprovação depende da avaliação da Apple. Não foi submetida uma versão pública à App Store.
