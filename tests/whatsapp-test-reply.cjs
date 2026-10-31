const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/watermelon-whatsapp-test-reply/index.ts'), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
});
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const INBOUND_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_ID = '96563773-6000-8000-a000-000000000001';
const PHONE_ID = '1423415737522090';
const RECIPIENT = '351900000001';
const REPLY = 'Teste Watermelon recebido. A ligação de resposta do CRM está a funcionar.';
const clone = value => structuredClone(value);

function runtime(options = {}) {
  const tables = {
    watermelon_messages: [{ id: INBOUND_ID, request_id: 'request-test', contact_id: 'contact-test', phone_number_id: PHONE_ID,
      direction: 'inbound', channel: 'whatsapp', text_body: 'TESTE WATERMELON 965', message_type: 'text', status: 'received',
      source: 'cloud_api', is_private: false, from_phone: RECIPIENT, to_phone: '351965637736', wa_id: RECIPIENT,
      whatsapp_timestamp: new Date(Date.now() - 60000).toISOString(), created_at: new Date().toISOString(), whatsapp_message_id: 'wamid.synthetic-inbound' }],
    watermelon_contacts: [{ id: 'contact-test', phone_digits: RECIPIENT, is_private: false }],
    watermelon_requests: [{ id: 'request-test', contact_id: 'contact-test', is_private: false }],
  };
  options.mutate?.(tables);
  const config = { business_phone: '+351965637736', phone_number_id: PHONE_ID, waba_id: '4408982439363483', access_token: 'synthetic-server-secret', ...options.config };
  const reads = [], writes = [], graphCalls = [], rpcs = [];
  function from(table) {
    const ops = [];
    let task;
    const run = () => task ||= Promise.resolve().then(() => {
      const mutation = ops.find(([name]) => ['insert', 'update'].includes(name));
      const matching = row => ops.filter(([name]) => name === 'eq').every(([, key, value]) => row[key] === value);
      if (options.queryError?.(table, ops)) return { data: null, error: { code: 'SYNTHETIC_QUERY_ERROR' } };
      let data;
      if (mutation) {
        const [op, input] = mutation;
        if (op === 'insert') {
          if ((tables[table] || []).some(row => row.id === input.id)) return { data: null, error: { code: '23505' } };
          tables[table].push(clone(input)); data = [clone(input)];
        } else {
          if (options.failAcceptedSave && input.status === 'sent') return { data: null, error: { code: 'SYNTHETIC_SAVE_FAILURE' } };
          data = (tables[table] || []).filter(matching);
          data.forEach(row => Object.assign(row, clone(input)));
        }
        writes.push({ table, op, input: clone(input) });
      } else {
        reads.push({ table, ops: clone(ops) });
        data = (tables[table] || []).filter(matching).map(clone);
      }
      return { data: ops.some(([name]) => name === 'maybeSingle') ? data[0] || null : data, error: null };
    });
    const query = { then(resolve, reject) { return run().then(resolve, reject); } };
    for (const method of ['select', 'eq', 'insert', 'update']) query[method] = (...args) => { ops.push([method, ...args]); return query; };
    query.maybeSingle = () => { ops.push(['maybeSingle']); return run(); };
    return query;
  }
  let handler;
  vm.runInNewContext(compiled.outputText, {
    Deno: { env: { get(name) { return 'synthetic-' + name; } }, serve(fn) { handler = fn; } },
    createClient: () => ({ from, async rpc(name) {
      rpcs.push(name);
      if (name === 'watermelon_whatsapp_admin_status') return { data: {}, error: options.adminDenied ? { message: 'denied' } : null };
      if (name === 'watermelon_whatsapp_server_config') return { data: options.missingConfig ? null : config, error: options.configError ? {} : null };
      throw new Error('Unexpected RPC');
    } }),
    Request, Response, URL, Date, Set,
    fetch: async (url, init) => {
      const row = tables.watermelon_messages.find(row => row.id === CLAIM_ID);
      assert.ok(row, 'Durable claim must exist before Graph is called');
      assert.equal(row.status, 'failed', 'No sent status may be claimed before Meta accepts');
      assert.equal(row.raw_payload.controlled_test_state, 'pending');
      graphCalls.push({ url, init: clone(init), body: JSON.parse(init.body) });
      if (options.timeout) throw new Error('Synthetic uncertain timeout');
      if (options.graphReject) return Response.json({ error: { message: 'Synthetic rejection' } }, { status: 400 });
      if (options.missingWamid) return Response.json({ messages: [] });
      return Response.json({ messages: [{ id: 'wamid.synthetic-test-response' }] });
    },
  });
  async function post(body = { operation: 'send_single_test_reply', inbound_test_message_id: INBOUND_ID }, requestOptions = {}) {
    const headers = { authorization: 'Bearer synthetic-admin', origin: 'https://www.watermelonexperiences.pt', ...requestOptions.headers };
    if (requestOptions.noAuth) delete headers.authorization;
    return handler(new Request('https://synthetic.invalid/test-reply', { method: 'POST', headers, body: JSON.stringify(body) }));
  }
  return { tables, reads, writes, graphCalls, rpcs, post, handler };
}

test('single controlled reply sends only fixed server text to the validated inbound recipient', async () => {
  const r = runtime();
  const response = await r.post();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accepted, true); assert.equal(body.delivered, false);
  assert.equal(r.graphCalls.length, 1);
  assert.equal(r.graphCalls[0].url, 'https://graph.facebook.com/v25.0/' + PHONE_ID + '/messages');
  assert.deepEqual(r.graphCalls[0].body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: RECIPIENT, type: 'text', text: { preview_url: false, body: REPLY } });
  const row = r.tables.watermelon_messages.find(row => row.id === CLAIM_ID);
  assert.equal(row.source, 'crm_cloud_api_controlled_test');
  assert.equal(row.phone_number_id, PHONE_ID);
  assert.equal(row.status, 'sent');
  assert.equal(row.whatsapp_message_id, 'wamid.synthetic-test-response');
  assert.equal(row.raw_payload.controlled_test_state, 'accepted');
  assert.ok(!JSON.stringify(body).includes('synthetic-server-secret'));
});

test('duplicate and concurrent requests cannot submit two Graph messages', async () => {
  for (const concurrent of [false, true]) {
    const r = runtime();
    const responses = concurrent ? await Promise.all([r.post(), r.post()]) : [await r.post(), await r.post()];
    assert.deepEqual(responses.map(x => x.status).sort(), [200, 409]);
    assert.equal(r.graphCalls.length, 1);
    assert.equal(r.tables.watermelon_messages.filter(row => row.id === CLAIM_ID).length, 1);
    assert.equal((await r.post()).status, 409);
    assert.equal(r.graphCalls.length, 1);
  }
});

test('authentication, admin authorization, origin and input boundaries reject before claiming', async () => {
  const valid = { operation: 'send_single_test_reply', inbound_test_message_id: INBOUND_ID };
  for (const [opts, body, requestOptions, expected] of [
    [{}, valid, { noAuth: true }, 401], [{ adminDenied: true }, valid, {}, 403],
    [{}, valid, { headers: { origin: 'https://evil.invalid' } }, 403],
    [{}, { ...valid, text: 'arbitrary message' }, {}, 400], [{}, { ...valid, to: '351900000099' }, {}, 400],
    [{}, { ...valid, request_id: 'another-request' }, {}, 400], [{}, { ...valid, access_token: 'client-secret' }, {}, 400],
    [{}, { ...valid, operation: 'send' }, {}, 400], [{}, { ...valid, inbound_test_message_id: 'not-a-uuid' }, {}, 400],
    [{}, null, {}, 400], [{}, [], {}, 400],
  ]) {
    const r = runtime(opts); assert.equal((await r.post(body, requestOptions)).status, expected);
    assert.equal(r.graphCalls.length, 0); assert.equal(r.writes.length, 0);
  }
  const r = runtime();
  assert.equal((await r.handler(new Request('https://synthetic.invalid/test', { method: 'OPTIONS' }))).status, 204);
  assert.equal((await r.handler(new Request('https://synthetic.invalid/test'))).status, 405);
  assert.equal(r.graphCalls.length, 0);
});

test('wrong or missing dedicated configuration never claims or sends', async () => {
  for (const options of [
    { missingConfig: true }, { configError: true }, { config: { business_phone: '+351918404101' } },
    { config: { phone_number_id: '874910289048462' } }, { config: { waba_id: 'old-personal-waba' } }, { config: { access_token: '' } },
  ]) {
    const r = runtime(options); assert.equal((await r.post()).status, 409);
    assert.equal(r.graphCalls.length, 0); assert.equal(r.writes.length, 0);
  }
});

test('inbound proof must be recent exact business acceptance text and non-private', async () => {
  for (const patch of [
    { phone_number_id: '874910289048462' }, { direction: 'outbound' }, { channel: 'email' }, { source: 'whatsapp_business_app' },
    { status: 'sent' }, { is_private: true }, { is_private: null }, { message_type: 'image' }, { text_body: 'TESTE WATERMELON 965 ' },
    { request_id: null }, { contact_id: null }, { whatsapp_message_id: null }, { from_phone: '351965637736' },
    { to_phone: '351918404101' }, { wa_id: '351900000099' }, { from_phone: '12' }, { whatsapp_timestamp: 'invalid' },
    { whatsapp_timestamp: new Date(Date.now() - 25 * 3600000).toISOString() }, { whatsapp_timestamp: new Date(Date.now() + 3600000).toISOString() },
  ]) {
    const r = runtime({ mutate(t) { Object.assign(t.watermelon_messages[0], patch); } });
    assert.equal((await r.post()).status, 409, JSON.stringify(patch));
    assert.equal(r.graphCalls.length, 0); assert.equal(r.writes.length, 0);
  }
  const r = runtime({ mutate(t) { t.watermelon_messages = []; } });
  assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 0);
});

test('request and contact privacy and recipient association are independently enforced', async () => {
  const mutations = [
    t => { t.watermelon_contacts = []; }, t => { t.watermelon_requests = []; },
    t => { t.watermelon_contacts[0].is_private = true; }, t => { delete t.watermelon_contacts[0].is_private; },
    t => { t.watermelon_requests[0].is_private = true; }, t => { delete t.watermelon_requests[0].is_private; },
    t => { t.watermelon_requests[0].contact_id = 'different-contact'; }, t => { t.watermelon_contacts[0].phone_digits = '351900000099'; },
  ];
  for (const mutate of mutations) {
    const r = runtime({ mutate }); assert.equal((await r.post()).status, 409);
    assert.equal(r.graphCalls.length, 0); assert.equal(r.writes.length, 0);
  }
  for (const table of ['watermelon_messages', 'watermelon_contacts', 'watermelon_requests']) {
    const r = runtime({ queryError: (name, ops) => name === table && !ops.some(([op]) => ['insert', 'update'].includes(op)) });
    assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 0); assert.equal(r.writes.length, 0);
  }
});

test('uncertain, rejected and unrecorded submissions keep the durable claim and block every retry', async () => {
  for (const [options, status, state, code] of [
    [{ timeout: true }, 502, 'unknown', 'TEST_RESULT_UNKNOWN'],
    [{ missingWamid: true }, 502, 'unknown', 'TEST_RESULT_UNKNOWN'],
    [{ graphReject: true }, 409, 'rejected', 'TEST_REJECTED'],
    [{ failAcceptedSave: true }, 502, 'pending', 'TEST_RECORD_UNCONFIRMED'],
  ]) {
    const r = runtime(options); const response = await r.post();
    assert.equal(response.status, status); assert.equal((await response.json()).code, code);
    const claim = r.tables.watermelon_messages.find(row => row.id === CLAIM_ID);
    assert.equal(claim.raw_payload.controlled_test_state, state); assert.equal(claim.status, 'failed');
    assert.equal(claim.whatsapp_message_id, null);
    assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 1);
  }
});
const uiSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../components/WhatsAppConversation.tsx'), 'utf8');
test('test reply UI selects the newest eligible proof and distinguishes uncertain claims from failure', () => {
  const expression = uiSource.match(/const testProof = ([\s\S]*?);\n/)?.[1];
  assert.ok(expression);
  const selectProof = new Function('messages', 'return ' + expression);
  const row = (id, at) => ({ id, direction: 'inbound', is_private: false, phone_number_id: '1423415737522090',
    source: 'cloud_api', status: 'received', text_body: 'TESTE WATERMELON 965', whatsapp_timestamp: new Date(at).toISOString() });
  const now = Date.now();
  assert.equal(selectProof([row('old', now - 2 * 86400000), row('newest', now - 1000)]).id, 'newest');
  assert.equal(selectProof([row('expired', now - 2 * 86400000)]), undefined);
  assert.match(uiSource, /window\.confirm\("Enviar UMA resposta de teste/);
  assert.match(uiSource, /\["pending", "unknown"\]\.includes/);
  assert.match(uiSource, /message\.status === "failed" && !pendingTest/);
  assert.match(uiSource, /const WHATSAPP_CRM_ENABLED = false;/);
});
