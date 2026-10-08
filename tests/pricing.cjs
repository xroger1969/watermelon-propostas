const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const original = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return original.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
const {priceTotal, pricingModeFor} = require('../lib/product-rules.ts');
const {resolveCatalogPricing} = require('../lib/studio-pricing.ts');
const products = [{code:'9963P3', title:'Dolphin tour', maxGuests:12, price:980, currency:'EUR', priceType:'Per group', options:[{optionCode:'TG1',price:980,priceType:'Per group',capacity:12},{optionCode:'TG2',price:null,priceType:'Per group',capacity:12}]}];
test('980 euros is the whole group price, for 1 through 12 guests', () => { for(let guests=1;guests<=12;guests++) assert.equal(priceTotal(980, guests, 'group'),980); });
test('10% offer remains 882 euros for twelve guests', () => assert.equal(priceTotal(980*0.9,12,'group'),882));
test('per-person prices still multiply by guests and round cents', () => { assert.equal(priceTotal(90,12,'per_person'),1080); assert.equal(priceTotal(19.99,3,'per_person'),59.97); });
test('invalid counts and negative or non-finite prices are rejected', () => { for(const args of [[980,0,'group'],[980,1.5,'group'],[-1,12,'group'],[Infinity,12,'group']]) assert.throws(()=>priceTotal(...args)); });
test('all explicit Studio types resolve, unknown types fail closed', () => { for(const type of ['Per group','per_group','Per vehicle','fixed']) assert.equal(pricingModeFor(type),'group'); assert.equal(pricingModeFor('Per person'),'per_person'); assert.throws(()=>pricingModeFor('')); });
test('Studio data overrides title heuristics and enforces its capacity', () => { const rules=resolveCatalogPricing(products,{code:'9963P3',optionCode:'TG1',title:'Price per person'}); assert.equal(rules.pricingMode,'group'); assert.equal(rules.maxGuests,12); assert.equal(rules.price,980); });
test('an unpriced alternative never borrows the primary option price', () => { const rules=resolveCatalogPricing(products,{code:'9963P3',optionCode:'TG2'}); assert.equal(rules.price,null); assert.equal(rules.primaryOption,false); });
test('unknown options cannot be booked with the primary price', () => assert.throws(()=>resolveCatalogPricing(products,{code:'9963P3',optionCode:'MISSING'})));
test('mixed proposals retain both pricing bases', () => assert.equal(priceTotal(882,12,'group')+priceTotal(90,3,'per_person'),1152));

test('booking API uses the server catalogue and stores the group snapshot', async () => {
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  let saved;
  const db = { from: () => ({ select: () => ({eq: () => ({maybeSingle: async () => ({data:{now_price:882,before_price:980,currency:'EUR'},error:null})})}), insert: async row => { saved=row; return {error:null}; } }) };
  Module._load = function(name,...args) { return name === '@supabase/supabase-js' ? {createClient:()=>db} : originalLoad.call(this,name,...args); };
  process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  global.fetch=async()=>new Response(JSON.stringify({products}),{headers:{'content-type':'application/json'}});
  try {
    const {POST}=require('../app/api/booking-request/route.ts');
    const body={productCode:'9963P3',optionCode:'TG1',optionName:'All inclusive',experienceTitle:'Per person forged title',requestedDate:'2026-10-28',guests:12,unitPrice:882,websitePromotion:true,pricingMode:'group',customerName:'QA',customerPhone:'QA'};
    const post=patch=>POST(new Request('https://example.test/api/booking-request',{method:'POST',body:JSON.stringify({...body,...patch})}));
    assert.equal((await post({})).status,200);
    assert.equal(saved.estimated_total,882);
    assert.equal(saved.pricing_mode,'group');
    saved=undefined;
    assert.equal((await post({guests:13})).status,400);
    assert.equal((await post({unitPrice:1})).status,409);
    assert.equal((await post({pricingMode:'per_person'})).status,409);
    assert.equal(saved,undefined);
    const unpriced=await post({optionCode:'TG2',unitPrice:null,websitePromotion:false});
    assert.equal(unpriced.status,200);
    assert.equal(saved.estimated_total,null);
    saved=undefined;
    global.fetch=async()=>{throw new Error('Catalogue unavailable')};
    assert.equal((await post({})).status,503);
    assert.equal(saved,undefined);
  } finally { Module._load=originalLoad; global.fetch=originalFetch; delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL; }
});

test('AI handoff keeps Studio group pricing and the direct-site offer', async () => {
  const originalLoad=Module._load, originalFetch=global.fetch;
  let stored;
  const db={from:()=>({select:async()=>({data:[{product_code:'9963P3',now_price:882,before_price:980,currency:'EUR'}],error:null})}),rpc:async(name,args)=>{stored=args;return {data:'qa-request',error:null}}};
  Module._load=function(name,...args){
    if(name==='@supabase/supabase-js')return {createClient:()=>db};
    if(name==='@/lib/viator-live')return {getLiveViatorCatalog:async()=>[{code:'LEGACY',title:'Legacy',description:'',category:'Tours',location:'Portugal',duration:'1h',image:'',url:'',options:[]}],getLiveViatorPrices:async()=>[{code:'9963P3',price:999,currency:'EUR'}]};
    return originalLoad.call(this,name,...args);
  };
  process.env.OPENAI_API_KEY='qa-test-only'; process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  const plan={reply:'QA',question:'',intent_summary:'QA',recommendations:[{code:'9963P3',reason:'QA'}],tailor_made_ideas:[],quote_request:{requested:true,ready_to_create:true,customer_name:'QA',customer_phone:'QA',customer_email:'',requested_date:'2026-10-28',guests:12,selected_codes:['9963P3'],tailor_made_titles:[],notes:'',success_message:'QA'}};
  global.fetch=async url=>new Response(JSON.stringify(url==='https://catalogue.example.test'?{products}:{output_text:JSON.stringify(plan)}),{headers:{'content-type':'application/json'}});
  try {
    const {POST}=require('../app/api/ai-concierge/route.ts');
    const response=await POST(new Request('https://example.test/api/ai-concierge',{method:'POST',body:JSON.stringify({message:'QA request',conversationId:'pricing-qa'})}));
    assert.equal(response.status,200);
    assert.equal(stored.p_items[0].pricing_mode,'group');
    assert.equal(stored.p_items[0].subtotal,882);
    const body=await response.json();
    assert.equal(body.recommendations[0].price,882);
    assert.equal(body.recommendations[0].pricingMode,'group');
  }finally{Module._load=originalLoad;global.fetch=originalFetch;delete process.env.OPENAI_API_KEY;delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;}
});
