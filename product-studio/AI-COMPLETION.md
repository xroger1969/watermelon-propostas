# Preenchimento progressivo por IA

O editor tem ações para um campo, uma secção e o programa completo. A ligação ou o código Viator é reutilizado durante o preenchimento. Por defeito, o preenchimento de secções preserva os campos já preenchidos; o botão de cada campo permite preparar uma alternativa.

## Disponível nesta versão

- **Assistido:** pesquisar, rever as propostas, selecionar os campos e aplicar.
- **Automático em rascunho:** ativar «Completar campos vazios ao continuar». Ao avançar, o assistente pesquisa e completa os campos em falta da secção.
- Origem por campo: «Fonte Viator», «Sugestão IA» ou informação por confirmar. Uma fonte de uma atividade semelhante nunca é apresentada como facto do produto exato.
- Sugestões e dados operacionais importados exigem validação antes de Ready. Editar um campo conta como revisão desse campo; também existem validação individual e revisão conjunta.
- Rascunhos são gravados pelo fluxo existente. Ready e Live ficam apenas no editor até gravação explícita. O assistente não publica produtos nem escreve em marketplaces.
- Histórico dos últimos cinco preenchimentos e opção de desfazer. Fontes, revisão e histórico sobrevivem ao carregamento noutro dispositivo através do JSON inputSource já suportado pela API existente.

## Fontes e limites

A pesquisa é feita na Viator. Para códigos Watermelon 9963P, tenta-se também obter dados pela integração Viator existente no site, num endereço fixo. O conteúdo do produto e das fontes é tratado como dados, sem executar instruções incluídas nesses textos.

Preços, horários, lotação, condições e percurso propostos são hipóteses de trabalho quando a informação exata não é encontrada. Endereços precisos, fornecedores, licenças, garantias de segurança e inclusões de bilhetes não são inventados. Imagens continuam a ser geridas pela galeria existente.

O histórico de decisões é rastreabilidade; esta versão não treina um modelo nem aprende automaticamente com correções. Pesquisa em curso pode ser cancelada sem modificar campos. A publicação conserva o fluxo Draft → Ready → Live.

## Evolução prevista, ainda não implementada

1. Reutilizar regras e correções aprovadas do operador por tipo de atividade.
2. Detetar alterações nas fontes e apresentar apenas diferenças relevantes.
3. Completar conjuntos de rascunhos com regras de aceitação por campo e relatório de exceções.
4. Alargar a automação à operação e aos canais conforme as integrações e autorizações disponíveis.

Não existe sincronização agendada ou publicação autónoma nesta versão.

## Validação

`npm test` cobre o âmbito dos campos, proteção da publicação, referências Viator, normalização de valores, evidências de origem, preservação de texto, desfazer, revisão obrigatória e persistência dos metadados. As chamadas OpenAI dos testes usam respostas simuladas; a verificação real da integração é efetuada separadamente no Studio.
