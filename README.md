# Watermelon Propostas

Aplicação comercial para a **Watermelon Experiences**.

## Estado atual

O catálogo foi migrado do ficheiro `productList.csv` exportado do Viator Supplier Center, com **24 produtos únicos** e respetivas opções/horários. O site permite:

- pesquisar e filtrar experiências;
- selecionar opções do produto;
- adicionar programas a uma proposta;
- preencher cliente, data e participantes;
- definir preços manualmente;
- partilhar a proposta por WhatsApp;
- imprimir ou guardar em PDF.

## Marketplaces e reservas

A arquitetura mantém três canais separados:

- **Watermelon Direct** — pedidos e propostas diretamente no site;
- **Viator** — integração atual através da Partner API;
- **GetYourGuide** — adaptador preparado para ativação quando a conta de parceiro e os produtos/IDs estiverem aprovados.

A Viator continua a usar `VIATOR_PARTNER_API_KEY` para atualizar automaticamente catálogo e preços públicos.

A preparação GetYourGuide usa:

```
GETYOURGUIDE_PARTNER_API_TOKEN=
GETYOURGUIDE_TOUR_IDS=
GETYOURGUIDE_PARTNER_CONTACT_EMAIL=info@watermelonexperiences.pt
```

A chave da GetYourGuide deve permanecer apenas no servidor/Vercel. O catálogo GetYourGuide fica desativado enquanto não existir token e uma lista explícita de IDs, evitando mostrar produtos alheios por engano.

Endpoints de preparação:

- `/api/getyourguide-catalog`
- `/api/getyourguide-product?tourId=...`
- `/api/integrations/status`

## Segurança

Chaves de marketplace e outras credenciais **não devem ser guardadas no código**. Devem ficar exclusivamente em variáveis de ambiente da Vercel.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Fonte do catálogo

A base atual parte do catálogo Watermelon/Viator. A camada GetYourGuide foi preparada como fornecedor adicional, sem substituir a Viator nem alterar o fluxo de reserva direta.

## Watermelon AI Concierge

The public site includes a server-side AI travel concierge grounded in the
Watermelon Experiences catalogue. It can recommend relevant Watermelon
products, check current connected-marketplace guide prices when available, add
a shortlist to the existing proposal flow and hand the traveller over to
WhatsApp.

Required Vercel environment variable:

```
OPENAI_API_KEY=...
```

Optional model override:

```
OPENAI_CONCIERGE_MODEL=gpt-5.6-terra
```

The OpenAI API key must remain server-side and must never be exposed through a
`NEXT_PUBLIC_*` variable.

> Deployment note: environment changes require a fresh Vercel deployment.
