const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const { webcrypto, createHmac } = require('node:crypto');

const sourcePath = process.env.WHATSAPP_WEBHOOK_TEST_SOURCE || path.resolve(__dirname, '../supabase/functions/watermelon-whatsapp-webhook/index.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
function compile(sourceText) {
  const compiled = ts.transpileModule(sourceText.replace(/^import .*;\n/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error), []);
  return compiled.outputText;
}
assert.match(source, /const CRM_OUTBOUND_ENABLED = false;/);
assert.match(source, /const CRM_INBOUND_ENABLED = false;/);
const javascript = compile(source);
// The production source is paused. Enable only the in-memory VM copy below to
// preserve the commercial-routing regression suite without changing production.
const routingGuard = 'const CRM_INBOUND_ENABLED = false;';
assert.equal(source.split(routingGuard).length, 2, 'Only the inbound guard may be overridden for routing tests');
const routingJavascript = compile(source.replace(routingGuard, 'const CRM_INBOUND_ENABLED = true;'));
const config = {
  verify_token: 'synthetic-verify-token', app_secret: 'synthetic-secret',
  access_token: 'synthetic-token', phone_number_id: 'test-phone', waba_id: 'test-waba',
  business_phone: '+351918404101', graph_version: 'v25.0',
};
const customerPhone = '351900000001';
const businessPhone = '351918404101';
const copy = value => structuredClone(value);
function fixture() {
  return {
    watermelon_contacts: [{ id: 'contact-1', phone_digits: customerPhone, is_private: false }],
    watermelon_requests: [{ id: 'request-1', contact_id: 'contact-1', is_private: false, status: 'proposal_sent', reference: 'WM-SYNTHETIC' }],
    watermelon_messages: [{ id: 'outgoing-1', whatsapp_message_id: 'crm-sent-1', contact_id: 'contact-1', request_id: 'request-1', direction: 'outbound', channel: 'whatsapp', is_private: false, source: 'crm_cloud_api', status: 'sent', phone_number_id: config.phone_number_id }],
    watermelon_activities: [],
  };
}
function createRuntimeWithJavascript(tables = fixture(), fail = () => false, javascriptToRun = javascript) {
  const reads = [], writes = [], rpcs = [], logs = [];
  let graphCalls = 0;
  function from(table) {
    const ops = [];
    let task;
    function execute() {
      if (task) return task;
      task = Promise.resolve().then(() => {
        if (fail(table, ops)) return { data: null, error: { message: 'Synthetic lookup failure' } };
        const matching = row => ops.every(([op, key, value, extra]) => {
          if (op === 'eq') return row[key] === value;
          if (op === 'in') return value.includes(row[key]);
          if (op === 'not' && value === 'in') return !extra.slice(1, -1).split(',').includes(row[key]);
          return true;
        });
        const mutation = ops.find(([op]) => ['insert', 'upsert', 'update'].includes(op));
        const rows = tables[table] ?? [];
        let result;
        if (mutation) {
          const [op, input] = mutation;
          writes.push({ table, op, input: copy(input), ops: copy(ops) });
          if (op === 'update') {
            result = rows.filter(matching);
            for (const row of result) Object.assign(row, copy(input));
          } else {
            const entries = Array.isArray(input) ? input : [input];
            result = entries.map((row, i) => ({ id: `synthetic-new-${writes.length}-${i}`, is_private: false, ...copy(row) }));
            tables[table] ??= [];
            tables[table].push(...result);
          }
        } else {
          reads.push({ table, ops: copy(ops) });
          result = rows.filter(matching);
          const limit = ops.find(([op]) => op === 'limit');
          if (limit) result = result.slice(0, limit[1]);
          const select = ops.find(([op]) => op === 'select')?.[1];
          if (select && select !== '*') result = result.map(row => Object.fromEntries(select.split(',').filter(key => key in row).map(key => [key, row[key]])));
        }
        return { data: ops.some(([op]) => op === 'maybeSingle' || op === 'single') ? (result[0] ?? null) : result, error: null };
      });
      return task;
    }
    const query = { then(resolve, reject) { return execute().then(resolve, reject); } };
    for (const op of ['select', 'eq', 'in', 'not', 'order', 'limit', 'insert', 'update', 'upsert']) {
      query[op] = (...args) => { ops.push([op, ...args]); return query; };
    }
    for (const op of ['maybeSingle', 'single']) query[op] = () => { ops.push([op]); return execute(); };
    return query;
  }
  const api = {};
  vm.runInNewContext(javascriptToRun + '\napi.sendPendingCRMText = sendPendingCRMText;', {
    api, createClient: () => ({ from, async rpc(name, input) { rpcs.push({ name, input }); return { data: name === 'watermelon_whatsapp_server_config' ? copy(config) : null, error: null }; } }),
    crypto: webcrypto, Request, Response, URL, TextEncoder, Intl, Date,
    console: { error: (...args) => logs.push(args), log() {} },
    fetch: async () => { graphCalls++; throw new Error('Real network is forbidden in this synthetic test'); },
    Deno: { env: { get: () => 'synthetic-env' }, serve(handler) { api.handler = handler; } },
  });
  return { api, tables, reads, writes, rpcs, logs, get graphCalls() { return graphCalls; } };
}
function createRuntime(tables, fail) {
  return createRuntimeWithJavascript(tables, fail, javascript);
}
function createRoutingRuntime(tables, fail) {
  return createRuntimeWithJavascript(tables, fail, routingJavascript);
}
function inbound(override = {}) {
  return { id: 'inbound-1', from: customerPhone, timestamp: '1793376000', type: 'text', text: { body: 'Synthetic commercial reply' }, context: { id: 'crm-sent-1' }, ...override };
}
function event(message = inbound(), options = {}) {
  const value = { metadata: { phone_number_id: config.phone_number_id, display_phone_number: businessPhone }, messages: [message], ...options.value };
  return { object: 'whatsapp_business_account', entry: [{ id: options.waba === undefined ? config.waba_id : options.waba, changes: [{ field: options.field ?? 'messages', value }] }] };
}
async function post(runtime, payload, validSignature = true) {
  const body = JSON.stringify(payload);
  return postRaw(runtime, body, validSignature);
}
async function postRaw(runtime, body, validSignature = true) {
  const signature = 'sha256=' + createHmac('sha256', config.app_secret).update(body).digest('hex');
  return runtime.api.handler(new Request('https://synthetic.invalid/webhook', { method: 'POST', headers: validSignature ? { 'x-hub-signature-256': signature } : {}, body }));
}
let passed = 0;
async function test(name, action) {
  try { await action(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
async function rejected(name, mutate = () => {}, payload = () => event(), fail = () => false, expectedStatus = 200) {
  await test(name, async () => {
    const tables = fixture(); mutate(tables);
    const runtime = createRoutingRuntime(tables, fail);
    const response = await post(runtime, payload());
    assert.equal(response.status, expectedStatus);
    assert.equal(runtime.writes.length, 0, 'No CRM contact/request/message/activity mutation may occur');
    assert.equal(runtime.graphCalls, 0);
  });
}

(async () => {
  const pausedPayloads = [
    ['personal message', event(inbound({ context: undefined, text: { body: 'SYNTHETIC-PERSONAL' } }))],
    ['commercial reply', event()],
    ['delivery status', event(inbound(), { value: { messages: [], statuses: [{ id: 'crm-sent-1', status: 'delivered', timestamp: '1793376000' }] } })],
    ['phone echo', event(inbound(), { field: 'smb_message_echoes', value: { messages: [], message_echoes: [inbound({ from: businessPhone, to: customerPhone })] } })],
    ['history', event(inbound(), { field: 'history', value: { history: [{ messages: [inbound()] }] } })],
    ['contact sync', event(inbound(), { field: 'smb_app_state_sync', value: { contacts: [{ wa_id: customerPhone }] } })],
    ['mixed batch', { object: 'whatsapp_business_account', entry: [{ id: config.waba_id, changes: [
      { field: 'messages', value: { metadata: { phone_number_id: config.phone_number_id, display_phone_number: businessPhone }, messages: [inbound(), inbound({ id: 'personal', context: undefined })], statuses: [{ id: 'crm-sent-1', status: 'read' }] } },
      { field: 'smb_message_echoes', value: { message_echoes: [inbound({ from: businessPhone, to: customerPhone })] } },
    ] }] }],
  ];
  for (const [name, payload] of pausedPayloads) {
    await test(`production pause discards signed ${name}`, async () => {
      const runtime = createRuntime();
      const response = await post(runtime, payload);
      assert.equal(response.status, 200);
      assert.equal(runtime.reads.length, 0, 'Paused ingestion must not inspect CRM tables');
      assert.equal(runtime.writes.length, 0, 'Paused ingestion must not write CRM tables');
      assert.equal(runtime.graphCalls, 0);
      assert.ok(!runtime.rpcs.some(item => item.name !== 'watermelon_whatsapp_server_config'), 'Paused ingestion needs only signing configuration');
    });
  }
  await test('production pause discards signed invalid JSON before parsing', async () => {
    const runtime = createRuntime();
    assert.equal((await postRaw(runtime, '{invalid-synthetic-json')).status, 200);
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.graphCalls, 0);
    assert.equal(runtime.logs.length, 0, 'Discarded contents must not be logged');
  });
  await test('production pause still rejects invalid signature', async () => {
    const runtime = createRuntime();
    assert.equal((await postRaw(runtime, '{invalid-synthetic-json', false)).status, 401);
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.graphCalls, 0);
  });
  await test('production pause preserves valid handshake', async () => {
    const runtime = createRuntime();
    const result = await runtime.api.handler(new Request('https://synthetic.invalid/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=paused-challenge'));
    assert.equal(result.status, 200); assert.equal(await result.text(), 'paused-challenge');
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.graphCalls, 0);
  });
  await test('production pause preserves invalid-handshake rejection', async () => {
    const runtime = createRuntime();
    assert.equal((await runtime.api.handler(new Request('https://synthetic.invalid/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=paused-challenge'))).status, 403);
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.graphCalls, 0);
  });
  await test('production source also keeps outbound paused', async () => {
    const runtime = createRuntime();
    await runtime.api.sendPendingCRMText({ config, requestId: 'request-1', contactId: 'contact-1', customerDigits: customerPhone, businessDigits: businessPhone });
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.rpcs.length, 0); assert.equal(runtime.graphCalls, 0);
  });
  for (const sourceName of ['crm_cloud_api', 'crm_cloud_api_template', 'crm_cloud_api_pending']) {
    for (const statusName of ['sent', 'delivered', 'read']) {
      await test(`commercial reply source=${sourceName} status=${statusName}`, async () => {
        const tables = fixture(); tables.watermelon_messages[0].source = sourceName; tables.watermelon_messages[0].status = statusName;
        const runtime = createRoutingRuntime(tables);
        assert.equal((await post(runtime, event())).status, 200);
        const inserted = runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert');
        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].input.request_id, 'request-1');
        assert.equal(inserted[0].input.contact_id, 'contact-1');
        assert.equal(inserted[0].input.direction, 'inbound');
        assert.equal(inserted[0].input.source, 'cloud_api');
        assert.ok(runtime.writes.some(w => w.table === 'watermelon_requests' && w.input.status === 'customer_replied'));
        assert.ok(runtime.writes.some(w => w.table === 'watermelon_activities' && w.input.activity_type === 'whatsapp_received'));
        assert.equal(runtime.graphCalls, 0);
        assert.ok(!runtime.writes.some(w => w.table === 'watermelon_contacts'));
      });
    }
  }
  await rejected('friend already in CRM but unquoted message', undefined, () => event(inbound({ context: undefined })));
  await rejected('unknown friend unquoted message', d => { d.watermelon_contacts = []; }, () => event(inbound({ context: undefined })));
  await rejected('unknown sender with quoted CRM ID', d => { d.watermelon_contacts = []; });
  await rejected('missing sender', undefined, () => event(inbound({ from: undefined })));
  await rejected('phone-app outbound masquerading as message', undefined, () => event(inbound({ from: businessPhone, to: customerPhone })));
  await rejected('third-party to recipient', undefined, () => event(inbound({ to: '351900000099' })));
  await rejected('third-party recipient_id', undefined, () => event(inbound({ recipient_id: '351900000099' })));
  await rejected('missing message ID', undefined, () => event(inbound({ id: undefined })));
  await rejected('missing context ID', undefined, () => event(inbound({ context: {} })));
  await rejected('unknown context ID', undefined, () => event(inbound({ context: { id: 'personal-message-not-in-crm' } })));
  await rejected('duplicate inbound ID', d => { d.watermelon_messages.push({ id: 'stored-inbound', whatsapp_message_id: 'inbound-1' }); });
  for (const field of ['smb_message_echoes', 'message_echoes', 'history', 'smb_app_state_sync', 'contacts']) {
    await rejected(`ignored ${field}`, undefined, () => event(inbound(), { field, value: { messages: [inbound()], message_echoes: [inbound({ from: businessPhone, to: customerPhone })], contacts: [{ wa_id: customerPhone, profile: { name: 'Synthetic personal name' } }], history: [{ messages: [inbound()] }] } }));
  }
  for (const flag of [true, null, undefined]) {
    await rejected(`private/missing contact flag ${flag}`, d => { d.watermelon_contacts[0].is_private = flag; });
    await rejected(`private/missing request flag ${flag}`, d => { d.watermelon_requests[0].is_private = flag; });
    await rejected(`private/missing context flag ${flag}`, d => { d.watermelon_messages[0].is_private = flag; });
  }
  for (const statusName of ['failed', 'queued', 'pending', 'deleted']) {
    await rejected(`context is ${statusName}`, d => { d.watermelon_messages[0].status = statusName; });
  }
  for (const sourceName of ['whatsapp_business_app', 'cloud_api', 'untrusted_source']) {
    await rejected(`context source ${sourceName}`, d => { d.watermelon_messages[0].source = sourceName; });
  }
  await rejected('context from different contact', d => { d.watermelon_messages[0].contact_id = 'other-contact'; });
  await rejected('context points to missing request', d => { d.watermelon_requests = []; });
  await rejected('request belongs to another contact', d => { d.watermelon_requests[0].contact_id = 'other-contact'; });
  await rejected('context is inbound', d => { d.watermelon_messages[0].direction = 'inbound'; });
  await rejected('context non-WhatsApp', d => { d.watermelon_messages[0].channel = 'email'; });
  for (const statusName of ['declined', 'cancelled']) await rejected(`closed request ${statusName}`, d => { d.watermelon_requests[0].status = statusName; });
  await rejected('contact lookup error', undefined, undefined, table => table === 'watermelon_contacts', 500);
  await rejected('context lookup error', undefined, undefined, (table, ops) => table === 'watermelon_messages' && ops.some(op => op[0] === 'eq' && op[1] === 'whatsapp_message_id' && op[2] === 'crm-sent-1'));
  await rejected('duplicate lookup error fails closed', undefined, undefined, (table, ops) => table === 'watermelon_messages' && ops.some(op => op[0] === 'eq' && op[1] === 'whatsapp_message_id' && op[2] === 'inbound-1'), 500);
  await rejected('request lookup error', undefined, undefined, table => table === 'watermelon_requests');
  await rejected('context belongs to another phone endpoint', d => { d.watermelon_messages[0].phone_number_id = 'other-phone'; });
  await rejected('context has no phone endpoint', d => { delete d.watermelon_messages[0].phone_number_id; });
  await rejected('wrong WABA', undefined, () => event(inbound(), { waba: 'other-waba' }));
  await rejected('missing WABA', undefined, () => event(inbound(), { waba: '' }));
  for (const metadata of [
    {}, { phone_number_id: 'other-phone', display_phone_number: businessPhone },
    { phone_number_id: config.phone_number_id, display_phone_number: '351900000099' },
    { phone_number_id: config.phone_number_id },
  ]) await rejected(`wrong/missing Meta endpoint ${JSON.stringify(metadata)}`, undefined, () => event(inbound(), { value: { metadata } }));
  const statusPayload = options => event(inbound(), { value: { messages: [], statuses: [{ id: 'crm-sent-1', status: 'delivered', timestamp: '1793376000' }] }, ...options });
  await test('status for existing business message', async () => {
    const runtime = createRoutingRuntime();
    assert.equal((await post(runtime, statusPayload())).status, 200);
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].table, 'watermelon_messages');
    assert.equal(runtime.writes[0].op, 'update');
    assert.equal(runtime.writes[0].input.status, 'delivered');
    assert.ok(runtime.writes[0].ops.some(op => op[0] === 'eq' && op[1] === 'id' && op[2] === 'outgoing-1'));
  });
  const rejectedStatus = (name, mutate, fail) => rejected(name, mutate, () => statusPayload(), fail);
  await rejectedStatus('status missing message', d => { d.watermelon_messages = []; });
  await rejectedStatus('status phone-app message', d => { d.watermelon_messages[0].source = 'whatsapp_business_app'; });
  await rejectedStatus('status inbound message', d => { d.watermelon_messages[0].direction = 'inbound'; });
  await rejectedStatus('status private message', d => { d.watermelon_messages[0].is_private = true; });
  await rejectedStatus('status private contact', d => { d.watermelon_contacts[0].is_private = true; });
  await rejectedStatus('status private request', d => { d.watermelon_requests[0].is_private = true; });
  await rejectedStatus('status missing contact', d => { d.watermelon_contacts = []; });
  await rejectedStatus('status missing request', d => { d.watermelon_requests = []; });
  await rejectedStatus('status request points to other contact', d => { d.watermelon_requests[0].contact_id = 'other-contact'; });
  await rejectedStatus('status message belongs to another phone endpoint', d => { d.watermelon_messages[0].phone_number_id = 'other-phone'; });
  await rejectedStatus('status message has no phone endpoint', d => { delete d.watermelon_messages[0].phone_number_id; });
  for (const tableName of ['watermelon_messages', 'watermelon_contacts', 'watermelon_requests']) await rejectedStatus(`status lookup error ${tableName}`, undefined, table => table === tableName);
  await rejected('status wrong WABA', undefined, () => statusPayload({ waba: 'other-waba' }));
  await rejected('status wrong phone', undefined, () => statusPayload({ value: { messages: [], metadata: { phone_number_id: 'other-phone', display_phone_number: businessPhone }, statuses: [{ id: 'crm-sent-1', status: 'read' }] } }));
  await test('explicit business recipient accepted', async () => {
    const runtime = createRoutingRuntime();
    assert.equal((await post(runtime, event(inbound({ to: businessPhone, recipient_id: businessPhone })))).status, 200);
    assert.equal(runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert').length, 1);
  });
  await test('quoted context chooses its own request among same-contact requests', async () => {
    const tables = fixture();
    tables.watermelon_requests.push({ id: 'later-request', contact_id: 'contact-1', is_private: false, status: 'new', reference: 'WM-OTHER' });
    const runtime = createRoutingRuntime(tables);
    assert.equal((await post(runtime, event())).status, 200);
    assert.equal(runtime.writes.find(w => w.table === 'watermelon_messages' && w.op === 'upsert').input.request_id, 'request-1');
    assert.ok(runtime.writes.filter(w => w.table === 'watermelon_requests').every(w => w.ops.some(op => op[0] === 'eq' && op[1] === 'id' && op[2] === 'request-1')));
  });
  await test('mixed webhook batch stores only explicit commercial reply', async () => {
    const runtime = createRoutingRuntime();
    const payload = event();
    payload.entry[0].changes[0].value.messages = [
      inbound({ id: 'personal-before', context: undefined, text: { body: 'PERSONAL-SYNTHETIC-BEFORE' } }),
      inbound(),
      inbound({ id: 'personal-after', context: undefined, text: { body: 'PERSONAL-SYNTHETIC-AFTER' } }),
    ];
    assert.equal((await post(runtime, payload)).status, 200);
    const messages = runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].input.whatsapp_message_id, 'inbound-1');
    assert.ok(!JSON.stringify(runtime.writes).includes('PERSONAL-SYNTHETIC'));
  });
  await test('paused outbound helper has no side effects', async () => {
    const runtime = createRoutingRuntime();
    await runtime.api.sendPendingCRMText({ config, requestId: 'request-1', contactId: 'contact-1', customerDigits: customerPhone, businessDigits: businessPhone });
    assert.equal(runtime.reads.length, 0); assert.equal(runtime.writes.length, 0); assert.equal(runtime.rpcs.length, 0); assert.equal(runtime.graphCalls, 0);
  });
  await test('valid handshake', async () => {
    const runtime = createRoutingRuntime();
    const result = await runtime.api.handler(new Request('https://synthetic.invalid/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=synthetic-challenge'));
    assert.equal(result.status, 200); assert.equal(await result.text(), 'synthetic-challenge'); assert.equal(runtime.writes.length, 0);
  });
  await test('invalid handshake', async () => {
    const runtime = createRoutingRuntime();
    assert.equal((await runtime.api.handler(new Request('https://synthetic.invalid/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=synthetic-challenge'))).status, 403);
    assert.equal(runtime.writes.length, 0);
  });
  await test('invalid signature', async () => {
    const runtime = createRoutingRuntime(); assert.equal((await post(runtime, event(), false)).status, 401); assert.equal(runtime.writes.length, 0);
  });
  console.log(`PASS: ${passed} privacy and preservation scenarios; no real DB/Graph/credentials used. Rejected events produced zero CRM table writes (only ordinary webhook health RPC is allowed).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
