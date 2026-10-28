import {COMPLETION_FIELDS,normalizeCompletionValue,pendingCompletionFields} from './completion-fields.js';

let completionBusy=false,completionController=null,pendingCompletion=null,completionSequence=0;
const baseRenderStep=renderStep,baseSyncForm=syncForm,baseReadyIssues=readyIssues,baseNextStep=nextStep;

function sourceLink(url,label='Ver fonte'){
  try{if(new URL(url).protocol==='https:')return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;}catch{}
  return '';
}
function sourceReference(p){
  return p.aiSourceUrl||p.viatorCode||(p.inputSource?.references||[]).find(s=>s.type==='viator')?.url||'';
}
function completionState(){
  if(!current.aiCompletion)current.aiCompletion={version:1,fields:{},history:[]};
  return current.aiCompletion;
}
function recordManualEdits(){
  if(!current?.aiCompletion)return;
  for(const [field,meta] of Object.entries(current.aiCompletion.fields||{})){
    if(String(current[field]??'')!==meta.value){
      meta.reviewed=true;meta.reviewedAt=new Date().toISOString();meta.origin='operator';
      meta.value=String(current[field]??'');
    }
  }
}
syncForm=function(){baseSyncForm();recordManualEdits();};
readyIssues=function(product){
  const issues=baseReadyIssues(product),pending=pendingCompletionFields(product);
  if(pending.length)issues.push(`${pending.length} campos IA por validar`);
  return issues;
};
renderStep=function(){baseRenderStep();renderCompletionUI();};

function renderCompletionUI(){
  if(!current||currentStep===0)return;
  const panel=document.querySelector('#stepPanel');
  if(!panel||panel.querySelector('.ai-completion-bar'))return;
  const pending=pendingCompletionFields(current);
  panel.insertAdjacentHTML('afterbegin',`<section class="ai-completion-bar" aria-label="Assistente de preenchimento">
    <div class="ai-completion-title"><div><strong>✦ Assistente IA</strong><p>Primeiro a Viator. Quando faltarem dados, propostas para rever.</p></div><span class="ai-level">${current.aiAutoComplete?'Automático em rascunho':'Assistido'}</span></div>
    <label class="ai-source-label" for="aiSourceUrl">Ligação ou código Viator</label>
    <input id="aiSourceUrl" name="aiSourceUrl" value="${esc(sourceReference(current))}" placeholder="https://www.viator.com/… ou 9963P8" autocomplete="off">
    <div class="ai-completion-options"><label><input type="checkbox" id="aiOnlyMissing" checked> Apenas campos vazios</label>
    <label><input type="checkbox" id="aiAutoStep" ${current.aiAutoComplete?'checked':''} onchange="studioAISetAuto(this.checked)"> Completar campos vazios ao continuar</label></div>
    <div class="ai-completion-actions"><button class="btn green" type="button" onclick="studioAIRequest('section')">✦ Preencher ${currentStep===6?'campos em falta':'esta secção'}</button>
    <button class="btn" type="button" onclick="studioAIRequest('all')">Preencher programa completo</button>
    ${current.aiCompletion?.history?.length?'<button class="ai-text-button" type="button" onclick="studioAIUndo()">Desfazer último preenchimento</button>':''}</div>
    <div class="ai-completion-legend"><span class="ai-tag viator">Fonte Viator</span><span class="ai-tag suggestion">Sugestão IA</span><span class="hint">As sugestões ficam sujeitas a validação antes de Ready.</span></div>
    ${pending.length?`<div class="ai-pending" role="status">${pending.length} campos por validar. <button type="button" class="ai-text-button" onclick="studioAIReview()">Rever preenchimento</button></div>`:''}
    ${current.aiCompletion?.unsaved?'<p class="ai-pending">Alterações no editor. Guarda como rascunho para as sincronizar.</p>':''}
    ${current.aiCompletion?.missing?.length?`<details class="ai-history"><summary>Informação ainda por confirmar (${current.aiCompletion.missing.length})</summary><ul>${current.aiCompletion.missing.map(p=>`<li><b>${esc(COMPLETION_FIELDS[p.field]?.label||p.field)}</b>: ${esc(p.note)}</li>`).join('')}</ul></details>`:''}
    ${completionHistoryHtml(current)}
  </section>`);
  for(const input of panel.querySelectorAll('[name]')){
    const name=input.name,definition=COMPLETION_FIELDS[name];
    if(!definition)continue;
    const container=input.closest('.field');if(!container)continue;
    const label=container.querySelector('label');
    if(!input.id)input.id='studio-field-'+name;
    if(label)label.htmlFor=input.id;
    const button=document.createElement('button');button.type='button';button.className='ai-field-button';
    button.textContent='✦ Preencher com IA';button.setAttribute('aria-label','Preencher '+definition.label+' com IA');
    button.onclick=()=>requestCompletion(name);
    if(label){const row=document.createElement('div');row.className='ai-field-heading';label.before(row);row.append(label,button);}
    const meta=current.aiCompletion?.fields?.[name];
    if(meta){
      const info=document.createElement('div');info.className='ai-field-info';
      const origin=meta.origin==='viator'?'Fonte Viator':meta.origin==='operator'?'Editado por ti':'Sugestão IA';
      info.innerHTML=`<span class="ai-tag ${esc(meta.origin)}">${origin}${meta.reviewed?' · validado':''}</span> ${sourceLink(meta.sourceUrl)}
        ${meta.requiresReview&&!meta.reviewed?`<button class="ai-text-button" type="button" onclick="studioAIValidate('${name}')">Validar</button>`:''}
        ${meta.note?`<span class="ai-field-note">${esc(meta.note)}</span>`:''}`;
      input.after(info);
    }
  }
}
function completionHistoryHtml(product){
  const history=product.aiCompletion?.history||[];
  if(!history.length)return '';
  return `<details class="ai-history"><summary>Histórico de preenchimento (${history.length})</summary><ul>${history.slice().reverse().map(h=>
    `<li>${esc(new Date(h.at).toLocaleString('pt-PT'))} · ${h.fields.length} campos · ${h.sourced} da Viator, ${h.suggested} sugestões</li>`).join('')}</ul></details>`;
}
function studioAISetAuto(enabled){
  syncForm();current.aiAutoComplete=enabled;
  if(enabled)toast('Ao continuar, a IA preenche os campos vazios no rascunho. Validas as sugestões em Revisão.');
  renderWizard();
}
async function fetchCompletion(fields,snapshot){
  completionController=new AbortController();
  const timer=setTimeout(()=>completionController?.abort(),225000);
  try{
    const product={};
    for(const field of [...Object.keys(COMPLETION_FIELDS),'viatorCode'])product[field]=snapshot[field];
    const response=await fetch('/api/complete',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({product,fields,reference:sourceReference(snapshot)}),signal:completionController.signal});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Não foi possível preencher os campos.');
    if(!Array.isArray(result.fields))throw new Error('A resposta IA não contém campos utilizáveis.');
    return result;
  }finally{clearTimeout(timer);completionController=null;}
}
async function requestCompletion(scope,automatic=false){
  if(completionBusy)return false;
  syncForm();
  let fields=COMPLETION_FIELDS[scope]?[scope]:Object.keys(COMPLETION_FIELDS).filter(field=>
    scope==='all'||currentStep===6||COMPLETION_FIELDS[field].step===currentStep);
  const onlyMissing=automatic||(!COMPLETION_FIELDS[scope]&&document.querySelector('#aiOnlyMissing')?.checked!==false);
  if(onlyMissing)fields=fields.filter(field=>!String(current[field]??'').trim());
  if(!fields.length){if(!automatic)toast('Esta seleção já está preenchida. Usa o botão de um campo para o melhorar.');return true;}
  if(!current.title&&!sourceReference(current)){toast('Indica primeiro o título ou a referência Viator.');return false;}
  const snapshot=JSON.parse(JSON.stringify(current)),sequence=++completionSequence;
  completionBusy=true;pendingCompletion=null;
  const modal=document.querySelector('#modal');modal.className='modal';
  modal.innerHTML=`<div class="box ai-completion-modal" role="dialog" aria-modal="true" aria-label="Pesquisa IA em curso"><h3>✦ A consultar a Viator…</h3><p>A procurar a experiência exata e a preparar ${fields.length} campos. As informações em falta serão identificadas como sugestões.</p><p class="hint" role="status">A pesquisa pode demorar alguns minutos.</p><div class="modal-actions"><button class="btn" type="button" onclick="studioAICancel()">Cancelar</button></div></div>`;
  try{
    const result=await fetchCompletion(fields,snapshot);
    if(sequence!==completionSequence||current?.id!==snapshot.id)return false;
    pendingCompletion={result,snapshot,fields,onlyMissing};
    if(automatic){await applyCompletion(result.fields.filter(p=>p.value).map(p=>p.field));return true;}
    renderCompletionPreview();return true;
  }catch(error){
    if(sequence!==completionSequence)return false;
    showModal(`<h3>Preenchimento não concluído</h3><p>${esc(error.name==='AbortError'?'A pesquisa foi interrompida.':error.message)}</p><p>Os campos que já tinhas foram mantidos.</p>`,[{label:'Voltar ao programa',action:'closeModal()'}]);
    return false;
  }finally{if(sequence===completionSequence)completionBusy=false;}
}
function renderCompletionPreview(){
  const pending=pendingCompletion;if(!pending)return;
  const {result}=pending;
  const available=result.fields.filter(p=>p.value);
  const cards=result.fields.map(p=>{
    const definition=COMPLETION_FIELDS[p.field];if(!definition)return '';
    const existing=String(pending.snapshot[p.field]??'');
    return `<article class="ai-proposal"><div class="ai-proposal-heading"><label>${p.value?`<input type="checkbox" data-ai-choice="${esc(p.field)}" checked>`:''}<strong>${esc(definition.label)}</strong></label><span class="ai-tag ${esc(p.origin)}">${p.origin==='viator'?'Fonte Viator':p.origin==='missing'?'Por confirmar':'Sugestão IA'}</span></div>
      ${existing&&p.value?`<details><summary>Valor atual</summary><p class="ai-value">${esc(existing)}</p></details>`:''}
      <p class="ai-value">${esc(p.value||'Sem informação suficiente para preencher.')}</p>
      ${p.note?`<p class="hint">${esc(p.note)}</p>`:''}${sourceLink(p.sourceUrl)}
      ${p.requiresReview?'<p class="ai-review-note">Requer validação antes de Ready.</p>':''}</article>`;
  }).join('');
  showModal(`<div class="ai-completion-preview"><h3>Rever preenchimento IA</h3><p>${esc(result.summary||'Seleciona os campos que queres aplicar ao programa.')}</p><div class="ai-proposals">${cards}</div><p class="hint">${available.length} campos disponíveis. A informação não encontrada continua assinalada para confirmação.</p></div>`,
    [{label:'Cancelar',action:'studioAIDiscard()'},...(available.length?[{label:'Aplicar campos selecionados',action:'studioAIApplySelected()'}]:[])]);
  document.querySelector('#modal .box')?.classList.add('ai-completion-modal');
}
async function persistCompletion(){
  current.updatedAt=new Date().toISOString();
  // Draft autosave only. A Live/Ready record is never demoted by this assistant.
  if(current.status!=='Draft'){
    completionState().unsaved=true;return false;
  }
  const product=JSON.parse(JSON.stringify(current));
  const index=products.findIndex(p=>p.id===product.id);
  if(index>=0)products[index]=product;else products.unshift(product);
  editingId=current.id;
  try{save();}catch{toast('O armazenamento deste dispositivo está cheio. Guarda o rascunho na cloud.');}
  try{await saveCloud(product);completionState().unsaved=false;return true;}
  catch{completionState().unsaved=true;return false;}
}
async function applyCompletion(selected){
  const pending=pendingCompletion;if(!pending||current?.id!==pending.snapshot.id)return;
  syncForm();
  const state=completionState(),previous={},applied=[];
  for(const proposal of pending.result.fields){
    if(!selected.includes(proposal.field)||!COMPLETION_FIELDS[proposal.field])continue;
    const value=normalizeCompletionValue(proposal.field,proposal.value);
    if(!value)continue;
    // Protect edits made since the request and retain existing values in automatic mode.
    const before=String(current[proposal.field]??'');
    if(before!==String(pending.snapshot[proposal.field]??'')||(pending.onlyMissing&&before.trim()))continue;
    previous[proposal.field]={value:before,meta:state.fields[proposal.field]||null};
    current[proposal.field]=value;
    state.fields[proposal.field]={...proposal,value,generatedAt:pending.result.generatedAt,
      reviewed:false,model:pending.result.model||''};
    applied.push(proposal);
  }
  if(applied.length){
    state.history=[...(state.history||[]),{at:new Date().toISOString(),fields:applied.map(p=>p.field),
      sourced:applied.filter(p=>p.origin==='viator').length,suggested:applied.filter(p=>p.origin==='suggestion').length,previous}].slice(-5);
    state.lastSummary=pending.result.summary;state.sources=pending.result.sources;
    state.missing=pending.result.fields.filter(p=>!p.value).map(p=>({field:p.field,note:p.note}));
  }
  pendingCompletion=null;closeModal();
  const saved=applied.length?await persistCompletion():false;
  renderWizard();
  toast(applied.length?`${applied.length} campos preenchidos${saved?' · rascunho guardado':'. Guarda o rascunho para sincronizar'}`:'Nenhum campo foi alterado.');
}
async function studioAIApplySelected(){
  if(completionBusy)return;
  const selected=[...document.querySelectorAll('[data-ai-choice]:checked')].map(input=>input.dataset.aiChoice);
  if(!selected.length){toast('Seleciona pelo menos um campo.');return;}
  completionBusy=true;
  try{await applyCompletion(selected);}finally{completionBusy=false;}
}
async function studioAIValidate(field){
  syncForm();const meta=current.aiCompletion?.fields?.[field];if(!meta)return;
  meta.reviewed=true;meta.reviewedAt=new Date().toISOString();
  await persistCompletion();renderWizard();
}
function studioAIReview(){
  syncForm();const fields=pendingCompletionFields(current);
  showModal(`<h3>Validar preenchimento</h3><p>Confirma os seguintes dados antes de os usar no programa:</p><div class="ai-proposals">${fields.map(field=>`<article class="ai-proposal"><strong>${esc(COMPLETION_FIELDS[field].label)}</strong><p class="ai-value">${esc(current[field])}</p><p class="hint">${esc(current.aiCompletion.fields[field].note||'')}</p>${sourceLink(current.aiCompletion.fields[field].sourceUrl)}</article>`).join('')}</div>`,
    [{label:'Continuar a editar',action:'closeModal()'},{label:'Validar estes campos',action:'studioAIValidateAll()'}]);
  document.querySelector('#modal .box')?.classList.add('ai-completion-modal');
}
async function studioAIValidateAll(){
  syncForm();for(const field of pendingCompletionFields(current)){
    const meta=current.aiCompletion.fields[field];meta.reviewed=true;meta.reviewedAt=new Date().toISOString();
  }
  closeModal();await persistCompletion();renderWizard();toast('Campos validados.');
}
async function studioAIUndo(){
  syncForm();const state=completionState(),last=state.history?.pop();if(!last)return;
  for(const [field,previous] of Object.entries(last.previous||{})){
    current[field]=previous.value;
    if(previous.meta)state.fields[field]=previous.meta;else delete state.fields[field];
  }
  await persistCompletion();renderWizard();toast('Último preenchimento desfeito.');
}
function studioAICancel(){completionSequence++;completionController?.abort();completionBusy=false;pendingCompletion=null;closeModal();}
function studioAIDiscard(){pendingCompletion=null;closeModal();}
nextStep=async function(){
  if(completionBusy)return;
  if(current?.aiAutoComplete&&currentStep>=1&&currentStep<=5){
    const completed=await requestCompletion('section',true);
    if(!completed)return;
  }
  baseNextStep();
};
Object.assign(window,{studioAIRequest:requestCompletion,studioAISetAuto,studioAIApplySelected,studioAIValidate,
  studioAIValidateAll,studioAIReview,studioAIUndo,studioAICancel,studioAIDiscard});
if(current&&document.querySelector('#stepPanel'))renderWizard();
