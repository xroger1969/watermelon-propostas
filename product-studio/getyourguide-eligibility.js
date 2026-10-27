/* Watermelon Product Studio — policy-based pre-screening, not GetYourGuide approval.
 * Last reviewed 2026-10-27, based on official supplier guidelines.
 * Notes reflect internal catalog codes and require human confirmation of direct operation.
 * This component does not alter product records, prices, bookings or submission status.
 */
const GYG_ELIGIBILITY_NOTES=Object.freeze({
  "WM-9963P23": {status:"combine",short:"Verificar possível sobreposição com 9963P8.",next:"Confirmar atividade guiada e conteúdo diferenciador além da praia e almoço."},
  "WM-9963P8": {status:"combine",short:"Possível variante do 9963P23.",next:"Comparar itinerário e inclusões. Considerar uma opção do produto principal."},
  "WM-9963P2": {status:"combine",short:"Comparar com 9963P14 (percurso da margem sul).",next:"Separar apenas se o itinerário e as visitas forem substancialmente diferentes."},
  "WM-9963P4": {status:"candidate",short:"Aulas de culinária são uma categoria potencialmente adequada.",next:"Confirmar quem ministra a aula, local, segurança alimentar e operação direta."},
  "WM-9963P28": {status:"animal",short:"Passeio a cavalo: avaliação específica de bem-estar animal.",next:"Documentar operador direto, bem-estar animal, seguro, percurso e regras de segurança."},
  "WM-9963P6": {status:"animal",short:"Quatro percursos de equitação no mesmo programa.",next:"Validar todas as opções, bem-estar animal e operação direta, sem duplicações."},
  "WM-9963P31": {status:"review",short:"Dia de praia: valor turístico diferenciador a comprovar.",next:"Clarificar se inclui guia, atividade organizada e componentes realmente prestadas."},
  "WM-9963P14": {status:"candidate",short:"Visita guiada da margem sul com potencial.",next:"Confirmar guia próprio, trajeto distinto de 9963P2 e locais visitados."},
  "WM-9963P32": {status:"candidate",short:"Surf e pôr do sol com atividade guiada potencialmente adequada.",next:"Confirmar escola/instrutor, licenças, seguros e conteúdo original."},
  "WM-9963P13": {status:"combine",short:"Arrábida meio dia: comparar com 9963P11.",next:"A duração pode constituir uma opção se a atividade principal for a mesma."},
  "WM-9963P11": {status:"candidate",short:"Passeio privado guiado da Arrábida com potencial.",next:"Distinguir rota/atividades do 9963P13 e confirmar quem opera."},
  "WM-9963P21": {status:"animal",short:"Trilho do Louro a cavalo: avaliação caso a caso.",next:"Confirmar operador direto, bem-estar animal, licenças e duração real (título vs. ficha)."},
  "WM-9963P27": {status:"candidate",short:"Pintura de azulejos e visita vínica com potencial.",next:"Confirmar se a Watermelon opera a experiência ou apenas revende serviços de terceiros."},
  "WM-1791378360618": {status:"operator",short:"Fonte identificada: site de outro operador (LX4 Tours).",next:"Não submeter como operador Watermelon sem comprovação da operação direta; considerar canal de parceria autorizado."},
  "WM-9963P12": {status:"combine",short:"Título e proposta semelhantes a 9963P16.",next:"Comparar o itinerário; evitar uma listagem duplicada de Lisbon Monuments."},
  "WM-9963P16": {status:"candidate",short:"Visita privada guiada aos monumentos de Lisboa com potencial.",next:"Distinguir 9963P12 e confirmar comentários de guia, entradas e custos obrigatórios."},
  "WM-9963P9": {status:"combine",short:"Poderá coincidir com o panorama de 9963P15.",next:"Fundir se oferecer o mesmo itinerário; não criar anúncios repetidos."},
  "WM-9963P15": {status:"candidate",short:"Miradouros guiados de Lisboa com potencial.",next:"Confirmar diferença relativamente a 9963P9 e valor acrescentado efetivo."},
  "WM-9963P26": {status:"animal",short:"Charrete puxada por cavalos: avaliação caso a caso.",next:"Comprovar bem-estar animal, segurança, licenciamento e operação direta."},
  "WM-9963P17": {status:"candidate",short:"Excursão de dia inteiro Lisboa–Porto com potencial.",next:"Verificar logística real de 9–10 horas, guia, paragens e capacidade anunciada."},
  "WM-9963P22": {status:"animal",short:"Experiência de 3 dias com equitação e alojamento.",next:"Distinguir tour multidiário de mera reserva de alojamento; confirmar operação direta e bem-estar animal."},
  "WM-9963P25": {status:"candidate",short:"Aula de culinária com visita ao mercado com potencial.",next:"Confirmar guia/instrutor próprio, espaço, licenças e atividade original."},
  "WM-9963P18": {status:"marine",short:"Observação de golfinhos em embarcação: requisitos marítimos.",next:"Validar licenças, seguros, embarcação, tripulação e duplicação com 9963P3."},
  "WM-9963P3": {status:"marine",short:"Observação de golfinhos com almoço: critérios marítimos.",next:"Confirmar operador direto da embarcação, segurança, bem-estar dos animais e diferença face a 9963P18."},
  "WM-9963P5": {status:"candidate",short:"Tour privado Sintra–Cascais com potencial.",next:"Demonstrar itinerário diferenciador, guia próprio, inclusões e condições de visita."}
});
const GYG_ELIGIBILITY_LABELS={
 candidate:"Potencial — confirmar",
 combine:"Comparar / agrupar",
 animal:"Revisão: animais",
 marine:"Revisão: marítimo",
 operator:"Operador externo?"
};
const GYG_ELIGIBILITY_REFERENCES=Object.freeze({
 restricted:"https://supply.getyourguide.support/hc/en-us/articles/19787988730525-Restricted-Activities-on-GetYourGuide",
 quality:"https://supply.getyourguide.support/hc/en-us/articles/29184465026845-GetYourGuide-Activity-Quality-Guidelines",
 operators:"https://supply.getyourguide.support/hc/en-us/articles/13980993520925-Who-can-apply-to-be-a-Supply-Partner",
 animal:"https://supply.getyourguide.support/hc/en-us/articles/27397652388253-GetYourGuide-s-Animal-Welfare-Policy",
 review:"https://supply.getyourguide.support/hc/en-us/articles/13980977371293-Understanding-the-Activity-Review-Process"
});
function gygIsValidPrice(value){
  return value!=="" && value!=null && Number.isFinite(Number(value)) && Number(value)>0;
}
function gygScreenProduct(p){
  const key=String(p.id||"");
  const note=GYG_ELIGIBILITY_NOTES[key]||{
    status:"review",
    short:"Programa ainda não classificado na triagem editorial.",
    next:"Confirmar operador, modalidade e regras da GetYourGuide."
  };
  const options=Array.isArray(p.allOptions)&&p.allOptions.length?p.allOptions:[{
    adultPrice:p.adultPrice,
    basePrice:p.basePrice,
    cutoffHours:p.cutoffHours,
    startTimes:p.startTimes
  }];
  const issues=[];
  if(options.some(o=>Number(o.cutoffHours??12)>10))issues.push("Antecedência de reserva superior a 10 h");
  if(options.some(o=>!gygIsValidPrice(o.adultPrice)&&!gygIsValidPrice(o.basePrice)))issues.push("Preço em falta numa opção");
  if(options.some(o=>!(Array.isArray(o.startTimes)?o.startTimes.length:String(o.startTimes||"").trim())))issues.push("Horários a confirmar");
  const gallery=typeof galleryOf==="function"?galleryOf(p):[];
  if(!gallery.length && !p.viatorSnapshot?.image)issues.push("Fotografias próprias a confirmar");
  const text=String(p.description||"").trim();
  if(text.length<120 || /^watermelon experiences:/i.test(text))issues.push("Descrição insuficiente");
  // An imported Viator listing is NOT proof of third-party operation.
  // The Studio currently has no verified direct-operator declaration for these records.
  issues.push("Operação direta e seguro ainda não verificados");
  if(note.status==="animal")issues.push("Política de bem-estar animal: revisão caso a caso");
  if(note.status==="marine")issues.push("Licenciamento e segurança marítima a verificar");
  if(note.status==="operator")issues.push("Origem externa identificada: confirmar o verdadeiro operador");
  return {id:key,title:String(p.title||"Sem título"),status:note.status,
    label:GYG_ELIGIBILITY_LABELS[note.status]||"Rever",
    short:note.short,next:note.next,issues,optionCount:options.length,
    cutoffInvalid:options.some(o=>Number(o.cutoffHours??12)>10),
    unpriced:options.some(o=>!gygIsValidPrice(o.adultPrice)&&!gygIsValidPrice(o.basePrice))};
}
function gygEligibilityBadge(status){
  return '<span class="gyg-eligibility-badge gyg-eligibility-'+status+'">'+
    esc(GYG_ELIGIBILITY_LABELS[status]||"Rever")+'</span>';
}
function gygDrawEligibilityRows(){
  const el=document.querySelector("#gygEligibilityRows");if(!el)return;
  const filter=document.querySelector("#gygEligibilityFilter")?.value||"";
  const search=(document.querySelector("#gygEligibilitySearch")?.value||"").toLowerCase();
  const list=products.map(gygScreenProduct).filter(p=>
    (!filter||p.status===filter)&&(!search||[p.id,p.title,p.short,p.next].join(" ").toLowerCase().includes(search))
  );
  el.innerHTML=list.length?'<div class="table-wrap"><table class="table gyg-eligibility-table"><thead><tr>'+
    '<th>Produto</th><th>Pré-triagem</th><th>Justificação</th><th>Correções obrigatórias / a confirmar</th></tr></thead><tbody>'+
    list.map(p=>'<tr><td><strong>'+esc(p.title)+'</strong><br><span class="hint">'+esc(p.id)+'</span></td>'+
      '<td>'+gygEligibilityBadge(p.status)+'</td>'+
      '<td>'+esc(p.short)+'<p class="gyg-eligibility-next">'+esc(p.next)+'</p></td>'+
      '<td><ul>'+p.issues.slice(0,5).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></td></tr>').join("")+
    '</tbody></table></div>':'<p class="hint">Não existem resultados para este filtro.</p>';
}
function renderGygEligibilityAudit(){
  const el=document.querySelector("#gygEligibilityAudit");if(!el)return;
  const reports=products.map(gygScreenProduct);
  const over=reports.filter(p=>p.cutoffInvalid).length;
  const unpriced=reports.filter(p=>p.unpriced).length;
  const operator=reports.filter(p=>p.status==="operator").length;
  el.innerHTML='<section class="card gyg-eligibility-card">'+
    '<div class="gyg-eligibility-head"><div><h2>Pré-triagem de elegibilidade GetYourGuide</h2>'+
    '<p>Regras oficiais e avaliação interna · 27/10/2026 · não representa aprovação da GetYourGuide</p></div>'+
    '<span class="gyg-eligibility-badge gyg-eligibility-review">Revisão obrigatória</span></div>'+
    '<div class="gyg-eligibility-stats">'+
      '<div><strong>'+reports.length+'</strong><span>programas analisados</span></div>'+
      '<div><strong>'+over+'</strong><span>antecedência acima de 10 h</span></div>'+
      '<div><strong>'+unpriced+'</strong><span>programas com opções sem preço</span></div>'+
      '<div><strong>'+operator+'</strong><span>com fonte externa identificada</span></div>'+
    '</div>'+
    '<p class="gyg-eligibility-warning"><strong>Preço de 27 € por pessoa:</strong> não existe um mínimo geral de 27 € nas regras oficiais consultadas. Nenhuma opção do catálogo está atualmente configurada como preço por pessoa. Preço por grupo não é preço individual.</p>'+
    '<p class="gyg-eligibility-warning"><strong>Atenção:</strong> “Ready” significa apenas pacote de conteúdo preparado no Studio. Não garante elegibilidade, propriedade da atividade, conformidade nem publicação. Nenhum dos 25 produtos possui neste catálogo uma confirmação documental de operação direta.</p>'+
    '<div class="gyg-eligibility-tools"><input id="gygEligibilitySearch" class="search" placeholder="Pesquisar programa ou código..." oninput="gygDrawEligibilityRows()">'+
      '<select id="gygEligibilityFilter" class="search" onchange="gygDrawEligibilityRows()"><option value="">Todos os tipos</option>'+
      Object.entries(GYG_ELIGIBILITY_LABELS).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join("")+'</select>'+
    '</div><div id="gygEligibilityRows"></div>'+
    '<div class="gyg-eligibility-references">'+
    '<a target="_blank" rel="noopener" href="'+GYG_ELIGIBILITY_REFERENCES.restricted+'">Atividades restritas</a>'+
    '<a target="_blank" rel="noopener" href="'+GYG_ELIGIBILITY_REFERENCES.quality+'">Qualidade / preços / prazos</a>'+
    '<a target="_blank" rel="noopener" href="'+GYG_ELIGIBILITY_REFERENCES.operators+'">Operador direto</a>'+
    '<a target="_blank" rel="noopener" href="'+GYG_ELIGIBILITY_REFERENCES.animal+'">Bem-estar animal</a>'+
    '<a target="_blank" rel="noopener" href="'+GYG_ELIGIBILITY_REFERENCES.review+'">Processo de revisão</a>'+
    '</div></section>';
  gygDrawEligibilityRows();
}
window.gygScreenProduct=gygScreenProduct;
window.renderGygEligibilityAudit=renderGygEligibilityAudit;
window.gygDrawEligibilityRows=gygDrawEligibilityRows;
