const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../components/WhatsAppConversation.tsx'), 'utf8');
const helper = source.match(/function approvedStaticTemplate\([\s\S]*?\n\}/)?.[0];
const loadFunction = source.match(/  async function loadTemplateCatalogue\(\) \{[\s\S]*?\n  \}\n/)?.[0];
const sendFunction = source.match(/  async function sendInitiationTemplate\(\) \{[\s\S]*?\n  \}\n/)?.[0];
const derived = source.match(/  const serverUncertain = [\s\S]*?\n  const templateAlreadySubmitted = [\s\S]*?;\n/)?.[0];
const windowDerived = source.match(/  const recentInbound = [\s\S]*?\n  const serviceWindowOpen = [\s\S]*?;\n/)?.[0];
assert.ok(helper && loadFunction && sendFunction && derived && windowDerived, 'Exercise actual component functions and predicates');
function compile(text, jsx = ts.JsxEmit.React) {
  const result = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx }, reportDiagnostics: true });
  assert.deepEqual((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  return result.outputText;
}
const javascript = compile(helper + '\n' + loadFunction + sendFunction + '\napi.load = loadTemplateCatalogue; api.send = sendInitiationTemplate; api.accepts = approvedStaticTemplate;\napi.derive = () => {\n' + derived + '\nreturn {serverUncertain,manualReplyUncertain,currentCatalogue,selectedTemplate,templateAlreadySubmitted};\n};\napi.window = () => {\n' + windowDerived + '\nreturn serviceWindowOpen;\n};');
const approved = { id: 'synthetic-template', name: 'watermelon_request_received', language: 'en_US', body: 'We received your Watermelon request.', status: 'APPROVED', category: 'UTILITY' };
const catalogue = extra => ({ ok: true, eligible: true, eligibility_code: 'ELIGIBLE', requires_consent_confirmation: true,
  recipient: { name: 'Canonical server recipient', phone: '+351900000001' }, templates: [approved], ...extra });
const submitted = () => ({ data: { ok: true, code: 'TEMPLATE_SUBMITTED', state: 'submitted', mode: 'template', queued: false, delivery_verified: false }, error: null });

function harness(results = []) {
  const calls = [], feedback = [];
  let uuids = 0, refreshes = 0;
  const context = {
    api: {}, request: { id: '11111111-1111-4111-8111-111111111111', contact: { phone: '918404101', name: 'Local contact' } },
    draft: 'Rascunho que não pode entrar numa fila automática.', messages: [], templateCatalogue: null, currentCatalogue: null,
    selectedTemplateKey: '', selectedTemplate: null, templateConsent: false, templateLoading: false, sending: false,
    unconfirmedAttemptKey: '', templateUnconfirmedAttemptKey: '', manualAttemptRef: { current: null }, templateAttemptRef: { current: null },
    serverUncertain: false, manualReplyUncertain: false, templateAlreadySubmitted: false, serviceWindowRequiredForInbound: null,
    MANUAL_REPLY_SOURCE: 'crm_cloud_api_manual', TEST_REPLY_SOURCE: 'crm_cloud_api_controlled_test', MANUAL_TEMPLATE_SOURCE: 'crm_whatsapp_manual_template',
    crypto: { randomUUID() { return '22222222-2222-4222-8222-' + String(++uuids).padStart(12, '0'); } }, Response, encodeURIComponent,
    supabase: { functions: { async invoke(endpoint, request) {
      calls.push({ endpoint, request: structuredClone(request) });
      const result = results.shift(); if (result instanceof Error) throw result;
      return result || (request.method === 'GET' ? { data: catalogue(), error: null } : submitted());
    } } },
    setTemplateCatalogue(value) { context.templateCatalogue = value; },
    setTemplateLoading(value) { context.templateLoading = value; },
    setSelectedTemplateKey(value) { context.selectedTemplateKey = value; },
    setTemplateConsent(value) { context.templateConsent = value; },
    setTemplateUnconfirmedAttemptKey(value) { context.templateUnconfirmedAttemptKey = value; },
    setSending(value) { context.sending = value; }, setFeedback(value) { feedback.push(value); }, async onChanged() { refreshes++; },
  };
  vm.runInNewContext(javascript, context);
  const derive = () => Object.assign(context, context.api.derive());
  async function load() { derive(); await context.api.load(); derive(); }
  async function send() { derive(); await context.api.send(); derive(); }
  return { context, calls, feedback, load, send, derive, get uuidCalls() { return uuids; }, get refreshes() { return refreshes; } };
}

test('catalogue is loaded only by explicit GET and filters to approved utility static BODY templates', async () => {
  const h = harness([{ data: catalogue({ templates: [approved,
    { ...approved, id: 'pending', status: 'PENDING' }, { ...approved, id: 'rejected', status: 'REJECTED' },
    { ...approved, id: 'marketing', category: 'MARKETING' }, { ...approved, id: 'parameter', body: 'Hello {{1}}' },
    { ...approved, id: 'empty', body: '' }, { ...approved, id: 'not-text', body: { text: 'Synthetic' } },
  ] }), error: null }]);
  assert.equal(h.calls.length, 0);
  await h.load();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].endpoint, 'watermelon-whatsapp-initiate-template?request_id=' + h.context.request.id);
  assert.deepEqual(h.calls[0].request, { method: 'GET' });
  assert.deepEqual(Array.from(h.context.currentCatalogue.templates, item => item.id), ['synthetic-template']);
  assert.equal(h.context.currentCatalogue.recipient.phone, '+351900000001');
  assert.notEqual(h.context.currentCatalogue.recipient.phone, h.context.request.contact.phone);
  assert.equal(h.context.templateConsent, false);
  assert.equal(h.uuidCalls, 0);
});

test('canonical server recipient and static preview are rendered without local phone substitution or automatic invocation', () => {
  const stateNames = Array.from(source.matchAll(/const \[([^,]+),[^\]]+\] = useState/g), match => match[1]);
  let index = 0;
  const state = { templateCatalogue: { ...catalogue(), requestId: 'synthetic-render-request' }, selectedTemplateKey: approved.name + ':' + approved.language };
  const calls = [];
  const context = {
    exports: {}, React: { createElement(type, props, ...children) { return { type, props: props || {}, children }; } },
    useMemo: fn => fn(), useRef: () => ({ current: null }), useEffect() {},
    useState(value) { const name = stateNames[index++]; return [name in state ? state[name] : value, () => {}]; },
    createClient: () => ({ functions: { invoke(...args) { calls.push(args); throw new Error('Rendering must not invoke'); } } }),
  };
  vm.runInNewContext(compile(source.replace(/^import .*;\n/gm, '')), context);
  const rendered = context.exports.default({ request: { id: 'synthetic-render-request', messages: [], items: [],
    contact: { name: 'Local contact', phone: '918404101' }, reference: 'SYNTHETIC', currency: 'EUR', estimated_total: null }, onChanged() {} });
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...(Array.isArray(node.children) ? node.children.flat(Infinity).flatMap(flatten) : [])];
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : (node.children || []).flat(Infinity).map(text).join('');
  const nodes = flatten(rendered);
  const recipient = nodes.find(node => node.props.className === 'crm-whatsapp-template-recipient');
  assert.ok(recipient);
  assert.match(text(recipient), /Canonical server recipient/);
  assert.match(text(recipient), /\+351900000001/);
  assert.ok(!text(recipient).includes('918404101'));
  assert.equal(text(nodes.find(node => node.props.className === 'crm-whatsapp-template-preview')), approved.body);
  assert.equal(calls.length, 0);
});

test('missing consent or catalogue eligibility cannot POST and only explicit consent sends the exact five-field payload', async () => {
  const h = harness(); await h.load();
  await h.send(); assert.equal(h.calls.length, 1); assert.equal(h.uuidCalls, 0);
  h.context.currentCatalogue.eligible = false; h.context.templateConsent = true;
  await h.send(); assert.equal(h.calls.length, 1);
  h.context.currentCatalogue.eligible = true;
  const draft = h.context.draft;
  await h.send();
  assert.equal(h.calls.length, 2);
  const call = h.calls[1];
  assert.equal(call.endpoint, 'watermelon-whatsapp-initiate-template');
  assert.equal(call.request.method, 'POST');
  assert.deepEqual(Object.keys(call.request.body).sort(), ['client_attempt_id', 'consent_confirmed', 'language', 'request_id', 'template_name']);
  assert.deepEqual(call.request.body, { request_id: h.context.request.id, template_name: approved.name, language: approved.language,
    client_attempt_id: h.context.templateAttemptRef.current.key, consent_confirmed: true });
  assert.equal(h.context.templateAttemptRef.current.outcome, 'submitted');
  assert.equal(h.context.draft, draft, 'Free text stays a draft and is never queued');
  assert.equal(h.context.templateConsent, false);
  assert.match(h.feedback.at(-1), /Aguarda a resposta do cliente/);
  assert.match(h.feedback.at(-1), /nenhum texto ficou em fila/);
  assert.ok(!sendFunction.includes('window.confirm'));
  assert.ok(!sendFunction.includes('send-v2'));
  assert.equal(h.context.api.window(), false, 'Template acceptance does not open the inbound service window');
});

test('unavailable/pending templates, invalid canonical phone or uncertain catalogue never permit sending', async () => {
  for (const data of [
    catalogue({ templates: [] }), catalogue({ templates: [{ ...approved, status: 'PENDING' }] }),
    catalogue({ recipient: { name: 'Local-number response', phone: '918404101' } }),
    catalogue({ requires_consent_confirmation: false }), catalogue({ ok: false }),
  ]) {
    const h = harness([{ data, error: null }]); await h.load(); h.context.templateConsent = true; await h.send();
    assert.equal(h.calls.length, 1); assert.equal(h.uuidCalls, 0);
  }
  const h = harness([new Error('Synthetic GET failure')]); await h.load();
  assert.equal(h.context.currentCatalogue, null); assert.match(h.feedback.at(-1), /Nenhuma mensagem foi enviada/);
});

test('known rejection preserves draft and client attempt UUID without automatic retry', async () => {
  const h = harness([{ data: catalogue(), error: null },
    { data: null, error: { context: Response.json({ code: 'META_TEMPLATE_REJECTED', error: 'SYNTHETIC-SECRET' }) } },
    { data: { ok: false, code: 'PREVIOUS_TEMPLATE_REJECTED' }, error: null }]);
  await h.load(); h.context.templateConsent = true;
  const draft = h.context.draft;
  await h.send();
  const key = h.context.templateAttemptRef.current.key;
  assert.equal(h.context.templateAttemptRef.current.outcome, 'rejected'); assert.equal(h.context.templateUnconfirmedAttemptKey, '');
  assert.equal(h.context.draft, draft); assert.equal(h.calls.length, 2); assert.equal(h.uuidCalls, 1);
  assert.ok(!h.feedback.join().includes('SYNTHETIC-SECRET'));
  await Promise.resolve(); assert.equal(h.calls.length, 2);
  await h.send();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].request.body.client_attempt_id, key); assert.equal(h.uuidCalls, 1);
});

test('backend pre-claim validation errors stay definite while durable-claim uncertainty remains blocked', async () => {
  for (const code of ['ORIGIN_NOT_ALLOWED', 'AUTH_REQUIRED', 'ADMIN_REQUIRED', 'SERVER_NOT_CONFIGURED', 'INVALID_TEMPLATE_REQUEST',
    'CONSENT_CONFIRMATION_REQUIRED', 'INVALID_REQUEST_ID', 'DEDICATED_ACCOUNT_REQUIRED', 'CRM_LOOKUP_FAILED',
    'PUBLIC_BUSINESS_REQUEST_REQUIRED', 'PUBLIC_BUSINESS_CONTACT_REQUIRED', 'INVALID_INTERNATIONAL_CUSTOMER_PHONE',
    'AI_WEB_REQUEST_REQUIRED', 'REQUEST_NOT_ACTIVE', 'USE_REPLY_ENDPOINT', 'TEMPLATE_NOT_APPROVED_OR_SUPPORTED', 'TEMPLATE_CATALOG_UNAVAILABLE',
    'TEMPLATE_ASSOCIATION_OR_APPROVAL_CHANGED']) {
    const h = harness([{ data: catalogue(), error: null }, { data: { ok: false, code }, error: null }]);
    await h.load(); h.context.templateConsent = true; await h.send();
    assert.equal(h.context.templateAttemptRef.current.outcome, 'rejected', code);
    assert.equal(h.context.templateUnconfirmedAttemptKey, '', code);
    assert.equal(h.calls.length, 2);
  }
  for (const code of ['DURABLE_CLAIM_FAILED', 'TEMPLATE_GUARD_UNAVAILABLE', 'IDEMPOTENCY_KEY_REUSED', 'CLAIM_LOOKUP_FAILED', 'TEMPLATE_INITIATION_FAILED']) {
    const h = harness([{ data: catalogue(), error: null }, { data: { ok: false, code }, error: null }]);
    await h.load(); h.context.templateConsent = true; await h.send();
    assert.equal(h.context.templateAttemptRef.current.outcome, 'unknown', code);
    assert.equal(h.context.manualReplyUncertain, true, code);
  }
});

test('external pending attempt blocks sends until an explicit refresh, reusing the original UUID', async () => {
  const h = harness([{ data: catalogue(), error: null }, { data: { ok: false, code: 'TEMPLATE_BLOCKED_BY_EXISTING_ATTEMPT' }, error: null }]);
  await h.load(); h.context.templateConsent = true; await h.send();
  const key = h.context.templateAttemptRef.current.key;
  assert.equal(h.context.templateAttemptRef.current.outcome, 'blocked');
  assert.equal(h.context.manualReplyUncertain, true);
  await h.send(); assert.equal(h.calls.length, 2);
  await h.load();
  assert.equal(h.context.templateConsent, false);
  assert.equal(h.context.manualReplyUncertain, false);
  h.context.templateConsent = true; await h.send();
  assert.equal(h.calls.at(-1).request.body.client_attempt_id, key);
  assert.equal(h.uuidCalls, 1);
});

test('pending and unknown template results block template and free-form submissions without losing the original key', async () => {
  for (const result of [
    { data: { ok: false, code: 'TEMPLATE_PENDING' }, error: null },
    { data: { ok: false, code: 'TEMPLATE_SEND_UNCERTAIN' }, error: null }, new Error('Synthetic timeout'),
    { data: { ...submitted().data, queued: true }, error: null },
  ]) {
    const h = harness([{ data: catalogue(), error: null }, result]); await h.load(); h.context.templateConsent = true;
    await h.send(); const key = h.context.templateUnconfirmedAttemptKey;
    assert.ok(key); assert.equal(h.context.templateAttemptRef.current.outcome, 'unknown'); assert.equal(h.context.manualReplyUncertain, true);
    h.context.draft = 'Changed draft'; await h.send();
    assert.equal(h.calls.length, 2); assert.equal(h.context.templateAttemptRef.current.key, key); assert.equal(h.uuidCalls, 1);
    assert.ok(h.context.manualReplyUncertain, 'Shared uncertainty is also the manual send guard');
  }
});

test('manual template audit metadata blocks both channels while pending and is preserved intact', async () => {
  for (const state of ['pending', 'unknown']) {
    const h = harness(); await h.load(); h.context.templateConsent = true;
    const audit = { version: 1, state, actor_id: 'synthetic-actor', operation_hash: 'synthetic-hash', template_name: approved.name,
      consent: { confirmed: true, method: 'operator_confirmation', confirmed_at: '2026-10-31T12:00:00Z', actor_id: 'synthetic-actor' } };
    h.context.messages = [{ id: 'template-audit', source: 'crm_whatsapp_manual_template', raw_payload: { manual_template: audit } }];
    const before = structuredClone(audit); h.derive();
    assert.equal(h.context.manualReplyUncertain, true); await h.send(); assert.equal(h.calls.length, 1);
    assert.deepEqual(audit, before);
  }
  const h = harness();
  h.context.messages = [{ id: 'template-submitted', source: 'crm_whatsapp_manual_template', direction: 'outbound', status: 'sent',
    whatsapp_timestamp: new Date().toISOString(), raw_payload: { manual_template: { version: 1, state: 'submitted' } } }];
  assert.equal(h.context.api.window(), false);
  h.context.messages.push({ id: 'actual-inbound', source: 'cloud_api', direction: 'inbound', status: 'received', whatsapp_timestamp: new Date(Date.now() - 1000).toISOString() });
  assert.equal(h.context.api.window(), true, 'Only actual recent customer inbound opens the window');
});
