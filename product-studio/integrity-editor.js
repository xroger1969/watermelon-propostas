import {PRICE_FIELDS,productSource,publicationIssues,ensureSafety,safetyState,approveSellingPrice,approveProductReview,priceFingerprint,reviewFingerprint} from './product-integrity.js';

export function installIntegrityEditor(){
  const baseApply=applyGenerated,baseRender=renderStep,baseIssues=readyIssues;
  window.studioPublicationIssues=publicationIssues;
  applyGenerated=function(data,label){
    baseApply(data,label);
    const state=ensureSafety(current);state.generated=true;state.pricing=data.pricing||null;
    // AI estimates NEVER become a Watermelon selling price.
    current.adultPrice='';current.childPrice='';
    current.priceType=data.pricing?.source?.unit||current.priceType||'';
    current.currency=data.pricing?.source?.currency||current.currency||'EUR';
    current.aiSourceUrl=productSource(current)?.url||'';
  };
  readyIssues=function(p){return [...new Set([...baseIssues(p),...publicationIssues(p)])];};
  renderStep=function(){baseRender();renderIntegrity();};
  function renderIntegrity(){
    if(!current)return;
    const panel=document.querySelector('#stepPanel');if(!panel||panel.querySelector('.studio-integrity'))return;
    const s=safetyState(current),source=s.pricing?.source,suggestion=s.pricing?.suggestion;
    const fmt=p=>p?.amount>0?`${p.amount} ${p.currency||''} · ${p.unit||'unidade por confirmar'}`:'Não confirmado';
    if(currentStep===4){
      const box=document.createElement('section');box.className='studio-integrity notice';
      box.innerHTML=`<strong>Preço da fonte ≠ sugestão IA ≠ preço de venda</strong><p><b>Fonte ${esc(productSource(current)?.label||'por indicar')}:</b> ${esc(fmt(source))}${source?.qualifier==='from'?' · a partir de':''}</p><p class="hint">${esc(source?.note||'Consulta a tarifa da experiência exata. O preço não será estimado nem convertido.')}</p><div class="actions"><button class="btn" type="button" onclick="studioReadSourcePrice()">Consultar preço da fonte</button>${source?.amount>0?'<button class="btn" type="button" onclick="studioUseSourcePrice()">Usar preço da fonte</button>':''}</div>${suggestion?.amount>0?`<p><b>Sugestão IA, não aplicada:</b> ${esc(fmt(suggestion))} · confiança ${esc(suggestion.confidence)}</p>`:''}<p><b>Preço de venda Watermelon:</b> ${esc(fmt({amount:current.adultPrice,currency:current.currency,unit:current.priceType}))}</p><button class="btn green" type="button" onclick="studioApprovePrice()">${s.priceApproved===priceFingerprint(current)?'✓ Preço aprovado':'Aprovar este preço de venda'}</button><p class="hint">O valor, a moeda e a unidade são aprovados em conjunto. Alterá-los exige nova aprovação. Um preço público não é um custo de compra nem uma reserva confirmada.</p>`;
      const assistant=panel.querySelector('.ai-completion-bar');if(assistant)assistant.after(box);else panel.prepend(box);
    }
    if(currentStep===6){
      const box=document.createElement('section');box.className='studio-integrity notice';
      const notes=[...(current.aiAssumptions||[]),...(current.aiMissing||[])];
      box.innerHTML=`<h4>Validação comercial e operacional</h4><p>${s.priceApproved===priceFingerprint(current)?'✓ Preço de venda aprovado':'Falta aprovar o preço na etapa 5.'}</p>${notes.length?`<details open><summary>Questões a resolver e confirmar (${notes.length})</summary><ul>${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>`:''}<label><input type="checkbox" id="studioReviewConfirmed" ${s.reviewApproved===reviewFingerprint(current)?'checked':''}> Confirmei o conteúdo, serviços, duração, participantes, horários e condições; resolvi os pontos acima no programa.</label><p><button class="btn green" type="button" onclick="studioApproveReview()">Confirmar revisão do programa</button></p><p class="hint">Qualquer alteração posterior invalida esta revisão. Nada é publicado automaticamente.</p>`;
      panel.prepend(box);
    }
  }
  window.studioApprovePrice=async function(){
    syncForm();try{approveSellingPrice(current);}catch(e){toast(e.message);return;}
    await saveSafetyDraft();renderWizard();toast('Preço de venda aprovado. A IA não o substitui.');
  };
  window.studioApproveReview=async function(){
    if(!document.querySelector('#studioReviewConfirmed')?.checked){toast('Confirma primeiro a revisão dos dados.');return;}
    syncForm();approveProductReview(current);await saveSafetyDraft();renderWizard();toast('Revisão registada.');
  };
  async function saveSafetyDraft(){
    if(current.status!=='Draft'){ensureSafety(current).unsaved=true;return;}
    try{await saveCloud(current);const i=products.findIndex(p=>p.id===current.id);if(i<0)products.unshift(structuredClone(current));else products[i]=structuredClone(current);save();editingId=current.id;}
    catch(e){ensureSafety(current).unsaved=true;toast('Alterações no editor; guarda o rascunho para sincronizar.');}
  }
  window.studioUseSourcePrice=function(){
    syncForm();const source=safetyState(current).pricing?.source;if(!(source?.amount>0)||!source.unit)return;
    const before={adultPrice:current.adultPrice,priceType:current.priceType,currency:current.currency,childPrice:current.childPrice};
    Object.assign(current,{adultPrice:String(source.amount),priceType:source.unit,currency:source.currency,childPrice:''});
    const state=ensureSafety(current);state.priceApproved=null;state.reviewApproved=null;
    state.priceHistory=[...(state.priceHistory||[]),{at:new Date().toISOString(),before,reason:'Fonte selecionada pelo operador'}].slice(-10);
    renderWizard();toast('Preço da fonte selecionado. Aprova o preço de venda para continuar.');
  };
  let sourceBusy=false;
  window.studioReadSourcePrice=async function(){
    if(sourceBusy)return;syncForm();const src=productSource(current);
    if(!src?.url&&!src?.id){toast('Indica primeiro a ligação da experiência.');return;}
    const id=current.id,reference=src.url||src.id;sourceBusy=true;toast('A consultar a tarifa da experiência exata…');
    try{
      const response=await fetch('/api/source-price',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reference}),signal:AbortSignal.timeout(180000)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível confirmar o preço.');
      if(current?.id!==id||((productSource(current)?.url||productSource(current)?.id)!==reference))return;
      const state=ensureSafety(current);state.pricing={...(state.pricing||{}),source:data.source};
      await saveSafetyDraft();renderWizard();toast(data.source?.amount>0?'Preço encontrado. O preço de venda não foi alterado.':'Preço não confirmado; não foi inventado nenhum valor.');
    }catch(e){toast(e.message||'Não foi possível consultar a fonte.');}finally{sourceBusy=false;}
  };
  if(current&&document.querySelector('#stepPanel'))renderWizard();
}
