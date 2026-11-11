const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {return resolve.call(this, name.startsWith('@/') ? path.join(root,name.slice(2)) : name,...args);};
const {priceTotal,unitPriceForGuests,isSoloPricingProduct,inferProductRules,pricingModeFor} = require('../lib/product-rules.ts');
const {resolveCatalogPricing} = require('../lib/studio-pricing.ts');
const {directCatalogTariff} = require('../lib/catalog-tariff.ts');

test('direct catalogue price ignores diverging partner prices for the selected tours only', () => {
  for (const code of ['9963P14','9963P15','9963P16']) {
    const tariff=directCatalogTariff(code,undefined,{price:95,currency:'USD'});
    assert.equal(tariff.price,90);
    assert.equal(tariff.currency,'EUR');
    assert.equal(priceTotal(tariff.price,1,'per_person',code),180);
    assert.equal(directCatalogTariff(code,{price:92,currency:'EUR'},{price:95,currency:'USD'}).price,92);
    assert.equal(directCatalogTariff(code,{price:null,currency:'EUR'},{price:95,currency:'USD'}).price,null);
  }
  assert.equal(directCatalogTariff('9963P25',undefined,{price:155,currency:'EUR'}).price,155);
});

test('only the three selected tours apply the solo tier, preserving one actual traveller', () => {
  for (const code of ['9963P14','9963P15','9963P16','WM-9963P14']) {
    assert.equal(isSoloPricingProduct(code),true);
    assert.equal(unitPriceForGuests(90,1,'per_person',code),180);
    assert.equal(priceTotal(90,1,'per_person',code),180);
    assert.equal(priceTotal(90,2,'per_person',code),180);
    assert.equal(priceTotal(90,3,'per_person',code),270);
    assert.equal(priceTotal(81,1,'per_person',code),162);
    assert.equal(priceTotal(81,2,'per_person',code),162);
    assert.equal(priceTotal(81,3,'per_person',code),243);
  }
  assert.equal(priceTotal(90,1,'per_person','9963P25'),90);
  assert.equal(priceTotal(350,1,'group','9963P13'),350);
  assert.equal(priceTotal(350,2,'group','9963P13'),350);
  assert.equal(isSoloPricingProduct('9963P140'),false);
});

test('selected pricing overrides stale group imports without changing other Studio tariffs', () => {
  const products=[{code:'WM-9963P14',title:'South bank',price:90,priceType:'Per group',maxGuests:8,options:[{optionCode:'DEFAULT',price:90,priceType:'Per group',capacity:8}]}];
  const selected=resolveCatalogPricing(products,{code:'9963P14',optionCode:'DEFAULT',title:'per group forged text'});
  assert.equal(selected.pricingMode,'per_person');
  assert.equal(selected.price,90);
  assert.equal(selected.maxGuests,8);
  assert.equal(inferProductRules({code:'9963P14',title:'per group'}).pricingMode,'per_person');
  assert.equal(pricingModeFor('Per group','9963P14'),'per_person');
  assert.equal(pricingModeFor('Per group','9963P3'),'group');
  assert.equal(resolveCatalogPricing([],{code:'9963P14'}).price,90);
  assert.equal(resolveCatalogPricing([],{code:'9963P25'}).price,undefined);
});

let promotion = {product_code:'9963P14',now_price:81,before_price:90,currency:'EUR'};
let saved;
let rpc;
let partnerPrice=90;
const products=[{code:'9963P14',title:'South bank',price:90,currency:'EUR',priceType:'Per group',maxGuests:8,options:[{optionCode:'DEFAULT',price:90,priceType:'Per group',capacity:8}]}];
const db={from:()=>({
  select:()=>({eq:()=>({maybeSingle:async()=>({data:promotion,error:null})}),in:async()=>({data:promotion?[promotion]:[],error:null}),then:resolve=>resolve({data:promotion?[promotion]:[],error:null})}),
  insert:async(row)=>{saved=row;return {error:null};},
}),rpc:async(method,values)=>{rpc={method,values};return {data:'qa-only',error:null};}};
const originalLoad=Module._load;
Module._load=function(name,...args){
  if(name==='@supabase/supabase-js')return {createClient:()=>db};
  if(name==='@/lib/viator-live')return {getLiveViatorCatalog:async()=>[{code:'9963P14',title:'South bank',description:'',category:'Tours',location:'Portugal',duration:'3h',image:'',url:'',options:[]}],getLiveViatorPrices:async()=>[{code:'9963P14',price:partnerPrice,currency:'EUR'}]};
  return originalLoad.call(this,name,...args);
};
const booking=require('../app/api/booking-request/route.ts');
const proposal=require('../app/api/proposal-request/route.ts');
const ai=require('../app/api/ai-concierge/route.ts');
const bookingBody={productCode:'9963P14',optionCode:'DEFAULT',experienceTitle:'South bank',requestedDate:'2026-12-01',guests:1,unitPrice:162,websitePromotion:true,pricingMode:'per_person',customerName:'QA',customerPhone:'QA'};
const postBooking=patch=>booking.POST(new Request('https://example.test/api/booking-request',{method:'POST',body:JSON.stringify({...bookingBody,...patch})}));

test('booking API verifies current promotions, stores actual participants and rejects forged solo prices', async () => {
  const oldFetch=global.fetch;
  process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  global.fetch=async()=>new Response(JSON.stringify({products}),{headers:{'content-type':'application/json'}});
  try {
    for(const [guests,unitPrice,total] of [[1,162,162],[2,81,162],[3,81,243]]) {
      assert.equal((await postBooking({guests,unitPrice})).status,200);
      assert.equal(saved.guests,guests);
      assert.equal(saved.unit_price,unitPrice);
      assert.equal(saved.estimated_total,total);
      assert.equal(saved.pricing_mode,'per_person');
      assert.equal(saved.site_before_price,guests===1?180:90);
    }
    saved=undefined;
    assert.equal((await postBooking({unitPrice:81})).status,409);
    assert.equal((await postBooking({unitPrice:1})).status,409);
    assert.equal((await postBooking({pricingMode:'group'})).status,409);
    assert.equal((await postBooking({guests:1.5})).status,400);
    assert.equal(saved,undefined);
    promotion=null;
    global.fetch=async()=>new Response(JSON.stringify({products:[]}),{headers:{'content-type':'application/json'}});
    assert.equal((await postBooking({unitPrice:180,websitePromotion:false})).status,200);
    assert.equal(saved.estimated_total,180);
    saved=undefined;
    assert.equal((await postBooking({unitPrice:2,websitePromotion:false})).status,409);
    assert.equal(saved,undefined);
  }finally{global.fetch=oldFetch;delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;promotion={product_code:'9963P14',now_price:81,before_price:90,currency:'EUR'};}
});

test('proposal API stores the solo unit tier and rejects a client attempting to bypass it',async()=>{
  const oldFetch=global.fetch;
  process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  global.fetch=async()=>new Response(JSON.stringify({products}),{headers:{'content-type':'application/json'}});
  const send=(guests,unitPrice)=>proposal.POST(new Request('https://example.test/api/proposal-request',{method:'POST',body:JSON.stringify({customerName:'QA',customerPhone:'QA',items:[{code:'9963P14',title:'South bank',optionCode:'DEFAULT',guests,unitPrice}]})}));
  try {
    for(const [guests,unitPrice,total] of [[1,162,162],[2,81,162],[3,81,243]]) {
      assert.equal((await send(guests,unitPrice)).status,200);
      assert.equal(rpc.values.p_items[0].guests,guests);
      assert.equal(rpc.values.p_items[0].unit_price,unitPrice);
      assert.equal(rpc.values.p_items[0].subtotal,total);
    }
    rpc=undefined;
    assert.equal((await send(1,81)).status,409);
    assert.equal((await send(1,1)).status,409);
    assert.equal(rpc,undefined);
  }finally{global.fetch=oldFetch;delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;}
});

test('AI handoff explains and stores solo pricing with one real participant',async()=>{
  const oldFetch=global.fetch;
  process.env.OPENAI_API_KEY='qa-only';process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  const plan={reply:'Your solo price is €162.',question:'',intent_summary:'South bank for one',recommendations:[{code:'9963P14',reason:'QA'}],tailor_made_ideas:[],quote_request:{requested:true,ready_to_create:true,customer_name:'QA',customer_phone:'QA',customer_email:'',requested_date:'2026-12-01',guests:1,selected_codes:['9963P14'],tailor_made_titles:[],notes:'',success_message:'QA'}};
  global.fetch=async(url,options)=>{
    if(url==='https://catalogue.example.test')return new Response(JSON.stringify({products}),{headers:{'content-type':'application/json'}});
    const req=JSON.parse(options.body);
    assert.match(JSON.stringify(req),/soloPrice/);
    return new Response(JSON.stringify({model:req.model,status:'completed',output_text:JSON.stringify(plan)}),{headers:{'content-type':'application/json'}});
  };
  try {
    const response=await ai.POST(new Request('https://example.test/api/ai-concierge',{method:'POST',body:JSON.stringify({message:'Book the South bank tour for one person.',conversationId:'qa-solo'})}));
    assert.equal(response.status,200);
    assert.equal(rpc.values.p_items[0].guests,1);
    assert.equal(rpc.values.p_items[0].unit_price,162);
    assert.equal(rpc.values.p_items[0].subtotal,162);
    assert.equal((await response.json()).recommendations[0].soloPrice,162);
  }finally{global.fetch=oldFetch;delete process.env.OPENAI_API_KEY;delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;}
});

test('without a promotion the catalogue, booking API and AI keep €180 solo when Viator changes to €95',async()=>{
  const oldFetch=global.fetch;
  process.env.OPENAI_API_KEY='qa-only';process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.example.test';
  promotion=null;partnerPrice=95;
  const plan={reply:'Your solo price is €180.',question:'',intent_summary:'South bank for one',recommendations:[{code:'9963P14',reason:'QA'}],tailor_made_ideas:[],quote_request:{requested:true,ready_to_create:true,customer_name:'QA',customer_phone:'QA',customer_email:'',requested_date:'2026-12-01',guests:1,selected_codes:['9963P14'],tailor_made_titles:[],notes:'',success_message:'QA'}};
  global.fetch=async(url,options)=>{
    if(url==='https://catalogue.example.test')return new Response(JSON.stringify({products:[]}),{headers:{'content-type':'application/json'}});
    const req=JSON.parse(options.body);
    return new Response(JSON.stringify({model:req.model,status:'completed',output_text:JSON.stringify(plan)}),{headers:{'content-type':'application/json'}});
  };
  try {
    const displayedBase=directCatalogTariff('9963P14',undefined,{price:partnerPrice,currency:'EUR'}).price;
    assert.equal((await postBooking({unitPrice:unitPriceForGuests(displayedBase,1,'per_person','9963P14'),websitePromotion:false})).status,200);
    assert.equal(saved.unit_price,180);
    assert.equal(saved.estimated_total,180);
    const response=await ai.POST(new Request('https://example.test/api/ai-concierge',{method:'POST',body:JSON.stringify({message:'Book the South bank tour for one person.',conversationId:'qa-solo-no-promotion'})}));
    assert.equal(response.status,200);
    assert.equal(rpc.values.p_items[0].unit_price,180);
    assert.equal(rpc.values.p_items[0].subtotal,180);
    const recommendation=(await response.json()).recommendations[0];
    assert.equal(recommendation.price,displayedBase);
    assert.equal(recommendation.soloPrice,180);
    assert.equal(recommendation.livePrice,false);
  }finally{global.fetch=oldFetch;partnerPrice=90;promotion={product_code:'9963P14',now_price:81,before_price:90,currency:'EUR'};delete process.env.OPENAI_API_KEY;delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;}
});
