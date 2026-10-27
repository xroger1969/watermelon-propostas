# Watermelon Experiences — triagem GetYourGuide (27/10/2026)

**Âmbito:** 25 programas e 30 opções da base de dados atual do Watermelon Product Studio. Esta é uma **triagem editorial preliminar**, não uma decisão de aceitação da GetYourGuide nem uma prova de que a Watermelon opera diretamente todas as experiências.

## O que dizem as regras oficiais

- Não foi identificado nas regras públicas consultadas nenhum preço mínimo geral de **27 € por pessoa**. Existe um limite máximo de 2.000 € por bilhete individual; preços devem incluir taxas obrigatórias e não são permitidos passeios baseados em gorjetas.
- A GetYourGuide exige **operadores diretos**, e não aceita a simples revenda ou agregação de experiências como produtos próprios de um fornecedor.
- Não admite simples transfers padrão, alugueres de veículos sem experiência turística, percursos autoguiados em certas condições, alojamento como serviço isolado e diversas outras categorias restritas.
- Passeios a cavalo ou com charrete são avaliados caso a caso segundo a política de bem-estar animal. Atividades marítimas exigem segurança e enquadramento legal.
- Produtos iguais ou quase iguais não devem ser publicados em duplicado. As diferenças de duração ou dimensão do grupo poderão constituir opções dentro do mesmo produto.
- A antecedência máxima de reserva indicada nas regras de qualidade é de **10 horas**; o mínimo de participantes para confirmar uma experiência deverá ser 5 ou menos. Uma experiência rejeitada não pode ser simplesmente submetida novamente sem alterações genuinamente diferenciadoras.
- A GetYourGuide decide a aceitação após revisão manual no Supplier Portal. O estado `Ready` no Watermelon Studio significa apenas que foi preparado um pacote de conteúdo.

## Auditoria técnica real (Supabase Watermelon Product Studio)

| Indicador | Resultado |
| --- | ---: |
| Programas | 25 |
| Opções | 30 |
| Opções com antecedência superior a 10 horas | 30 (todos os 25 programas) |
| Opções com preço adulto/base em falta | 15 |
| Programas com pelo menos uma opção sem preço | 13 |
| Opções com preço registado | 15 |
| Opções com preço **por pessoa** | 0 |
| Opções exatamente de 27 € | 0 |
| Pacotes GetYourGuide no Studio marcados `ready` | 13 |
| Aprovações reais GetYourGuide confirmadas | Nenhuma |

**Não alterar automaticamente os preços ou os prazos:** é necessário confirmar os dados reais com o operador. Os registos da Viator podem conter preços por grupo, não por pessoa; não são convertíveis sem saber o número de participantes.

## Triagem por programa

| Código | Programa abreviado | Tratamento aconselhado |
| --- | --- | --- |
| WM-9963P23 | Praia e almoço all-inclusive | Comparar com 9963P8; falta demonstrar experiência organizada diferenciada |
| WM-9963P8 | Praia com almoço | Possível variante de 9963P23; completar preço/conteúdo |
| WM-9963P2 | Cacilhas–Almada–Costa (dia inteiro) | Comparar itinerário com 9963P14; confirmar duração real |
| WM-9963P4 | Aula de culinária na praia | Potencial, se operada diretamente e com segurança alimentar |
| WM-9963P28 | Cavalos na praia com almoço | Bem-estar animal + seguro + operador direto, caso a caso |
| WM-9963P6 | Equitação: quatro opções | Bem-estar animal + opções; os três preços em falta devem ser confirmados |
| WM-9963P31 | Dia de praia (Ride and Relax) | Rever conteúdo; distinguir de uma simples estadia na praia |
| WM-9963P14 | Tour privado Almada/Cacilhas/Costa | Potencial, demonstrando guia e percurso distinto de 9963P2 |
| WM-9963P32 | Surf e pôr do sol | Potencial, confirmar instrutor, licenças e execução própria |
| WM-9963P13 | Arrábida meio dia | Comparar com 9963P11; possíveis opções de duração |
| WM-9963P11 | Tour privado Arrábida 6–7 h | Potencial, distinguir da opção meio dia |
| WM-9963P21 | Equitação Arrábida/Louro | Bem-estar animal, operação direta e duração inconsistente no título/ficha |
| WM-9963P27 | Azulejos + visita vínica | Potencial se empresa operar efetivamente, não apenas revender dois parceiros |
| WM-1791378360618 | Quad Costa da Caparica | **Confirmar operador**: origem dos dados é `lx4tours.com`; não presumir que a Watermelon opera esta atividade |
| WM-9963P12 | Lisbon Monuments | Possível duplicação de 9963P16; confirmar valor distinto |
| WM-9963P16 | Lisbon Monuments Private Tour | Potencial, confirmar guia e diferença face ao 9963P12 |
| WM-9963P9 | Lisbon Panoramic | Possível duplicação de 9963P15 |
| WM-9963P15 | Miradouros panorâmicos de Lisboa | Potencial, com guia e roteiro próprio, comparando 9963P9 |
| WM-9963P26 | Charrete em Palmela | Bem-estar animal e operador direto, caso a caso |
| WM-9963P17 | Lisboa–Porto dia inteiro | Potencial, validar duração, roteiro, capacidade e guia |
| WM-9963P22 | Equitação três dias all-inclusive | Bem-estar animal + enquadrar alojamento como parte do passeio, não serviço autónomo |
| WM-9963P25 | Aula de culinária no mercado | Potencial se houver instrutor/experiência diretamente operados |
| WM-9963P18 | Golfinhos em trawler | Licenças, seguro, operador da embarcação, possível relação com 9963P3 |
| WM-9963P3 | Golfinhos em trawler e almoço | Idem; distinguir experiência de 9963P18 |
| WM-9963P5 | Sintra–Cascais privado | Potencial com guia e itinerário efetivamente diferenciador |

Estas classificações **não são rejeições**. O Studio ainda não contém confirmação documental de quais os programas operados diretamente. Importações de produtos da Viator não provam, por si só, revenda; já o programa Quad contém referência explícita a um operador externo, pelo que exige verificação particular.

## Recomendação de execução

Prioridade preliminar, condicionada a **operação direta comprovada**, seguros/licenças, disponibilidade e conteúdo original:
1. Tour privado da Arrábida (9963P11), consolidando a versão meio dia quando adequado.
2. Passeios guiados na margem sul (9963P14), evitando anúncios quase iguais.
3. Aula de culinária (9963P25 e/ou 9963P4; verificar se são percursos efetivamente diferentes).
4. Sintra–Cascais (9963P5), após completar preço e horários.
5. Experiência de azulejos + vinho (9963P27), apenas se as condições de operador direto estiverem verificadas.

**Não preparar para submissão**, antes de esclarecimentos, os programas de terceiros/revenda, as propostas de praia não diferenciadas e as experiências a cavalo sem documentação de bem-estar animal. Nenhum programa deve ser considerado “aprovado” com base neste relatório.

## Fontes oficiais (GetYourGuide)

- [Atividades restritas, 28/07/2026](https://supply.getyourguide.support/hc/en-us/articles/19787988730525-Restricted-Activities-on-GetYourGuide)
- [Critérios de qualidade](https://supply.getyourguide.support/hc/en-us/articles/29184465026845-GetYourGuide-Activity-Quality-Guidelines)
- [Quem pode ser fornecedor, 24/03/2026](https://supply.getyourguide.support/hc/en-us/articles/13980993520925-Who-can-apply-to-be-a-Supply-Partner)
- [Bem-estar animal, 26/05/2026](https://supply.getyourguide.support/hc/en-us/articles/27397652388253-GetYourGuide-s-Animal-Welfare-Policy)
- [Revisão e rejeições, 29/06/2026](https://supply.getyourguide.support/hc/en-us/articles/13980977371293-Understanding-the-Activity-Review-Process)
- [Antecedência de reserva](https://supply.getyourguide.support/hc/en-us/articles/13980997018141-Setting-up-cut-off-times-for-your-product)
- [Atividades únicas](https://supply.getyourguide.support/hc/en-us/articles/29183813254301-Submitting-Unique-Activities)

A GetYourGuide tem a decisão final em cada atividade e poderá aplicar critérios adicionais não publicados.
