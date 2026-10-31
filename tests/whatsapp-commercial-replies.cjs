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
assert.match(source, /const CRM_INBOUND_ENABLED = true;/);
assert.match(source, /const CRM_INBOUND_TEST_ONLY = true;/);
const javascript = compile(source);
// Production accepts only the exact test phrase. Separate VM copies exercise
// the emergency pause and prepared future routing without widening production.
const routingGuard = 'const CRM_INBOUND_ENABLED = true;';
assert.equal(source.split(routingGuard).length, 2);
const pausedJavascript = compile(source.replace(routingGuard, 'const CRM_INBOUND_ENABLED = false;'));
const routingJavascript = compile(source.replace('const CRM_INBOUND_TEST_ONLY = true;', 'const CRM_INBOUND_TEST_ONLY = false;'));
const config = {
  verify_token: 'synthetic-verify-token', app_secret: 'synthetic-secret',
  access_token: 'synthetic-token', phone_number_id: '1423415737522090', waba_id: '4408982439363483',
  business_phone: '+351965637736', graph_version: 'v25.0',
};
const customerPhone = '351900000001';
const businessPhone = '351965637736';
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
          const [op, input, options] = mutation;
          writes.push({ table, op, input: copy(input), ops: copy(ops) });
          if (op === 'update') {
            result = rows.filter(matching);
            for (const row of result) Object.assign(row, copy(input));
          } else {
            const entries = (Array.isArray(input) ? input : [input]).filter(row =>
              !(op === 'upsert' && options?.ignoreDuplicates && rows.some(existing => existing[options.onConflict] === row[options.onConflict]))
            );
            result = entries.map((row, i) => ({ id: `synthetic-new-${writes.length}-${i}`, is_private: false,
              ...(row.phone ? { phone_digits: row.phone.replace(/\D/g, '') } : {}), ...copy(row) }));
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
  return createRuntimeWithJavascript(tables, fail, pausedJavascript);
}
function createControlledRuntime(tables, fail) {
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
  const testMessage = override => inbound({ context: undefined, text: { body: 'TESTE WATERMELON 965' }, ...override });
  await test('controlled production receives only the exact authorised business test phrase', async () => {
    const tables = fixture(); tables.watermelon_contacts = []; tables.watermelon_messages = [];
    const runtime = createControlledRuntime(tables);
    assert.equal((await post(runtime, event(testMessage()))).status, 200);
    const stored = tables.watermelon_messages;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].text_body, 'TESTE WATERMELON 965');
    assert.equal(stored[0].phone_number_id, '1423415737522090');
    assert.equal(stored[0].direction, 'inbound');
    assert.equal(runtime.graphCalls, 0);
    const count = runtime.writes.length;
    assert.equal((await post(runtime, event(testMessage()))).status, 200);
    assert.equal(runtime.writes.length, count, 'Repeated test delivery is idempotent');
  });
  for (const message of [
    inbound(), testMessage({ text: { body: 'ordinary personal or business text' } }),
    testMessage({ text: { body: 'TESTE WATERMELON 965 ' } }), testMessage({ text: { body: ' TESTE WATERMELON 965' } }),
    testMessage({ text: { body: 'teste watermelon 965' } }), testMessage({ text: { body: 'TESTE WATERMELON 965\n' } }),
    ...['image', 'audio', 'document', 'contacts', 'interactive'].map(type => testMessage({ type })),
  ]) await test(`controlled production discards non-exact text/type ${JSON.stringify(message.text)} ${message.type}`, async () => {
    const runtime = createControlledRuntime();
    assert.equal((await post(runtime, event(message))).status, 200);
    assert.equal(runtime.reads.length, 0);
    assert.equal(runtime.writes.length, 0);
    assert.equal(runtime.graphCalls, 0);
  });
  const rejectedControlled = async (name, payload, mutate = () => {}) => test(name, async () => {
    const tables = fixture(); mutate(tables);
    const runtime = createControlledRuntime(tables);
    assert.equal((await post(runtime, payload)).status, 200);
    assert.equal(runtime.writes.length, 0);
    assert.equal(runtime.graphCalls, 0);
  });
  await rejectedControlled('controlled wrong WABA blocked', event(testMessage(), { waba: 'other-waba' }));
  await rejectedControlled('controlled personal endpoint blocked', event(testMessage(), { value: { metadata: { phone_number_id: '874910289048462', display_phone_number: '351918404101' } } }));
  await rejectedControlled('controlled wrong display number blocked', event(testMessage(), { value: { metadata: { phone_number_id: config.phone_number_id, display_phone_number: '351918404101' } } }));
  for (const field of ['history', 'contacts', 'smb_app_state_sync', 'smb_message_echoes', 'message_echoes']) {
    await rejectedControlled(`controlled ignores ${field} even with exact phrase`, event(testMessage(), { field }));
  }
  await rejectedControlled('controlled private sender blocked', event(testMessage()), d => { d.watermelon_contacts[0].is_private = true; });
  await rejectedControlled('controlled private dedicated thread blocked', event(testMessage()), d => { d.watermelon_requests[0].is_private = true; d.watermelon_messages[0].is_private = true; });
  await rejectedControlled('controlled delivery status cannot mutate records', event(testMessage(), { value: { messages: [], statuses: [{ id: 'crm-sent-1', status: 'delivered' }] } }));
  await test('controlled mixed batch stores only the authorised phrase', async () => {
    const runtime = createControlledRuntime();
    const payload = event(testMessage());
    payload.entry[0].changes[0].value.messages.push(inbound({ id: 'unrelated-private-message', text: { body: 'SYNTHETIC-PRIVATE-DISCARDED' } }));
    assert.equal((await post(runtime, payload)).status, 200);
    assert.equal(runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert').length, 1);
    assert.ok(!JSON.stringify(runtime.writes).includes('SYNTHETIC-PRIVATE-DISCARDED'));
  });
  await test('controlled invalid signature is rejected before storing the phrase', async () => {
    const runtime = createControlledRuntime();
    assert.equal((await post(runtime, event(testMessage()), false)).status, 401);
    assert.equal(runtime.writes.length, 0);
  });
  const testReplyId = '96563773-6000-8000-a000-000000000001';
  const testReplySource = 'crm_cloud_api_controlled_test';
  const receiptTables = () => {
    const tables = fixture();
    tables.watermelon_messages.push({ id: testReplyId, request_id: 'request-1', contact_id: 'contact-1',
      direction: 'outbound', channel: 'whatsapp', source: testReplySource, status: 'sent',
      is_private: false, phone_number_id: config.phone_number_id, whatsapp_message_id: 'wamid-controlled-test', to_phone: customerPhone });
    return tables;
  };
  const receiptEvent = override => event(inbound(), { value: { messages: [], statuses: [{ id: 'wamid-controlled-test', status: 'delivered', recipient_id: customerPhone, timestamp: '1793376000', ...override }] } });
  for (const status of ['sent', 'delivered', 'read', 'failed']) await test(`controlled receipt ${status} updates only the single test row`, async () => {
    const runtime = createControlledRuntime(receiptTables());
    assert.equal((await post(runtime, receiptEvent({ status, unrelated_private_data: 'DO-NOT-STORE' }))).status, 200);
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].table, 'watermelon_messages');
    assert.ok(runtime.writes[0].ops.some(op => op[0] === 'eq' && op[1] === 'id' && op[2] === testReplyId));
    assert.equal(runtime.writes[0].input.status, status);
    assert.ok(!JSON.stringify(runtime.writes).includes('DO-NOT-STORE'));
    assert.equal(runtime.graphCalls, 0);
  });
  for (const [name, mutate, override] of [
    ['unrelated wamid', () => {}, { id: 'crm-sent-1' }],
    ['wrong recipient', () => {}, { recipient_id: '351900000099' }],
    ['missing recipient', () => {}, { recipient_id: undefined }],
    ['bad timestamp', () => {}, { timestamp: 'invalid' }],
    ['unsupported status', () => {}, { status: 'deleted' }],
    ['private claim', d => { d.watermelon_messages[1].is_private = true; }, {}],
    ['private contact', d => { d.watermelon_contacts[0].is_private = true; }, {}],
    ['private request', d => { d.watermelon_requests[0].is_private = true; }, {}],
    ['wrong claim source', d => { d.watermelon_messages[1].source = 'crm_cloud_api'; }, {}],
    ['unconfirmed claim wamid', d => { d.watermelon_messages[1].whatsapp_message_id = null; }, {}],
    ['wrong claim phone', d => { d.watermelon_messages[1].phone_number_id = '874910289048462'; }, {}],
    ['inconsistent contact recipient', d => { d.watermelon_contacts[0].phone_digits = '351900000099'; }, {}],
    ['different request contact', d => { d.watermelon_requests[0].contact_id = 'other-contact'; }, {}],
  ]) await test(`controlled receipt rejects ${name}`, async () => {
    const tables = receiptTables(); mutate(tables);
    const runtime = createControlledRuntime(tables);
    assert.equal((await post(runtime, receiptEvent(override))).status, 200);
    assert.equal(runtime.writes.length, 0);
    assert.equal(runtime.graphCalls, 0);
  });
  await test('controlled receipt cannot downgrade read status or fail a delivered message', async () => {
    const tables = receiptTables(); tables.watermelon_messages[1].status = 'read';
    const runtime = createControlledRuntime(tables);
    for (const status of ['sent', 'delivered', 'failed']) assert.equal((await post(runtime, receiptEvent({ status }))).status, 200);
    assert.equal(runtime.writes.length, 0);
  });
  await test('early controlled receipt requests retry until the saved WAMID proves correlation', async () => {
    const tables = receiptTables();
    tables.watermelon_messages[1].whatsapp_message_id = null;
    tables.watermelon_messages[1].status = 'failed';
    tables.watermelon_messages[1].raw_payload = { controlled_test_state: 'pending' };
    const runtime = createControlledRuntime(tables);
    assert.equal((await post(runtime, receiptEvent())).status, 500);
    assert.equal(runtime.writes.length, 0);
    tables.watermelon_messages[1].whatsapp_message_id = 'wamid-controlled-test';
    tables.watermelon_messages[1].status = 'sent';
    assert.equal((await post(runtime, receiptEvent())).status, 200);
    assert.equal(tables.watermelon_messages[1].status, 'delivered');
  });
  await test('concurrent controlled receipts cannot regress read status', async () => {
    const tables = receiptTables();
    const runtime = createControlledRuntime(tables);
    const responses = await Promise.all([
      post(runtime, receiptEvent({ status: 'read' })), post(runtime, receiptEvent({ status: 'delivered' })),
    ]);
    assert.equal(tables.watermelon_messages[1].status, 'read');
    assert.ok(responses.every(response => [200, 500].includes(response.status)));
    assert.equal((await post(runtime, receiptEvent({ status: 'delivered' }))).status, 200);
    assert.equal(tables.watermelon_messages[1].status, 'read');
  });
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
  for (const known of [true, false]) await test(`dedicated spontaneous enquiry from ${known ? 'known' : 'new'} sender`, async () => {
    const tables = fixture();
    tables.watermelon_messages[0].phone_number_id = '874910289048462';
    if (!known) tables.watermelon_contacts = [];
    const runtime = createRoutingRuntime(tables);
    const payload = event(inbound({ context: undefined }), { value: { contacts: [{ wa_id: customerPhone, profile: { name: 'Synthetic customer' } }] } });
    assert.equal((await post(runtime, payload)).status, 200);
    const stored = runtime.writes.find(w => w.table === 'watermelon_messages' && w.op === 'upsert');
    assert.ok(stored, 'A fresh business enquiry must enter the CRM');
    assert.notEqual(stored.input.request_id, 'request-1', 'Never attach to an old request merely because the sender matches');
    assert.equal(stored.input.phone_number_id, '1423415737522090');
    assert.equal(runtime.graphCalls, 0);
    assert.equal(tables.watermelon_requests.length, 2);
    assert.equal(tables.watermelon_contacts.length, 1);
    const counts = [tables.watermelon_contacts.length, tables.watermelon_requests.length, tables.watermelon_messages.length];
    assert.equal((await post(runtime, payload)).status, 200);
    assert.deepEqual([tables.watermelon_contacts.length, tables.watermelon_requests.length, tables.watermelon_messages.length], counts, 'Redelivery must not duplicate records');
  });
  await test('successive unquoted messages continue only the new dedicated request', async () => {
    const tables = fixture(); tables.watermelon_messages[0].phone_number_id = '874910289048462';
    const runtime = createRoutingRuntime(tables);
    assert.equal((await post(runtime, event(inbound({ context: undefined })))).status, 200);
    assert.equal((await post(runtime, event(inbound({ id: 'second-new', context: undefined })))).status, 200);
    const stored = runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert');
    assert.equal(stored.length, 2);
    assert.equal(stored[0].input.request_id, stored[1].input.request_id);
    assert.equal(runtime.tables.watermelon_requests.length, 2);
    assert.equal(runtime.graphCalls, 0);
  });
  for (const flag of [true, null, undefined]) await rejected(`spontaneous message private contact ${flag}`, d => { d.watermelon_contacts[0].is_private = flag; }, () => event(inbound({ context: undefined })));
  for (const flag of [true, null, undefined]) await rejected(`spontaneous message private dedicated request ${flag}`, d => { d.watermelon_requests[0].is_private = flag; }, () => event(inbound({ context: undefined })));
  for (const flag of [true, null, undefined]) await rejected(`spontaneous message private dedicated routing metadata ${flag}`, d => { d.watermelon_requests[0].is_private = true; d.watermelon_messages[0].is_private = flag; }, () => event(inbound({ context: undefined })));
  await rejected('spontaneous dedicated thread with missing request fails closed', d => { d.watermelon_requests = []; }, () => event(inbound({ context: undefined })));
  await test('simultaneous first business messages share one new request', async () => {
    const tables = fixture(); tables.watermelon_messages = []; tables.watermelon_contacts = [];
    const runtime = createRoutingRuntime(tables);
    const responses = await Promise.all(['first-parallel', 'second-parallel'].map(id => post(runtime, event(inbound({ id, context: undefined })))));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(tables.watermelon_contacts.length, 1);
    assert.equal(tables.watermelon_requests.length, 2, 'Only one new business request in addition to the old request');
    assert.equal(tables.watermelon_messages.length, 2);
    assert.equal(tables.watermelon_messages[0].request_id, tables.watermelon_messages[1].request_id);
  });
  await test('simultaneous redelivery records one message and activity', async () => {
    const runtime = createRoutingRuntime();
    const responses = await Promise.all([post(runtime, event()), post(runtime, event())]);
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(runtime.tables.watermelon_messages.filter(message => message.whatsapp_message_id === 'inbound-1').length, 1);
    assert.equal(runtime.tables.watermelon_activities.filter(activity => activity.activity_type === 'whatsapp_received').length, 1);
  });
  await test('retry after partial creation reuses the same contact and request', async () => {
    const tables = fixture(); tables.watermelon_messages = []; tables.watermelon_contacts = [];
    let failMessage = true;
    const runtime = createRoutingRuntime(tables, (table, ops) => failMessage && table === 'watermelon_messages' && ops.some(op => op[0] === 'upsert'));
    const payload = event(inbound({ context: undefined }));
    assert.equal((await post(runtime, payload)).status, 500);
    const counts = [tables.watermelon_contacts.length, tables.watermelon_requests.length];
    failMessage = false;
    assert.equal((await post(runtime, payload)).status, 200);
    assert.deepEqual([tables.watermelon_contacts.length, tables.watermelon_requests.length], counts);
    assert.equal(tables.watermelon_messages.length, 1);
  });
  await rejected('private duplicate is not bypassed for a spontaneous enquiry', d => { d.watermelon_contacts.push({ id: 'private-duplicate', phone_digits: customerPhone, is_private: true }); }, () => event(inbound({ context: undefined })));
  for (const type of ['contacts', 'reaction', 'sticker', 'unknown']) await rejected(`non-enquiry type ${type}`, undefined, () => event(inbound({ context: undefined, type })));
  await test('legacy personal configuration cannot route even a quoted CRM reply', async () => {
    const previous = { ...config };
    try {
      Object.assign(config, { phone_number_id: '874910289048462', waba_id: '1785473568789104', business_phone: '+351918404101' });
      const runtime = createRoutingRuntime();
      assert.equal((await post(runtime, event())).status, 200);
      assert.equal(runtime.reads.length, 0);
      assert.equal(runtime.writes.length, 0);
    } finally { Object.assign(config, previous); }
  });
  for (const key of ['phone_number_id', 'waba_id', 'business_phone']) await test(`configuration fails closed for wrong ${key}`, async () => {
    const previous = config[key];
    try {
      config[key] = 'unexpected';
      const runtime = createRoutingRuntime();
      assert.equal((await post(runtime, event(inbound({ context: undefined })))).status, 200);
      assert.equal(runtime.reads.length, 0);
      assert.equal(runtime.writes.length, 0);
    } finally { config[key] = previous; }
  });
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
  await test('mixed endpoint batch ignores personal-number payloads and accepts business enquiries', async () => {
    const runtime = createRoutingRuntime();
    const payload = event();
    payload.entry[0].changes[0].value.messages = [
      inbound({ id: 'business-before', context: undefined, text: { body: 'BUSINESS-ENQUIRY' } }),
      inbound(),
      inbound({ id: 'business-after', context: undefined, text: { body: 'BUSINESS-ENQUIRY' } }),
    ];
    payload.entry[0].changes.push({ field: 'messages', value: { metadata: { phone_number_id: '874910289048462', display_phone_number: '351918404101' }, messages: [inbound({ id: 'personal-message', context: undefined, text: { body: 'PERSONAL-SYNTHETIC' } })] } });
    assert.equal((await post(runtime, payload)).status, 200);
    const messages = runtime.writes.filter(w => w.table === 'watermelon_messages' && w.op === 'upsert');
    assert.equal(messages.length, 3);
    assert.ok(messages.some(message => message.input.whatsapp_message_id === 'inbound-1'));
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

