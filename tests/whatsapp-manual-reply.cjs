const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/watermelon-whatsapp-reply/index.ts'), 'utf8');
const javascript = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
});
assert.deepEqual(javascript.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error), []);
const REQUEST = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const TO = '351900000001';
const BUSINESS = '351965637736';
const PHONE = '1423415737522090';
const WABA = '4408982439363483';
const copy = value => structuredClone(value);
function fixture() {
  return {
    watermelon_requests: [{ id: REQUEST, contact_id: CONTACT, is_private: false }],
    watermelon_contacts: [{ id: CONTACT, phone_digits: TO, phone: '+' + TO, is_private: false }],
    watermelon_messages: [{ id: 'inbound-1', request_id: REQUEST, contact_id: CONTACT, is_private: false,
      channel: 'whatsapp', direction: 'inbound', source: 'cloud_api', status: 'received',
      phone_number_id: PHONE, from_phone: TO, to_phone: BUSINESS, wa_id: TO,
      whatsapp_message_id: 'wamid.inbound', whatsapp_timestamp: new Date(Date.now() - 60_000).toISOString() }],
    watermelon_activities: [],
  };
}
function valueAt(row, column) {
  if (column.includes('->')) return column.split(/->>?/).reduce((value, key) => value?.[key], row);
  return row[column];
}
function runtime(options = {}) {
  const tables = options.tables || fixture();
  const expectedTo = options.expectedTo || TO;
  const config = { business_phone: '+' + BUSINESS, phone_number_id: PHONE, waba_id: WABA,
    access_token: 'SYNTHETIC-SERVER-TOKEN', ...options.config };
  const operations = [], graphCalls = [], rpcs = [];
  let handler;
  function query(table) {
    const filters = [];
    let operation = 'select', input, limit, order;
    const matches = row => filters.every(([type, column, expected]) => {
      const value = valueAt(row, column);
      return type === 'eq' ? value === expected : type === 'gte' ? value >= expected : value <= expected;
    });
    async function execute() {
      const rows = tables[table] ||= [];
      operations.push({ table, operation, filters: copy(filters), input: copy(input) });
      if (options.lookupFailure && operation === 'select') return { data: null, error: { code: 'DB_DOWN' } };
      if (options.guardReadHook && operation === 'select' && filters.some(x => x[1] === 'source' && x[2] === 'crm_cloud_api_manual_guard')) await options.guardReadHook();
      if (operation === 'insert') {
        if (table === 'watermelon_activities' && input.id !== undefined) throw new Error('Schema: activity IDs are GENERATED ALWAYS bigint');
        if (table === 'watermelon_messages') assert.match(input.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Schema: message ID must be UUID');
        if (options.guardFailure && input.source === 'crm_cloud_api_manual_guard') return { data: null, error: { code: 'DB_DOWN' } };
        if (options.claimFailure && input.source === 'crm_cloud_api_manual') return { data: null, error: { code: 'DB_DOWN' } };
        if (rows.some(row => row.id === input.id)) return { data: null, error: { code: '23505' } };
        // Unique-key reservation is atomic: no await between conflict check and insert.
        rows.push(copy(input));
        if (options.claimHook && input.source === 'crm_cloud_api_manual') options.claimHook(tables, config);
        return { data: null, error: null };
      }
      let selected = rows.filter(matches);
      if (operation === 'update') {
        if ((options.updateFailure && input.raw_payload?.manual_reply) || (options.guardReleaseFailure && input.raw_payload?.manual_guard?.state === 'released')) return { data: null, error: { code: 'DB_DOWN' } };
        if (options.updateNoRows && input.raw_payload?.manual_reply) return { data: null, error: null };
        for (const row of selected) Object.assign(row, copy(input));
      }
      if (order) selected.sort((a, b) => String(valueAt(b, order)).localeCompare(String(valueAt(a, order))));
      if (limit) selected = selected.slice(0, limit);
      return { data: selected[0] ? copy(selected[0]) : null, error: null };
    }
    const api = {
      select() { return api; }, eq(column, expected) { filters.push(['eq', column, expected]); return api; },
      gte(column, expected) { filters.push(['gte', column, expected]); return api; },
      lte(column, expected) { filters.push(['lte', column, expected]); return api; },
      order(column) { order = column; return api; }, limit(value) { limit = value; return api; },
      insert(value) { operation = 'insert'; input = value; return api; },
      update(value) { operation = 'update'; input = value; return api; },
      maybeSingle: execute, then(resolve, reject) { return execute().then(resolve, reject); },
    };
    return api;
  }
  const client = {
    auth: { async getUser() { return { data: { user: options.invalidIdentity ? null : { id: options.actor || ACTOR } }, error: null }; } },
    async rpc(name) {
      rpcs.push(name);
      if (name === 'watermelon_whatsapp_admin_status') return { data: {}, error: options.adminDenied ? { code: 'DENIED' } : null };
      if (name === 'watermelon_whatsapp_server_config') return { data: config, error: null };
      throw new Error('Unexpected RPC ' + name);
    }, from: query,
  };
  async function fetch(url, request) {
    assert.equal(url, `https://graph.facebook.com/v25.0/${PHONE}/messages`);
    assert.ok(tables.watermelon_messages.some(row => row.raw_payload?.manual_reply?.state === 'pending'), 'Durable claim must exist before Graph');
    assert.ok(tables.watermelon_messages.some(row => row.raw_payload?.manual_guard?.state === 'locked'), 'Conversation guard must exist before Graph');
    assert.equal(request.headers.Authorization, 'Bearer SYNTHETIC-SERVER-TOKEN');
    assert.equal(request.redirect, 'error', 'Do not forward this authenticated send through redirects');
    const body = JSON.parse(request.body);
    assert.equal(body.to, expectedTo); assert.equal(body.type, 'text'); assert.equal(body.text.preview_url, false);
    assert.ok(!body.template); graphCalls.push({ url, body });
    if (options.graphHook) await options.graphHook();
    if (options.networkThrows) throw new Error('SYNTHETIC-SENSITIVE-NETWORK-ERROR');
    if (options.invalidJson) return new Response('<SYNTHETIC-SENSITIVE-HTML>', { status: options.httpStatus || 200 });
    const payload = options.meta || { messages: [{ id: 'wamid.manual-1' }] };
    return Response.json(payload, { status: options.httpStatus || 200 });
  }
  vm.runInNewContext(javascript.outputText, { createClient: () => client, crypto: webcrypto,
    Request, Response, URL, TextEncoder, AbortController, setTimeout, clearTimeout, fetch,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' })[key] }, serve: fn => { handler = fn; } },
    console: { log() { throw new Error('No logging'); }, error() { throw new Error('No logging'); } },
  });
  const body = { request_id: REQUEST, text: 'Texto manual aprovado pelo operador.', idempotency_key: KEY };
  async function post(extra = {}, headers = {}, overrides = {}) {
    return handler(new Request('https://synthetic.invalid/functions/v1/watermelon-whatsapp-reply', {
      method: 'POST', headers: { authorization: 'Bearer synthetic-user', 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, ...extra }), ...overrides,
    }));
  }
  return { tables, operations, graphCalls, rpcs, post, handler, body };
}
async function rejected(runtime, expected = 403, extra = {}, headers = {}) {
  const response = await runtime.post(extra, headers);
  assert.equal(response.status, expected, await response.clone().text());
  assert.equal(runtime.graphCalls.length, 0);
  assert.equal(runtime.operations.filter(x => x.operation !== 'select').length, 0);
}

test('template-origin contact with a local PT number accepts canonical inbound proof and replies internationally', async () => {
  const tables = fixture();
  tables.watermelon_requests[0].source = 'ai_concierge';
  tables.watermelon_contacts[0].phone = '918 404 101';
  tables.watermelon_contacts[0].phone_digits = '918404101';
  const canonical = '351918404101';
  Object.assign(tables.watermelon_messages[0], { from_phone: canonical, wa_id: canonical });
  tables.watermelon_messages.push({ id: '55555555-5555-4555-8555-555555555555', request_id: REQUEST,
    contact_id: CONTACT, is_private: false, channel: 'whatsapp', direction: 'outbound',
    source: 'crm_whatsapp_manual_template', status: 'delivered', phone_number_id: PHONE,
    from_phone: BUSINESS, to_phone: canonical, wa_id: canonical,
    raw_payload: { manual_template: { state: 'submitted' } }, whatsapp_message_id: 'wamid.template' });
  const before = copy(tables.watermelon_contacts[0]);
  const r = runtime({ tables, expectedTo: canonical });
  assert.equal((await r.post()).status, 200);
  assert.equal(r.graphCalls[0].body.to, canonical);
  assert.deepEqual(tables.watermelon_contacts[0], before, 'The CRM contact is not rewritten');
});
test('manual reply normalizes explicit international destinations and refuses ambiguous or inconsistent numbers', async () => {
  for (const [phone, phoneDigits, expected] of [
    ['+44 7700 900123', '447700900123', '447700900123'],
    ['0044 7700 900123', '447700900123', '447700900123'],
    ['918 404 101', '918404101', '351918404101'],
  ]) {
    const tables = fixture(); Object.assign(tables.watermelon_contacts[0], { phone, phone_digits: phoneDigits });
    Object.assign(tables.watermelon_messages[0], { from_phone: expected, wa_id: expected });
    const r = runtime({ tables, expectedTo: expected }); assert.equal((await r.post()).status, 200);
  }
  for (const [phone, phoneDigits] of [['7700 900123', '7700900123'], ['+351918404101', '918404102'], ['918 404 101 ext 2', '9184041012']]) {
    const tables = fixture(); Object.assign(tables.watermelon_contacts[0], { phone, phone_digits: phoneDigits });
    await rejected(runtime({ tables }));
  }
});

test('manual send derives recipient and reserves one durable immutable attempt before Graph', async () => {
  const r = runtime(); const res = await r.post(); const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.delivery_verified, false); assert.equal(body.mode, 'text');
  assert.equal(r.graphCalls.length, 1); assert.equal(r.graphCalls[0].body.text.body, r.body.text);
  const stored = r.tables.watermelon_messages.find(row => row.id === KEY);
  assert.equal(stored.source, 'crm_cloud_api_manual'); assert.equal(stored.status, 'sent');
  assert.equal(stored.raw_payload.manual_reply.state, 'submitted'); assert.equal(stored.whatsapp_message_id, 'wamid.manual-1');
  assert.ok(!JSON.stringify(stored).includes('SYNTHETIC-SERVER-TOKEN'));
  const guard = r.tables.watermelon_messages.find(row => row.source === 'crm_cloud_api_manual_guard');
  assert.equal(guard.is_private, true); assert.equal(guard.text_body, null); assert.equal(guard.direction, 'outbound');
  assert.equal(guard.whatsapp_message_id, null);
  assert.equal(r.operations.filter(row => row.table === 'watermelon_activities').length, 0, 'Do not override GENERATED ALWAYS bigint activity IDs');
  assert.deepEqual(r.rpcs, ['watermelon_whatsapp_admin_status', 'watermelon_whatsapp_server_config', 'watermelon_whatsapp_server_config']);
});
test('submitted retry acknowledges original WAMID without contacting Graph again', async () => {
  const r = runtime(); await r.post(); const response = await r.post();
  assert.equal(response.status, 200); assert.equal((await response.json()).deduplicated, true);
  assert.equal(r.graphCalls.length, 1);
});
test('concurrent identical clicks make exactly one Graph request', async () => {
  const r = runtime({ graphHook: () => new Promise(resolve => setTimeout(resolve, 5)) });
  const responses = await Promise.all([r.post(), r.post(), r.post()]);
  assert.equal(r.graphCalls.length, 1); assert.ok(responses.every(x => [200, 409].includes(x.status)));
  assert.equal(r.tables.watermelon_messages.filter(row => row.id === KEY).length, 1);
});
test('concurrent different UUIDs for one request produce at most one Graph call', async () => {
  const r = runtime({ graphHook: () => new Promise(resolve => setTimeout(resolve, 5)) });
  const second = '66666666-6666-4666-8666-666666666666';
  const third = '77777777-7777-4777-8777-777777777777';
  const responses = await Promise.all([r.post(), r.post({ idempotency_key: second }), r.post({ idempotency_key: third, text: 'Outro texto explícito' })]);
  assert.equal(r.graphCalls.length, 1); assert.equal(responses.filter(x => x.status === 200).length, 1);
  assert.equal(r.tables.watermelon_messages.filter(row => row.source === 'crm_cloud_api_manual_guard').length, 1);
});
test('uncertain attempt blocks any new UUID even with a different explicit draft', async () => {
  const r = runtime({ networkThrows: true }); await r.post();
  const response = await r.post({ idempotency_key: '66666666-6666-4666-8666-666666666666', text: 'Novo rascunho' });
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT');
  assert.equal(r.graphCalls.length, 1); assert.equal(r.tables.watermelon_messages.filter(row => row.source === 'crm_cloud_api_manual').length, 1);
});
test('a delayed concurrent new UUID cannot resend the same draft after the winner releases its guard', async () => {
  let releaseRead;
  const winnerFinished = new Promise(resolve => { releaseRead = resolve; });
  const r = runtime({ graphHook: () => new Promise(resolve => setTimeout(resolve, 5)), guardReadHook: () => winnerFinished });
  const first = r.post();
  const delayed = r.post({ idempotency_key: '66666666-6666-4666-8666-666666666666' });
  assert.equal((await first).status, 200); releaseRead();
  const duplicate = await delayed;
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).deduplicated, true); assert.equal(r.graphCalls.length, 1);
});
test('same draft/proof remains deduplicated across different UUIDs and operators after submission', async () => {
  const r = runtime(); await r.post();
  const another = runtime({ tables: r.tables, actor: '88888888-8888-4888-8888-888888888888' });
  const response = await another.post({ idempotency_key: '66666666-6666-4666-8666-666666666666' });
  assert.equal(response.status, 200); assert.equal((await response.json()).deduplicated, true); assert.equal(another.graphCalls.length, 0);
});
test('released guard is atomically reacquired for only one of two new UUIDs', async () => {
  const r = runtime({ graphHook: () => new Promise(resolve => setTimeout(resolve, 5)) }); await r.post();
  const responses = await Promise.all([
    r.post({ idempotency_key: '66666666-6666-4666-8666-666666666666', text: 'Segundo rascunho' }),
    r.post({ idempotency_key: '77777777-7777-4777-8777-777777777777', text: 'Terceiro rascunho' }),
  ]);
  assert.equal(r.graphCalls.length, 2); assert.equal(responses.filter(x => x.status === 200).length, 1);
});
test('guard storage failure prevents Graph and a failed release conservatively blocks the next key', async () => {
  const failed = runtime({ guardFailure: true }); assert.equal((await failed.post()).status, 503); assert.equal(failed.graphCalls.length, 0);
  const r = runtime({ guardReleaseFailure: true }); const first = await r.post();
  assert.equal(first.status, 200); assert.equal((await first.json()).new_attempts_blocked, true);
  const next = await r.post({ idempotency_key: '66666666-6666-4666-8666-666666666666' });
  assert.equal(next.status, 409); assert.equal(r.graphCalls.length, 1);
});
test('same key cannot be rebound to changed text, actor or another request', async () => {
  const r = runtime(); await r.post();
  const changed = await r.post({ text: 'Outro texto' }); assert.equal(changed.status, 409);
  const otherRequest = '55555555-5555-4555-8555-555555555555';
  r.tables.watermelon_requests.push({ id: otherRequest, contact_id: CONTACT, is_private: false });
  assert.equal((await r.post({ request_id: otherRequest })).status, 409);
  const stored = r.tables.watermelon_messages.find(row => row.id === KEY); stored.raw_payload.manual_reply.actor_id = 'another-actor';
  assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 1);
});
test('collision with any pre-existing unrelated/private message never sends or overwrites', async () => {
  for (const privateFlag of [true, false]) {
    const tables = fixture(); tables.watermelon_messages.push({ id: KEY, source: 'cloud_api', is_private: privateFlag, text_body: 'SYNTHETIC-PRIVATE' });
    const r = runtime({ tables }); const response = await r.post();
    assert.equal(response.status, 409); assert.equal(r.graphCalls.length, 0);
    assert.equal(tables.watermelon_messages.find(row => row.id === KEY).text_body, 'SYNTHETIC-PRIVATE');
    assert.ok(!(await response.text()).includes('SYNTHETIC-PRIVATE'));
  }
});
test('authentication and admin authorization fail before configuration or database writes', async () => {
  await rejected(runtime({ invalidIdentity: true }), 401);
  const denied = runtime({ adminDenied: true }); await rejected(denied, 403);
  assert.deepEqual(denied.rpcs, ['watermelon_whatsapp_admin_status']);
  await rejected(runtime(), 401, {}, { authorization: '' });
  await rejected(runtime(), 403, {}, { origin: 'https://untrusted.invalid' });
});
test('body accepts only request/text/idempotency UUIDv4 and never browser-supplied recipient/account/template', async () => {
  for (const extra of [{ to: '351918404101' }, { phone_number_id: '874910289048462' }, { waba_id: WABA },
    { template: 'old' }, { purpose: 'payment' }, { access_token: 'SYNTHETIC-CLIENT-TOKEN' },
    { idempotency_key: 'not-a-uuid' }, { request_id: 'anything' }, { text: '' }, { text: ' ' }, { text: 'x'.repeat(4001) }]) {
    await rejected(runtime(), 400, extra);
  }
});
test('any wrong dedicated account field blocks all sends', async () => {
  for (const config of [{ business_phone: '+351918404101' }, { phone_number_id: '874910289048462' }, { waba_id: '1785473568789104' }, { access_token: '' }]) await rejected(runtime({ config }), 409);
});
test('request/contact privacy must be explicitly false, never null or missing', async () => {
  for (const table of ['watermelon_requests', 'watermelon_contacts']) for (const flag of [true, null, undefined]) {
    const tables = fixture(); tables[table][0].is_private = flag; await rejected(runtime({ tables }));
  }
});
test('service window requires a non-private inbound in this request/contact and dedicated endpoint', async () => {
  for (const patch of [{ request_id: 'legacy-request' }, { contact_id: 'another-contact' }, { phone_number_id: '874910289048462' },
    { is_private: true }, { is_private: null }, { is_private: undefined }, { source: 'crm_cloud_api' }, { status: 'sent' },
    { direction: 'outbound' }, { channel: 'email' }, { from_phone: BUSINESS }, { to_phone: '351918404101' }, { wa_id: 'another-person' },
    { whatsapp_message_id: null }, { whatsapp_timestamp: new Date(Date.now() - 25 * 3600_000).toISOString() },
    { whatsapp_timestamp: new Date(Date.now() + 3600_000).toISOString() }, { whatsapp_timestamp: null }, { whatsapp_timestamp: 'invalid' }]) {
    const tables = fixture(); Object.assign(tables.watermelon_messages[0], patch); await rejected(runtime({ tables }), 409);
  }
});
test('a recent old-personal conversation cannot open the service window or create a queue', async () => {
  const tables = fixture(); tables.watermelon_messages[0].phone_number_id = '874910289048462';
  await rejected(runtime({ tables }), 409);
});
test('an internal guard cannot open a service window even with an incorrect privacy flag', async () => {
  for (const privateFlag of [true, false]) {
    const tables = fixture(); tables.watermelon_messages[0].source = 'crm_cloud_api_manual_guard';
    tables.watermelon_messages[0].is_private = privateFlag;
    await rejected(runtime({ tables }), 409);
  }
});
test('read or claim persistence failure prevents all Graph calls', async () => {
  await rejected(runtime({ lookupFailure: true }), 503);
  const r = runtime({ claimFailure: true }); assert.equal((await r.post()).status, 503); assert.equal(r.graphCalls.length, 0);
});
test('timeout, bad JSON, server error and missing WAMID stay uncertain and cannot auto-retry', async () => {
  for (const options of [{ networkThrows: true }, { invalidJson: true }, { httpStatus: 503, meta: { error: { code: 2, message: 'SYNTHETIC-SENSITIVE-META' } } },
    { meta: {} }, { meta: { messages: [{ id: ' ' }] } }, { meta: { messages: [{ id: 'not-wamid' }] } }, { httpStatus: 400, meta: {} }]) {
    const r = runtime(options); const response = await r.post();
    assert.equal(response.status, 409); assert.equal((await response.json()).retry_allowed, false);
    const stored = r.tables.watermelon_messages.find(row => row.id === KEY); assert.equal(stored.raw_payload.manual_reply.state, 'unknown');
    assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 1);
    assert.ok(!JSON.stringify(stored).includes('SYNTHETIC-SENSITIVE'));
  }
});
test('definitive Meta rejection exposes only finite numeric diagnostics and consumes the key', async () => {
  const r = runtime({ httpStatus: 400, meta: { error: { code: 131047, error_subcode: 123, message: 'SYNTHETIC-SENSITIVE-META', error_data: { token: 'SYNTHETIC-SENSITIVE' } } } });
  const response = await r.post(); const body = await response.json();
  assert.equal(body.code, 'META_REPLY_REJECTED'); assert.equal(body.meta_code, 131047); assert.equal(body.meta_subcode, 123);
  assert.ok(!JSON.stringify(body).includes('SYNTHETIC-SENSITIVE'));
  assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 1);
  assert.equal(r.tables.watermelon_messages.find(row => row.id === KEY).raw_payload.manual_reply.state, 'rejected');
  // A deliberate new key can retry after a definitive rejection; the old key never sends twice.
  await r.post({ idempotency_key: '66666666-6666-4666-8666-666666666666' });
  assert.equal(r.graphCalls.length, 2);
});
test('accepted Graph message followed by failed/no-row DB update keeps the durable key consumed', async () => {
  for (const options of [{ updateFailure: true }, { updateNoRows: true }]) {
    const r = runtime(options); const response = await r.post(); assert.equal(response.status, 409);
    assert.equal((await r.post()).status, 409); assert.equal(r.graphCalls.length, 1);
    assert.equal(r.tables.watermelon_messages.filter(row => row.id === KEY).length, 1);
  }
});
test('privacy, recipient, proof or configuration changes while claiming cancel before Graph', async () => {
  for (const change of [
    (tables) => { tables.watermelon_requests[0].is_private = true; },
    (tables) => { tables.watermelon_requests[0].contact_id = 'another-contact'; },
    (tables) => { tables.watermelon_contacts[0].is_private = true; },
    (tables) => { tables.watermelon_contacts[0].phone_digits = '351900000099'; },
    (tables) => { tables.watermelon_messages[0].is_private = true; },
    (tables) => { tables.watermelon_messages[0].whatsapp_timestamp = new Date(Date.now() - 25 * 3600_000).toISOString(); },
    (tables, config) => { config.phone_number_id = '874910289048462'; },
  ]) {
    const r = runtime({ claimHook: change }); const response = await r.post();
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'MANUAL_REPLY_ASSOCIATION_CHANGED');
    assert.equal(r.graphCalls.length, 0);
    assert.equal(r.tables.watermelon_messages.find(row => row.id === KEY).raw_payload.manual_reply.state, 'rejected');
  }
});

