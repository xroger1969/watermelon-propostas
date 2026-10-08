const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true}
  }).outputText, filename);
const originalResolver = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolver.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};

const products = [
  {code:'GROUP-T',title:'Private boat',maxGuests:12,priceType:'Per group',currency:'EUR',
   options:[{optionCode:'PRIVATE',optionName:'Private boat',priceType:'Per group',price:980,capacity:12}]},
  {code:'PERSON-T',title:'Food tasting',maxGuests:15,priceType:'Per person',currency:'EUR',
   options:[{optionCode:'FOOD',optionName:'Tasting',priceType:'Per person',price:60,capacity:15}]}
];

test('proposal API preserves mixed group and per-person totals through Supabase handoff', async () => {
  const originalLoad = Module._load, originalFetch = global.fetch;
  const previous = process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;
  let stored;
  const mockDb = {
    from: name => {
      assert.equal(name, 'watermelon_site_promotions');
      return {select: () => ({in: async () => ({data:[],error:null})})};
    },
    rpc: async (name,args) => {
      assert.equal(name,'watermelon_create_proposal_request');
      stored=args;
      return {data:'request-test-reference',error:null};
    }
  };
  Module._load=function(name,...args){
    if(name==='@supabase/supabase-js') return {createClient:()=>mockDb};
    return originalLoad.call(this,name,...args);
  };
  process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL='https://catalogue.test/public-feed';
  global.fetch=async ()=>new Response(JSON.stringify({products}),{headers:{'content-type':'application/json'}});
  try {
    const {POST}=require('../app/api/proposal-request/route.ts');
    const input={customerName:'QA customer',customerPhone:'000000000',currency:'EUR',items:[
      {code:'GROUP-T',optionCode:'PRIVATE',title:'Misleading person-priced title',guests:12,unitPrice:980,date:'2026-10-28'},
      {code:'PERSON-T',optionCode:'FOOD',title:'Food tasting',guests:3,unitPrice:60,date:'2026-10-28'}
    ]};
    const invoke=patch=>POST(new Request('https://example.test/api/proposal-request',{
      method:'POST',body:JSON.stringify({...input,...patch})
    }));
    assert.equal((await invoke({})).status,200);
    assert.equal(stored.p_items.length,2);
    assert.equal(stored.p_items[0].pricing_mode,'group');
    assert.equal(stored.p_items[0].subtotal,980);
    assert.equal(stored.p_items[1].pricing_mode,'per_person');
    assert.equal(stored.p_items[1].subtotal,180);
    assert.equal(stored.p_estimated_total,1160);
    stored=undefined;
    assert.equal((await invoke({items:[{...input.items[0],guests:13}]})).status,400);
    assert.equal(stored,undefined);
    const invalid=(await invoke({items:[{...input.items[0],optionCode:'NOT-A-REAL-OPTION'}]}));
    assert.equal(invalid.status,409);
    assert.equal(stored,undefined);
  } finally {
    Module._load=originalLoad;
    global.fetch=originalFetch;
    if(previous===undefined) delete process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL;
    else process.env.PRODUCT_STUDIO_PUBLIC_FEED_URL=previous;
  }
});
