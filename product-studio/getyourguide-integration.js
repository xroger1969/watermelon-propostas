/* Watermelon Studio GetYourGuide integration control centre.
   Read-only status. No supplier/partner API call is made from the browser. */
function gygCheck(label,ok){
  return '<li><span aria-hidden="true">'+(ok?'✓':'○')+'</span> '+esc(label)+'</li>';
}
function gygConnBadge(ready,text){
  return '<span class="gyg-conn-badge '+(ready?'gyg-conn-ready':'gyg-conn-pending')+'">'+
    (ready?'✓ ':'○ ')+esc(text)+'</span>';
}
function gygSummary(products){
  return {
    total:products.length,
    ready:products.filter(p=>gygPublication(p).status==="Ready").length,
    published:products.filter(p=>gygPublication(p).status==="Published").length
  };
}
function gygSupplierAccountCard(account){
  const configured=!!account?.configured&&!!account?.id;
  return '<section class="card gyg-account-card" aria-labelledby="gygAccountTitle">'+
    '<div class="gyg-conn-eyebrow">CONTA DE FORNECEDOR</div><h3 id="gygAccountTitle">Conta GetYourGuide</h3>'+
    gygConnBadge(configured,configured?"Conta de fornecedor configurada no Studio":"Conta por configurar")+
    '<dl class="gyg-account-facts"><div><dt>Conta</dt><dd>'+esc(account?.name||"Watermelon Experiences")+'</dd></div>'+
    '<div><dt>ID do fornecedor</dt><dd>'+esc(configured?account.id:"Por configurar")+'</dd></div>'+
    '<div><dt>Sincronização automática de reservas</dt><dd>Inativa</dd></div></dl>'+
    '<p>Falta concluir a ligação autorizada pela GetYourGuide e associar as atividades desta conta. '+
    'As reservas ainda não são importadas automaticamente.</p>'+
    '<div class="gyg-account-links">'+
    (configured&&account.profileUrl?'<a class="btn" href="'+esc(account.profileUrl)+'" target="_blank" rel="noopener noreferrer">Ver perfil da empresa</a>':'')+
    '<a class="btn" href="https://supplier.getyourguide.com/home" target="_blank" rel="noopener noreferrer">Abrir portal GetYourGuide</a></div>'+
    '<p class="gyg-account-note">No portal, confirma que a sessão corresponde ao ID de fornecedor indicado acima. '+
    'Registar a conta não ativa a integração técnica.</p></section>';
}
function gygRenderIntegrationHub(data,error){
  const el=document.querySelector("#gygIntegrationHub"); if(!el)return;
  const s=data?.supplier||{},p=data?.partner||{};
  const summary=gygSummary(products);
  const supplierReady=!!s.configurationComplete;
  const partnerReady=!!p.configurationComplete;
  el.innerHTML=
  '<div class="gyg-conn-top"><div><h2>Centro de integrações GetYourGuide</h2>'+
  '<p>Dois percursos independentes: distribuição dos nossos tours e recomendações de parceiros.</p></div>'+
  '<button type="button" class="btn" onclick="renderGygIntegrationHub()">↻ Atualizar</button></div>'+
  (error?'<div class="notice">Não foi possível consultar a configuração. As ligações mantêm-se inativas.</div>':'')+
  (error?'':gygSupplierAccountCard(data?.supplierAccount))+
  '<div class="gyg-conn-grid">'+
    '<section class="card gyg-conn-card"><div class="gyg-conn-eyebrow">01 · WATERMELON COMO FORNECEDOR</div>'+
      '<h3>Supplier / Connectivity</h3>'+gygConnBadge(false,"Sem ligação externa validada")+
      '<p>O Studio prepara os programas próprios. A criação e a aprovação de cada atividade são controladas pelo Supplier Portal.</p>'+
      '<ul class="gyg-conn-checks">'+
      gygCheck(summary.total+' programas no Studio',summary.total>0)+
      gygCheck(summary.ready+' pacotes preparados',summary.ready>0)+
      gygCheck("Rotas de testes Supplier implementadas",!!s.supplierSandboxGatewayImplemented)+
      gygCheck("Ambiente sandbox ativado",!!s.sandboxEnabled)+
      gygCheck("Aprovação de integração registada",!!s.approvalRecorded)+
      gygCheck("Credenciais configuradas no servidor",!!s.credentialsConfigured)+
      gygCheck("Certificação técnica concluída",!!s.certificationRecorded)+
      '</ul><p class="gyg-conn-muted">'+(supplierReady
      ?'Configuração declarada: ainda falta validar a ligação real e os fluxos de reserva.'
      :'Ambiente técnico de testes preparado. Falta mapear opções reais, ativar credenciais sandbox, concluir Notify Availability e testes oficiais.')+
      '</p></section>'+
    '<section class="card gyg-conn-card"><div class="gyg-conn-eyebrow">02 · WATERMELON COMO PARCEIRO</div>'+
      '<h3>Partner API / Afiliados</h3>'+gygConnBadge(false,"Recomendações externas inativas")+
      '<p>A IA do site poderá recomendar experiências de terceiros apenas através de catálogo, imagens e links autorizados.</p>'+
      '<ul class="gyg-conn-checks">'+
      gygCheck("Autorização comercial registada",!!p.approvalRecorded)+
      gygCheck("Modalidade: "+(p.accessMode==="api"?"Partner API":p.accessMode==="affiliate"?"afiliado":"por definir"),p.accessMode!=="none"&&!!p.accessMode)+
      gygCheck("Identificador/chave no servidor",!!p.credentialsConfigured)+
      gygCheck("Utilização limitada a conteúdos autorizados",true)+
      '</ul><p class="gyg-conn-muted">'+(partnerReady
      ?'Configuração declarada: ainda falta testar a API/atribuição de afiliado.'
      :'Sem autorização, a IA não consulta o catálogo da GetYourGuide e não mostra preços ou disponibilidade de terceiros.')+
      '</p><a href="https://partner.getyourguide.com/" target="_blank" rel="noopener">Portal de parceiros</a></section>'+
  '</div>'+
  '<div class="gyg-conn-footer"><strong>Proteções ativas:</strong> sem scraping; sem publicação automática; sem reservas externas não autorizadas; '+
    'sem alegar disponibilidade em tempo real sem confirmação. Os estados deste painel são declarativos, não uma verificação de conectividade.</div>';
}
async function renderGygIntegrationHub(){
  const el=document.querySelector("#gygIntegrationHub");if(!el)return;
  el.innerHTML='<div class="card"><p class="hint">A verificar o estado de configuração…</p></div>';
  try{
    const res=await fetch("/api/getyourguide-readiness",{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const config=await res.json();
    if(!document.querySelector("#gygIntegrationHub"))return;
    gygRenderIntegrationHub(config,false);
  }catch(e){
    console.warn("GetYourGuide readiness unavailable",e);
    gygRenderIntegrationHub(null,true);
  }
}
window.renderGygIntegrationHub=renderGygIntegrationHub;
