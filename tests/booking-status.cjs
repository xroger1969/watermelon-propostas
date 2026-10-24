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
let reply = { data: null, error: null };
Module._load = function(name, ...args) {
  if (name === '@supabase/supabase-js') return { createClient: () => ({ rpc: async (method, values) => { calls.push({ method, values }); return reply; } }) };
  return load.call(this, name, ...args);
};
const { GET } = require('../app/api/booking-status/route.ts');
const token = 'b3b6d5c1-bae7-4e2a-9893-f11a531c85c7';
const get = (reference = 'WM-QA-ONLY', authorization = 'Bearer ' + token) => GET(new Request('https://example.test/api/booking-status?reference=' + encodeURIComponent(reference), { headers: { authorization } }));

test('booking status requires both a valid reference and an unguessable capability', async () => {
  calls.length = 0;
  for (const [reference, auth] of [['WM-QA-ONLY', ''], ['WM-QA-ONLY', 'Bearer x'], ['../private', 'Bearer '+token], ['', 'Bearer '+token]]) {
    assert.equal((await get(reference, auth)).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('wrong or missing capability never falls back to reference-only lookup', async () => {
  calls.length = 0; reply = { data: null, error: null };
  const response = await get();
  assert.equal(response.status, 404);
  assert.deepEqual(calls[0], { method:'watermelon_customer_booking_status', values:{p_reference:'WM-QA-ONLY',p_access_token:token} });
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('a backend failure cannot become a successful status or payable booking', async () => {
  reply = { data: null, error: {message:'internal detail must not leak'} };
  const response = await get();
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('internal detail'),false);
});
test('returns the authenticated CRM state with no-store and no-referrer', async () => {
  reply = { data: {reference:'WM-QA-ONLY',status:'pending',payment_status:'not_requested',payment_url:null}, error:null };
  const response = await get();
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).booking,reply.data);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(response.headers.get('cache-control'),/no-store/);
});
test('SQL exposes only minimal fields and gates payment on approval, amount and a payment request', () => {
  const sql = fs.readFileSync(path.join(root,'database/customer-booking-status.sql'),'utf8');
  assert.match(sql,/security definer set search_path = ''/);
  assert.match(sql,/security invoker set search_path = ''/);
  assert.match(sql,/b\.customer_access_token = p_access_token/);
  assert.match(sql,/b\.reference = p_reference/);
  assert.match(sql,/b\.status in \('approved','confirmed'\)/);
  assert.match(sql,/b\.payment_status = 'awaiting'/);
  assert.match(sql,/b\.payment_requested_at is not null/);
  assert.match(sql,/b\.estimated_total > 0/);
  for (const name of ['customer_name','customer_email','customer_phone','admin_notes']) assert.equal(sql.includes("'"+name+"'"),false);
});
