import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildProductFromSource} from '../lib/product-builder.js';
import {completionRequest,normalizeCompletion} from '../lib/product-completion.js';
import {normalizeSourcePrice,sourceIdentity,productSource,publicationIssues,approveSellingPrice,approveProductReview,priceFingerprint,reviewFingerprint,evidencePrice} from '../product-integrity.js';
import {packCompletionMetadata,unpackCompletionMetadata} from '../completion-fields.js';
import productsHandler from '../api/products.js';
const url='https://www.getyourguide.com/pt-pt/lisboa-l42/costa-da-caparica-t836010/';
const quote='50 EUR per person';
const sourcePrice={amount:50,currency:'EUR',unit:'Per person',sourceUrl:url,excerpt:quote,qualifier:'advertised'};
const draft={title:'Coastal outing',summary:'Explore the coast.',description:'Explore the beaches and viewpoints.',suggestedPrice:50,currency:'EUR',priceType:'Per person',qualityScore:90,sourcePrice,assumptions:[],missingInformation:[],highlights:[],itinerary:[],included:[],excluded:[]};
const market={method:'provisional',recommendedPrice:240,priceType:'Per group',currency:'EUR',confidence:'low',pricedComparableCount:0,comparables:[],rationale:'Unverified group estimate'};
function product(){return {id:'WM-test',status:'Draft',title:'Coastal outing',shortTitle:'Coast',destination:'Caparica',duration:'5 hours',description:'Coastal outing',itinerary:'Meet\nExplore',included:'Guide',language:'Portuguese',groupType:'Shared',maxGuests:'6',capacity:'6',days:'Mon,Tue',startTimes:'10:00',cutoffHours:'12',cancellation:'Operator-confirmed conditions',meetingPoint:'Confirmed point',adultPrice:'50',childPrice:'',priceType:'Per person',currency:'EUR',optionCode:'COAST',optionTitle:'Coastal outing',gallery:[{path:'operator.jpg'}],aiAssumptions:['Capacity must be checked'],aiMissing:[],inputSource:{mode:'url',label:url,references:[]}};}

test('50 per-person source is never overwritten by 240 group market estimate, nor by another currency',async()=>{
  const realFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fake-test-only';
  try{for(const currency of ['EUR','USD']){
    const requests=[];globalThis.fetch=async(u,o)=>{assert.equal(u,'https://api.openai.com/v1/responses');const body=JSON.parse(o.body);requests.push(body);return {ok:true,json:async()=>({model:'mock',output_text:JSON.stringify(requests.length===1?draft:{...market,currency})})};};
    const result=await buildProductFromSource({mode:'url',url,pageText:'Exact public tariff: '+quote,brief:'Keep this per person; no private group conversion.'});
    assert.equal(result.product.suggestedPrice,50);assert.equal(result.product.currency,'EUR');assert.equal(result.product.priceType,'Per person');
    assert.equal(result.pricing.source.amount,50);assert.equal(result.pricing.source.unit,'Per person');
    assert.equal(result.pricing.suggestion.amount,240);assert.equal(result.pricing.suggestion.unit,'Per group');
    assert.ok(requests[0].input.includes('no private group conversion'));
    assert.ok(requests[1].input.includes(url));assert.equal(requests[1].tool_choice,'required');
    assert.ok(!requests[1].instructions.includes('Prioritise Viator first'));
  }}finally{globalThis.fetch=realFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('source observations need the exact activity and matching amount, unit and currency evidence',()=>{
  const context={reference:url,pageText:quote};
  assert.equal(normalizeSourcePrice(sourcePrice,context).status,'extracted');
  for(const patch of [{amount:240},{unit:'Per group'},{currency:'USD'},{sourceUrl:url.replace('836010','999999')},{excerpt:'50 EUR'}])assert.equal(normalizeSourcePrice({...sourcePrice,...patch},context).amount,null);
  assert.equal(normalizeSourcePrice(sourcePrice,{reference:url}).amount,null);
  assert.equal(normalizeSourcePrice(sourcePrice,{reference:url,retrieved:[{url}]}).status,'reported');
  assert.equal(evidencePrice('From €50 per person').amount,50);
  assert.equal(evidencePrice('€50 per person or €240 per group').amount,null);
});
test('an original GetYourGuide URL takes precedence over an unrelated Viator code and neutral drafts have no fake provider',()=>{
  assert.equal(productSource({...product(),viatorCode:'9963P8'}).provider,'getyourguide');
  assert.equal(productSource({title:'A new idea'}),null);
  assert.equal(sourceIdentity('https://www.getyourguide.com.evil.example/x-t836010/').provider,'website');
});
test('numeric mismatches cannot be labelled as verified source prices',()=>{
  const request=completionRequest({product:{title:'Coast',priceType:'Per person',currency:'EUR'},reference:url,fields:['adultPrice']});
  const proposals=value=>normalizeCompletion({fields:[{field:'adultPrice',value,origin:'getyourguide',sourceUrl:url,evidence:quote}]},request,[{url}]).fields[0];
  assert.equal(proposals('240').origin,'suggestion');assert.equal(proposals('240').sourceUrl,'');
  assert.equal(proposals('50').origin,'getyourguide');
  request.product.priceType='Per group';assert.equal(proposals('50').origin,'suggestion');
});
test('initial or legacy drafts need separate price and operational review; edits invalidate each approval',()=>{
  const p=product();assert.ok(publicationIssues(p).length>=2);
  approveSellingPrice(p);assert.equal(publicationIssues(p).some(x=>x.includes('preço de venda')),false);
  approveProductReview(p);assert.deepEqual(publicationIssues(p),[]);
  p.adultPrice='240';assert.ok(publicationIssues(p).some(x=>x.includes('preço de venda')));
  p.adultPrice='50';p.priceType='Per group';assert.ok(publicationIssues(p).length);
  p.priceType='Per person';p.capacity='8';assert.ok(publicationIssues(p).some(x=>x.includes('revisão')));
});
test('blank prices, invalid units and children charged on a vehicle/group cannot be approved',()=>{
  for(const patch of [{adultPrice:''},{adultPrice:'NaN'},{priceType:''},{currency:'FAKE'},{priceType:'Per group',childPrice:'99'},{priceType:'Per vehicle',childPrice:'0'}])assert.throws(()=>approveSellingPrice({...product(),...patch}));
});
test('cloud roundtrip preserves empty unknown fields, commas and approval metadata without inventing schedules',()=>{
  const p=product();p.days='';p.itinerary='Meet the guide, then start\nExplore';approveSellingPrice(p);approveProductReview(p);
  const packed=packCompletionMetadata(p);
  assert.deepEqual(packed.itinerary,['Meet the guide, then start','Explore']);
  const cloud={...packed,days:'Mon,Tue,Wed,Thu,Fri,Sat,Sun',itinerary:packed.itinerary.join('\n')};
  const restored=unpackCompletionMetadata(cloud);assert.equal(restored.days,'');assert.equal(restored.itinerary,p.itinerary);
  assert.equal(restored.inputSource.studioSafety.priceApproved,priceFingerprint(restored));
  assert.equal(restored.inputSource.studioSafety.reviewApproved,reviewFingerprint(restored));
});
test('blank manual lists also survive the legacy cloud conversion without AI metadata',()=>{
  const packed=packCompletionMetadata({title:'Manual',itinerary:'Meet, then start\nEnjoy'});
  assert.deepEqual(packed.itinerary,['Meet, then start','Enjoy']);
});
const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;},send(b){this.body=b;return this;}});
test('server rejects an unapproved Ready/Live request before any upstream write; Draft saving is unaffected',async()=>{
  const realFetch=globalThis.fetch,env={url:process.env.SUPABASE_PRODUCT_STUDIO_URL,key:process.env.PRODUCT_STUDIO_INTERNAL_KEY};
  process.env.SUPABASE_PRODUCT_STUDIO_URL='https://fake.test';process.env.PRODUCT_STUDIO_INTERNAL_KEY='fake-test-only';
  const writes=[];globalThis.fetch=async(u,o)=>{if(o.method==='POST')writes.push(JSON.parse(o.body));return {ok:true,status:200,json:async()=>({products:[]}),text:async()=>'{"revision":1}'};};
  try{
    for(const status of ['Ready','Live']){const r=response();await productsHandler({method:'POST',headers:{},body:{product:{...product(),status}}},r);assert.equal(r.statusCode,422);}
    assert.equal(writes.length,0);
    const p=product(),r=response();await productsHandler({method:'POST',headers:{},body:{product:p}},r);assert.equal(r.statusCode,200);assert.equal(writes.length,1);assert.equal(r.headers['Cache-Control'],'private, no-store');
    approveSellingPrice(p);approveProductReview(p);p.status='Ready';const approved=response();await productsHandler({method:'POST',headers:{},body:{product:p}},approved);assert.equal(approved.statusCode,200);
  }finally{globalThis.fetch=realFetch;for(const [k,v] of [['SUPABASE_PRODUCT_STUDIO_URL',env.url],['PRODUCT_STUDIO_INTERNAL_KEY',env.key]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('published approved prices are not changed by the integrity helpers',()=>{
  const p={...product(),status:'Live',adultPrice:'980',priceType:'Per group'},before=structuredClone(p);
  publicationIssues(p);priceFingerprint(p);reviewFingerprint(p);assert.deepEqual(p,before);assert.equal(p.adultPrice,'980');
});
test('the real editor never fills AI suggestedPrice into the selling field',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const body=html.slice(html.indexOf('function applyGenerated('),html.indexOf('async function runIntake('));
  const ctx={current:null,emptyProduct:()=>({}),aiLines:v=>Array.isArray(v)?v.join('\n'):(v||''),showModal(){},marketHtml(){return '';},esc:String};vm.createContext(ctx);vm.runInContext(body,ctx);
  ctx.applyGenerated({product:{...draft,suggestedPrice:240},marketResearch:market},'test');assert.equal(ctx.current.adultPrice,'');assert.equal(ctx.current.childPrice,'');
});
test('all browser scripts and inline editor script parse after migration',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const inline=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(inline));
});
