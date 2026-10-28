import test from 'node:test';
import assert from 'node:assert/strict';

const writes=[];let nextCalls=0;
Object.assign(globalThis,{
  current:null,currentStep:2,editingId:null,products:[],window:{},
  document:{querySelector(selector){if(selector==='#modal')return {};return null;},querySelectorAll(){return [];}},
  renderStep(){},syncForm(){},readyIssues(){return [];},nextStep(){nextCalls++;},renderWizard(){},
  closeModal(){},showModal(){},toast(){},save(){},esc:String,
  async saveCloud(product){writes.push(structuredClone(product));return {revision:1};}
});
await import('../ai-completion.js');
const output={summary:'Propostas',model:'test-model',generatedAt:'2026-10-28T12:00:00Z',sources:[],fields:[
  {field:'itinerary',value:'Meet the guide\nVisit the beach',origin:'suggestion',sourceUrl:'',note:'Rever percurso.',requiresReview:true}
]};
globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(output)});
function reset(status='Draft'){
  globalThis.current={id:'WM-test',title:'Beach day',summary:'Operator-written summary',description:'Original description',viatorCode:'9963P8',itinerary:'',status};
  globalThis.products=[];globalThis.currentStep=2;writes.length=0;
}
test('automatic completion preserves existing text, saves Draft, records review and can undo',async()=>{
  reset();await window.studioAIRequest('section',true);
  assert.equal(current.summary,'Operator-written summary');assert.equal(current.description,'Original description');
  assert.equal(current.itinerary,'Meet the guide\nVisit the beach');
  assert.equal(writes.length,1);assert.equal(writes[0].status,'Draft');
  assert.match(readyIssues(current)[0],/1 campos IA por validar/);
  await window.studioAIValidate('itinerary');assert.deepEqual(readyIssues(current),[]);
  await window.studioAIUndo();assert.equal(current.itinerary,'');assert.equal(current.summary,'Operator-written summary');
});
test('AI changes never autosave a Live or Ready product',async()=>{
  for(const status of ['Live','Ready']){
    reset(status);await window.studioAIRequest('section',true);
    assert.equal(writes.length,0);assert.equal(current.status,status);assert.equal(current.aiCompletion.unsaved,true);
  }
});
test('a cancelled/failed search preserves the original product and makes no cloud writes',async()=>{
  reset();const before=structuredClone(current),originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,json:async()=>({error:'Source unavailable'})});
  try{assert.equal(await window.studioAIRequest('section',true),false);assert.equal(current.itinerary,before.itinerary);assert.equal(writes.length,0);}
  finally{globalThis.fetch=originalFetch;}
});
test('manual edits supersede the proposal and automatic progression calls the existing wizard',async()=>{
  reset();await window.studioAIRequest('section',true);
  current.itinerary='Operator-approved route';syncForm();assert.deepEqual(readyIssues(current),[]);
  assert.equal(current.aiCompletion.fields.itinerary.origin,'operator');
  current.aiAutoComplete=false;await nextStep();assert.equal(nextCalls,1);
});
