const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
const load = Module._load;
const calls = [];
let failure = false;
Module._load = function(name, ...args) {
  if (name === '@supabase/supabase-js') return { createClient: () => ({ rpc: async (method, values) => {
    calls.push({method, values});
    return failure ? {data:null,error:{message:'mock failure'}} : {data:'mock-inquiry',error:null};
  } }) };
  return load.call(this, name, ...args);
};
const { POST } = require('../app/api/ai-tailor-request/route.ts');
let client = 0;
const input = {requestKind:'information',productCode:'9963P14',experienceTitle:'South of Lisbon',
  customerName:'QA',customerPhone:'000000000',customerEmail:'qa@example.test',notes:'Is pickup included?',
  guests:2,requestedDate:'',conversationId:'qa-information-12345',consent:true};
const send = patch => POST(new Request('https://example.test/api/ai-tailor-request', {
  method:'POST', headers:{'x-forwarded-for':`192.0.2.${++client}`}, body:JSON.stringify({...input,...patch})
}));
test('information request preserves the experience, question and contacts with no price or reservation', async () => {
  calls.length = 0;
  const response = await send({});
  assert.equal(response.status,200);
  const {method,values} = calls[0];
  assert.equal(method,'watermelon_create_ai_proposal_request');
  assert.equal(values.p_customer_email,'qa@example.test');
  assert.equal(values.p_customer_phone,'000000000');
  assert.equal(values.p_items[0].product_code,'9963P14');
  assert.equal(values.p_items[0].experience_title,'South of Lisbon');
  assert.equal(values.p_items[0].requested_date,null);
  assert.equal(values.p_items[0].unit_price,null);
  assert.equal(values.p_estimated_total,0);
  assert.match(values.p_customer_notes,/Information request/);
  assert.match(values.p_customer_notes,/Is pickup included/);
  assert.match(values.p_items[0].option_name,/no reservation/);
});
test('incomplete information requests cannot create CRM records', async () => {
  calls.length = 0;
  for (const patch of [{consent:false},{notes:''},{productCode:''},{experienceTitle:''},{customerPhone:''},{customerEmail:'invalid'}]) {
    assert.equal((await send(patch)).status,400);
  }
  assert.equal(calls.length,0);
});
test('failed CRM write does not return a successful information receipt', async () => {
  failure = true;
  try { assert.equal((await send({})).status,502); }
  finally { failure = false; }
});
test('existing tailor-made requests remain compatible', async () => {
  calls.length = 0;
  assert.equal((await send({requestKind:undefined,productCode:undefined,experienceTitle:undefined})).status,200);
  assert.equal(calls[0].values.p_items[0].product_code,null);
  assert.match(calls[0].values.p_customer_notes,/tailor-made enquiry/);
});
