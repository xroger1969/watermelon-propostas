const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/watermelon-whatsapp-initiate-template/index.ts'), 'utf8');
const javascript = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
});
assert.deepEqual(javascript.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error), []);
const REQUEST = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const SECOND_KEY = '66666666-6666-4666-8666-666666666666';
const THIRD_KEY = '77777777-7777-4777-8777-777777777777';
const TO = '351900000001';
const BUSINESS = '351965637736';
const PHONE = '1423415737522090';
const WABA = '4408982439363483';
const SOURCE = 'crm_whatsapp_manual_template';
const GUARD_SOURCE = 'crm_cloud_api_manual_guard';
const BODY = 'Hello. We received your request at Watermelon Experiences and are preparing your proposal. Please reply to this message so we can continue assisting you with your request.';
const copy = value => structuredClone(value);
function approvedTemplate(extra = {}) {
  return { id: 'template-1', name: 'watermelon_request_received', language: 'en_US', status: 'APPROVED', category: 'UTILITY',
    components: [{ type: 'BODY', text: BODY }], ...extra };
}
function fixture() {
  return {
    watermelon_requests: [{ id: REQUEST, contact_id: CONTACT, is_private: false, source: 'ai_concierge', status: 'proposal_sent', updated_at: '2026-10-31T00:00:00.000Z' }],
    watermelon_contacts: [{ id: CONTACT, name: 'Synthetic traveller', phone_digits: TO, phone: '+' + TO, is_private: false }],
    watermelon_messages: [], watermelon_activities: [],
  };
}
function inbound(extra = {}) {
  return { id: 'inbound-1', request_id: REQUEST, contact_id: CONTACT, is_private: false, channel: 'whatsapp',
    direction: 'inbound', source: 'cloud_api', status: 'received', phone_number_id: PHONE,
    from_phone: TO, to_phone: BUSINESS, wa_id: TO, whatsapp_message_id: 'wamid.inbound',
    whatsapp_timestamp: new Date(Date.now() - 60_000).toISOString(), ...extra };
}
function guardId() {
  const hash = createHash('sha256').update(`manual-reply-guard:${REQUEST}:${CONTACT}:${PHONE}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function unresolvedManualGuard(state) {
  return { id: guardId(), request_id: REQUEST, contact_id: CONTACT, phone_number_id: PHONE, source: GUARD_SOURCE,
    is_private: true, direction: 'outbound', channel: 'whatsapp', status: 'failed', text_body: null, whatsapp_message_id: null,
    raw_payload: { manual_guard: { state, idempotency_key: THIRD_KEY, operation_hash: 'synthetic-old-manual-hash' } } };
}
function valueAt(row, column) {
  return column.includes('->') ? column.split(/->>?/).reduce((value, key) => value?.[key], row) : row[column];
}
function runtime(options = {}) {
  const tables = options.tables || fixture();
  const config = { business_phone: '+' + BUSINESS, phone_number_id: PHONE, waba_id: WABA,
    access_token: 'SYNTHETIC-SERVER-TOKEN', ...options.config };
  const templates = options.templates || [approvedTemplate()];
  const expectedTo = options.expectedTo || TO;
  const operations = [], graphReads = [], graphPosts = [], rpcs = [];
  let handler;
  function query(table) {
    assert.ok(['watermelon_requests', 'watermelon_contacts', 'watermelon_messages', 'watermelon_activities'].includes(table));
    const filters = [], orders = [];
    let operation = 'select', input, limit, single = false, columns = '*', wantsRows = false;
    const matches = row => filters.every(([type, column, expected]) => {
      const value = valueAt(row, column);
      return type === 'eq' ? value === expected : type === 'neq' ? value !== expected :
        type === 'in' ? expected.includes(value) : type === 'gte' ? value >= expected : value <= expected;
    });
    function project(row) {
      if (columns === '*') return copy(row);
      return Object.fromEntries(columns.split(',').map(x => x.trim()).filter(Boolean).map(key => [key, copy(valueAt(row, key))]));
    }
    async function execute() {
      const rows = tables[table] ||= [];
      operations.push({ table, operation, filters: copy(filters), input: copy(input) });
      if (options.lookupFailure && operation === 'select') return { data: null, error: { code: 'DB_DOWN' } };
      if (options.guardReadHook && operation === 'select' && filters.some(x => x[1] === 'source' && x[2] === GUARD_SOURCE)) await options.guardReadHook();
      if (operation === 'insert') {
        if (table === 'watermelon_activities' && input.id !== undefined) throw new Error('Schema: activity IDs are GENERATED ALWAYS bigint');
        if (table === 'watermelon_messages') {
          assert.match(input.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          assert.ok(['received', 'sent', 'delivered', 'read', 'failed', 'deleted'].includes(input.status));
        }
        if (options.guardFailure && input.source === GUARD_SOURCE) return { data: null, error: { code: 'DB_DOWN' } };
        if (options.claimFailure && input.source === SOURCE) return { data: null, error: { code: 'DB_DOWN' } };
        if (input.id && rows.some(row => row.id === input.id)) return { data: null, error: { code: '23505' } };
        const row = { created_at: new Date().toISOString(), ...(table === 'watermelon_activities' ? { id: rows.length + 1 } : {}), ...copy(input) };
        rows.push(row); // Atomic PK reservation: no await between uniqueness check and insert.
        if (options.claimHook && input.source === SOURCE) options.claimHook(tables, config, templates);
        const data = wantsRows ? [project(row)] : null;
        return { data: single ? data?.[0] || null : data, error: null };
      }
      let selected = rows.filter(matches);
      if (operation === 'update') {
        if ((options.updateFailure && input.raw_payload?.manual_template) ||
          (options.guardReleaseFailure && input.raw_payload?.manual_guard?.state === 'released') ||
          (options.requestStatusFailure && table === 'watermelon_requests')) return { data: null, error: { code: 'DB_DOWN' } };
        if ((options.updateNoRows && input.raw_payload?.manual_template) ||
          (options.requestStatusNoRows && table === 'watermelon_requests')) selected = [];
        for (const row of selected) Object.assign(row, copy(input));
      }
      for (const [column, ascending] of orders.reverse()) selected.sort((a, b) => {
        const compared = String(valueAt(a, column)).localeCompare(String(valueAt(b, column)));
        return ascending ? compared : -compared;
      });
      if (limit) selected = selected.slice(0, limit);
      const data = selected.map(project);
      return { data: single ? data[0] || null : data, error: null };
    }
    const api = {
      select(value = '*') { columns = value; wantsRows = true; return api; },
      eq(column, expected) { filters.push(['eq', column, expected]); return api; },
      neq(column, expected) { filters.push(['neq', column, expected]); return api; },
      in(column, expected) { filters.push(['in', column, expected]); return api; },
      gte(column, expected) { filters.push(['gte', column, expected]); return api; },
      lte(column, expected) { filters.push(['lte', column, expected]); return api; },
      order(column, opts = {}) { orders.push([column, opts.ascending === true]); return api; }, limit(value) { limit = value; return api; },
      insert(value) { operation = 'insert'; input = value; return api; },
      update(value) { operation = 'update'; input = value; return api; },
      maybeSingle() { single = true; return execute(); }, single() { single = true; return execute(); },
      then(resolve, reject) { return execute().then(resolve, reject); },
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
  async function fetch(url, request = {}) {
    const endpoint = new URL(String(url));
    assert.equal(endpoint.origin, 'https://graph.facebook.com');
    assert.equal(request.headers.Authorization, 'Bearer SYNTHETIC-SERVER-TOKEN');
    if (endpoint.pathname === `/v25.0/${WABA}/message_templates`) {
      assert.ok(!request.method || request.method === 'GET');
      graphReads.push({ url: String(url) });
      if (options.catalogHook) await options.catalogHook(graphReads.length, templates);
      if (options.catalogFailure) return Response.json({ error: { code: 200, message: 'SYNTHETIC-SENSITIVE-CATALOG' } }, { status: 403 });
      return Response.json({ data: copy(templates) });
    }
    assert.equal(endpoint.pathname, `/v25.0/${PHONE}/messages`); assert.equal(request.method, 'POST');
    assert.ok(tables.watermelon_messages.some(row => row.source === SOURCE && row.raw_payload?.manual_template?.state === 'pending'), 'Durable template claim must precede sending');
    assert.ok(tables.watermelon_messages.some(row => row.source === GUARD_SOURCE && row.is_private === true && row.raw_payload?.manual_guard?.state === 'locked'), 'Manual/template shared guard must be held');
    assert.equal(request.redirect, 'error');
    const body = JSON.parse(request.body);
    assert.equal(body.to, expectedTo); assert.equal(body.type, 'template'); assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.template.name, 'watermelon_request_received'); assert.equal(body.template.language.code, 'en_US');
    assert.ok(!body.text && !body.template.components, 'The approved static body cannot be overridden with free text or parameters');
    graphPosts.push({ url: String(url), body });
    if (options.graphHook) await options.graphHook();
    if (options.networkThrows) throw new Error('SYNTHETIC-SENSITIVE-NETWORK');
    if (options.invalidJson) return new Response('<SYNTHETIC-SENSITIVE-HTML>', { status: options.httpStatus || 200 });
    return Response.json(options.meta || { messages: [{ id: 'wamid.template-1' }] }, { status: options.httpStatus || 200 });
  }
  vm.runInNewContext(javascript.outputText, { createClient: () => client, crypto: webcrypto,
    Request, Response, URL, TextEncoder, AbortController, setTimeout, clearTimeout, fetch,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' })[key] }, serve: fn => { handler = fn; } },
    console: { log() { throw new Error('No logging'); }, error() { throw new Error('No logging'); } },
  });
  const body = { request_id: REQUEST, template_name: 'watermelon_request_received', language: 'en_US', client_attempt_id: KEY, consent_confirmed: true };
  const endpoint = 'https://synthetic.invalid/functions/v1/watermelon-whatsapp-initiate-template';
  async function post(extra = {}, headers = {}, overrides = {}) {
    return handler(new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer synthetic-user', 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, ...extra }), ...overrides }));
  }
  async function get(requestId = REQUEST, headers = {}) {
    return handler(new Request(endpoint + '?request_id=' + encodeURIComponent(requestId), {
      method: 'GET', headers: { authorization: 'Bearer synthetic-user', ...headers } }));
  }
  return { tables, config, templates, operations, graphReads, graphPosts, rpcs, post, get, handler, body };
}
async function rejected(r, extra = {}, expected) {
  const response = await r.post(extra);
  if (expected) assert.equal(response.status, expected, await response.clone().text());
  else assert.ok(response.status >= 400, await response.clone().text());
  assert.equal(r.graphPosts.length, 0);
  assert.equal(r.operations.filter(x => x.operation !== 'select').length, 0);
  return response;
}

test('GET shows only approved static utility bodies and performs no send or write', async () => {
  const r = runtime({ templates: [approvedTemplate(),
    approvedTemplate({ id: 'pending', name: 'pending', status: 'PENDING' }),
    approvedTemplate({ id: 'marketing', name: 'marketing', category: 'MARKETING' }),
    approvedTemplate({ id: 'params', name: 'params', components: [{ type: 'BODY', text: 'Hello {{1}}' }] }),
    approvedTemplate({ id: 'header', name: 'header', components: [{ type: 'HEADER', text: 'Header' }, { type: 'BODY', text: BODY }] }),
    approvedTemplate({ id: 'footer', name: 'footer', components: [{ type: 'BODY', text: BODY }, { type: 'FOOTER', text: 'Footer' }] }),
    approvedTemplate({ id: 'buttons', name: 'buttons', components: [{ type: 'BODY', text: BODY }, { type: 'BUTTONS', buttons: [] }] }),
  ] });
  const response = await r.get(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.eligible, true); assert.equal(data.requires_consent_confirmation, true);
  assert.equal(data.templates.length, 1); assert.equal(data.templates[0].body, BODY); assert.equal(data.templates[0].name, 'watermelon_request_received');
  assert.equal(r.graphPosts.length, 0); assert.equal(r.operations.filter(x => x.operation !== 'select').length, 0);
  assert.ok(!JSON.stringify(data).includes('SYNTHETIC-SERVER-TOKEN'));
});
test('manual template derives recipient and stores exact approved body plus operator consent audit', async () => {
  const r = runtime(); const response = await r.post(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.mode, 'template'); assert.equal(data.queued, false); assert.equal(data.delivery_verified, false);
  assert.equal(r.graphPosts.length, 1);
  const stored = r.tables.watermelon_messages.find(row => row.id === KEY);
  assert.equal(stored.source, SOURCE); assert.equal(stored.phone_number_id, PHONE); assert.equal(stored.to_phone, TO);
  assert.equal(stored.request_id, REQUEST); assert.equal(stored.contact_id, CONTACT); assert.equal(stored.text_body, BODY); assert.equal(stored.status, 'sent');
  assert.equal(stored.raw_payload.manual_template.state, 'submitted'); assert.equal(stored.raw_payload.manual_template.actor_id, ACTOR);
  const consent = stored.raw_payload.manual_template.consent;
  assert.equal(consent.confirmed, true); assert.equal(consent.method, 'operator_confirmation'); assert.equal(consent.actor_id, ACTOR);
  assert.ok(Number.isFinite(new Date(consent.confirmed_at).getTime()));
  assert.ok(!JSON.stringify(stored).includes('SYNTHETIC-SERVER-TOKEN'));
  const guard = r.tables.watermelon_messages.find(row => row.source === GUARD_SOURCE);
  assert.equal(guard.id, guardId()); assert.equal(guard.is_private, true); assert.equal(guard.text_body, null); assert.equal(guard.whatsapp_message_id, null);
  assert.equal(r.tables.watermelon_requests[0].status, 'awaiting_customer');
});
test('Portuguese mobile local formatting and explicit international prefixes normalize without changing the contact', async () => {
  for (const [phone, phoneDigits, expected] of [
    ['900 000 001', '900000001', TO], ['900000001', '900000001', TO],
    ['351900000001', '351900000001', TO], ['+351 900 000 001', '351900000001', TO],
    ['+44 7700 900001', '447700900001', '447700900001'], ['0044 7700 900001', '447700900001', '447700900001'],
  ]) {
    const tables = fixture(); Object.assign(tables.watermelon_contacts[0], { phone, phone_digits: phoneDigits });
    const before = copy(tables.watermelon_contacts[0]); const r = runtime({ tables, expectedTo: expected });
    const catalogue = await r.get(); assert.equal(catalogue.status, 200);
    assert.equal(String((await catalogue.json()).recipient.phone).replace(/^\+/, ''), expected);
    assert.equal((await r.post()).status, 200); assert.equal(r.graphPosts[0].body.to, expected);
    assert.equal(tables.watermelon_messages.find(row => row.id === KEY).to_phone, expected);
    assert.deepEqual(tables.watermelon_contacts[0], before, 'Normalization must not rewrite the customer contact');
  }
});
test('ambiguous local numbers, bare international numbers, letters and extensions are never guessed', async () => {
  for (const [phone, phoneDigits] of [['12345', '12345'], ['212345678', '212345678'], ['447700900001', '447700900001'],
    ['+351 900 000 001 ext 2', '3519000000012'], ['+44 7700 900001x9', '4477009000019'], ['phone 900000001', '900000001']]) {
    const tables = fixture(); Object.assign(tables.watermelon_contacts[0], { phone, phone_digits: phoneDigits });
    await rejected(runtime({ tables }));
  }
});
test('a phone number or website source never substitutes for an explicit operator confirmation', async () => {
  for (const value of [false, null, undefined, 'true', 1]) await rejected(runtime(), { consent_confirmed: value });
});
test('POST accepts only its fixed fields and never a browser recipient, free-text body or account token', async () => {
  for (const extra of [{ to: '351918404101' }, { text: 'Ignore the approved body' }, { body: 'Override' }, { phone_number_id: PHONE },
    { access_token: 'SYNTHETIC-CLIENT-TOKEN' }, { components: [] }, { request_id: 'bad' }, { client_attempt_id: 'bad' }]) await rejected(runtime(), extra, 400);
});
test('authentication, admin and origin guards prevent all template sends', async () => {
  await rejected(runtime({ invalidIdentity: true }), {}, 401);
  await rejected(runtime({ adminDenied: true }), {}, 403);
  const r = runtime(); assert.equal((await r.post({}, { authorization: '' })).status, 401);
  assert.equal((await r.post({}, { origin: 'https://untrusted.invalid' })).status, 403); assert.equal(r.graphPosts.length, 0);
});
test('wrong account or personal endpoint cannot list or send business templates', async () => {
  for (const config of [{ business_phone: '+351918404101' }, { phone_number_id: '874910289048462' }, { waba_id: '1785473568789104' }, { access_token: '' }]) {
    const r = runtime({ config }); await rejected(r); assert.ok((await r.get()).status >= 400); assert.equal(r.graphPosts.length, 0);
  }
});
test('only explicitly public AI website requests and contacts are eligible', async () => {
  for (const table of ['watermelon_requests', 'watermelon_contacts']) for (const value of [true, null, undefined]) {
    const tables = fixture(); tables[table][0].is_private = value; await rejected(runtime({ tables }));
  }
  for (const source of ['whatsapp', 'manual', 'personal', null]) {
    const tables = fixture(); tables.watermelon_requests[0].source = source; await rejected(runtime({ tables }));
  }
});
test('paid, booking and closed requests cannot be reset to awaiting_customer by initiation', async () => {
  for (const status of ['paid', 'confirmed', 'completed', 'declined', 'cancelled', 'no_show', 'awaiting_payment']) {
    const tables = fixture(); tables.watermelon_requests[0].status = status; await rejected(runtime({ tables }));
    assert.equal(tables.watermelon_requests[0].status, status);
  }
});
test('a dedicated inbound already associated with this request requires the reply flow', async () => {
  const tables = fixture(); tables.watermelon_messages.push(inbound());
  const response = await rejected(runtime({ tables })); assert.equal((await response.json()).code, 'USE_REPLY_ENDPOINT');
});
test('historical personal messages and private guards do not authorize or imply an existing business window', async () => {
  const tables = fixture(); tables.watermelon_messages.push(inbound({ phone_number_id: '874910289048462', is_private: true }), unresolvedManualGuard('unknown'));
  const r = runtime({ tables }); const response = await r.post();
  assert.ok(response.status >= 400); assert.equal(r.graphPosts.length, 0); // Unknown shared guard still blocks sending.
});
test('unapproved, variable, non-utility or incompatible templates cannot be sent even if selected by name', async () => {
  for (const template of [approvedTemplate({ status: 'PENDING' }), approvedTemplate({ status: 'REJECTED' }),
    approvedTemplate({ category: 'MARKETING' }), approvedTemplate({ components: [{ type: 'BODY', text: 'Hello {{name}}' }] }),
    approvedTemplate({ components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: BODY }] }),
    approvedTemplate({ components: [{ type: 'BODY', text: BODY }, { type: 'BUTTONS', buttons: [] }] })]) {
    await rejected(runtime({ templates: [template] }));
  }
  await rejected(runtime(), { template_name: 'not_in_catalogue' });
  await rejected(runtime(), { language: 'pt_PT' });
});
test('POST revalidates the live approval instead of trusting a prior GET catalogue', async () => {
  const r = runtime(); assert.equal((await r.get()).status, 200); r.templates[0].status = 'PAUSED';
  await rejected(r); assert.equal(r.graphPosts.length, 0);
});
test('approval, body and language changes after reservation stop the send before Meta transmission', async () => {
  for (const mutate of [templates => { templates[0].status = 'PAUSED'; },
    templates => { templates[0].components[0].text = 'An approved body changed while the operator was sending.'; },
    templates => { templates[0].language = 'pt_PT'; }]) {
    const r = runtime({ claimHook: (_tables, _config, templates) => mutate(templates) });
    const response = await r.post(); assert.equal(response.status, 409); assert.equal(r.graphPosts.length, 0);
    assert.equal(r.tables.watermelon_messages.find(row => row.id === KEY).raw_payload.manual_template.state, 'rejected');
  }
});
test('catalogue transport errors do not create claims or expose the upstream error payload', async () => {
  const r = runtime({ catalogFailure: true }); const response = await r.post();
  assert.ok(response.status >= 400); assert.ok(!(await response.text()).includes('SYNTHETIC-SENSITIVE'));
  assert.equal(r.graphPosts.length, 0); assert.equal(r.operations.filter(x => x.operation !== 'select').length, 0);
});
test('same successful attempt and different UUIDs return the existing first-contact WAMID without another send', async () => {
  const r = runtime(); await r.post();
  const same = await r.post(); const another = await r.post({ client_attempt_id: SECOND_KEY });
  assert.equal(same.status, 200); assert.equal(another.status, 200);
  assert.equal((await another.json()).deduplicated, true); assert.equal(r.graphPosts.length, 1);
  assert.equal(r.tables.watermelon_messages.filter(row => row.source === SOURCE).length, 1);
});
test('an attempt key cannot be reassigned to another payload, operator, request or recipient', async () => {
  for (const mutate of [row => { row.raw_payload.manual_template.template_name = 'another_template'; },
    row => { row.raw_payload.manual_template.language = 'pt_PT'; },
    row => { row.raw_payload.manual_template.actor_id = THIRD_KEY; },
    row => { row.request_id = THIRD_KEY; }, row => { row.contact_id = THIRD_KEY; },
    row => { row.to_phone = '351900000099'; }, row => { row.phone_number_id = '874910289048462'; }]) {
    const r = runtime(); assert.equal((await r.post()).status, 200);
    mutate(r.tables.watermelon_messages.find(row => row.id === KEY));
    const response = await r.post(); assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'IDEMPOTENCY_KEY_REUSED'); assert.equal(r.graphPosts.length, 1);
  }
});
test('concurrent distinct UUIDs cannot initiate the same request twice', async () => {
  const r = runtime({ graphHook: () => new Promise(resolve => setTimeout(resolve, 5)) });
  const responses = await Promise.all([r.post(), r.post({ client_attempt_id: SECOND_KEY }), r.post({ client_attempt_id: THIRD_KEY })]);
  assert.ok(responses.every(response => [200, 409].includes(response.status))); assert.equal(r.graphPosts.length, 1);
});
test('a delayed guard read after the first submission cannot admit a second first-contact attempt', async () => {
  let releaseRead, graphStarted, finishGraph;
  const release = new Promise(resolve => { releaseRead = resolve; });
  const started = new Promise(resolve => { graphStarted = resolve; });
  const holdGraph = new Promise(resolve => { finishGraph = resolve; });
  const r = runtime({ graphHook: async () => { graphStarted(); await holdGraph; }, guardReadHook: () => release });
  const first = r.post(); await started;
  const second = r.post({ client_attempt_id: SECOND_KEY }); finishGraph();
  assert.equal((await first).status, 200); releaseRead();
  const response = await second; assert.ok([200, 409].includes(response.status)); assert.equal(r.graphPosts.length, 1);
});
test('pending or unknown manual-free-reply guards block template initiation across endpoints', async () => {
  for (const state of ['locked', 'unknown']) {
    const tables = fixture(); tables.watermelon_messages.push(unresolvedManualGuard(state));
    const r = runtime({ tables }); const response = await r.post();
    assert.equal(response.status, 409); assert.equal(r.graphPosts.length, 0);
    assert.equal(tables.watermelon_messages.filter(row => row.source === SOURCE).length, 0);
  }
});
test('unknown Meta outcome consumes the attempt and blocks a different UUID without leaking payloads', async () => {
  for (const options of [{ networkThrows: true }, { invalidJson: true }, { httpStatus: 503, meta: { error: { code: 2, message: 'SYNTHETIC-SENSITIVE-META' } } },
    { meta: {} }, { meta: { messages: [{ id: ' ' }] } }]) {
    const r = runtime(options); const response = await r.post();
    assert.ok(response.status >= 400); assert.ok(!(await response.text()).includes('SYNTHETIC-SENSITIVE'));
    const stored = r.tables.watermelon_messages.find(row => row.id === KEY); assert.equal(stored.raw_payload.manual_template.state, 'unknown');
    assert.equal((await r.post({ client_attempt_id: SECOND_KEY })).status, 409); assert.equal(r.graphPosts.length, 1);
    assert.ok(!JSON.stringify(stored).includes('SYNTHETIC-SENSITIVE'));
  }
});
test('definitive Meta rejection preserves only numeric diagnostics and never retries the same attempt', async () => {
  const r = runtime({ httpStatus: 400, meta: { error: { code: 131047, error_subcode: 123, message: 'SYNTHETIC-SENSITIVE-META' } } });
  const response = await r.post(); const data = await response.json();
  assert.ok(response.status >= 400); assert.equal(data.meta_code, 131047); assert.equal(data.meta_subcode, 123);
  assert.ok(!JSON.stringify(data).includes('SYNTHETIC-SENSITIVE')); assert.equal((await r.post()).status, 409); assert.equal(r.graphPosts.length, 1);
});
test('guard or claim persistence failure prevents sending to Meta', async () => {
  for (const options of [{ guardFailure: true }, { claimFailure: true }, { lookupFailure: true }]) {
    const r = runtime(options); assert.ok((await r.post()).status >= 400); assert.equal(r.graphPosts.length, 0);
  }
});
test('accepted Meta message with failed claim finalization remains uncertain and cannot resend with a new key', async () => {
  for (const options of [{ updateFailure: true }, { updateNoRows: true }]) {
    const r = runtime(options); assert.ok((await r.post()).status >= 400);
    assert.equal((await r.post({ client_attempt_id: SECOND_KEY })).status, 409); assert.equal(r.graphPosts.length, 1);
  }
});
test('failure of the secondary request-status CAS cannot turn a saved submission into a resend', async () => {
  for (const options of [{ requestStatusFailure: true }, { requestStatusNoRows: true }]) {
    const r = runtime(options); const response = await r.post(); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.request_association_pending, true);
    assert.equal(r.tables.watermelon_messages.find(row => row.id === KEY).raw_payload.manual_template.state, 'submitted');
    await r.post({ client_attempt_id: SECOND_KEY }); assert.equal(r.graphPosts.length, 1);
  }
});
test('an inbound concurrent with Graph cannot regress a freshly updated workflow status', async () => {
  const tables = fixture(); tables.watermelon_requests[0].status = 'customer_replied';
  const r = runtime({ tables, graphHook: () => {
    tables.watermelon_requests[0].updated_at = '2026-10-31T01:00:00.000Z';
    tables.watermelon_messages.push(inbound());
  } });
  const response = await r.post(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.request_association_pending, true);
  assert.equal(tables.watermelon_requests[0].status, 'customer_replied');
  assert.equal(r.graphPosts.length, 1);
});
test('privacy, recipient or request eligibility changes during the claim cancel before transmission', async () => {
  for (const change of [tables => { tables.watermelon_requests[0].is_private = true; },
    tables => { tables.watermelon_contacts[0].is_private = true; },
    tables => { tables.watermelon_contacts[0].phone = '+351900000099'; tables.watermelon_contacts[0].phone_digits = '351900000099'; },
    tables => { tables.watermelon_requests[0].source = 'personal'; },
    tables => { tables.watermelon_requests[0].status = 'paid'; },
    tables => { tables.watermelon_messages.push(inbound()); },
    (tables, config) => { config.phone_number_id = '874910289048462'; }]) {
    const r = runtime({ claimHook: change }); assert.ok((await r.post()).status >= 400); assert.equal(r.graphPosts.length, 0);
  }
});
