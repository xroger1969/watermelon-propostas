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

## Preços Viator em produção

A aplicação usa `VIATOR_PARTNER_API_KEY` na Vercel para atualizar automaticamente os preços públicos através da Viator Partner API.

## Segurança

A chave API da Viator/Bókun **não está no código**. Uma integração futura deverá guardar credenciais apenas em variáveis de ambiente da Vercel.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Fonte do catálogo

Exportação do Supplier Center (`productList.csv`) fornecida pelo operador. A aplicação não publica preços automáticos enquanto não existir uma integração segura de disponibilidade/preço.


## Watermelon AI Concierge

The public site includes a server-side AI travel concierge grounded in the
Watermelon Experiences catalogue. It can recommend relevant Watermelon
products, check current Viator guide prices when available, add a shortlist to
the existing proposal flow and hand the traveller over to WhatsApp.

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
