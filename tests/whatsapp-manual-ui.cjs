const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../components/WhatsAppConversation.tsx'), 'utf8');
const sendFunction = source.match(/  async function sendFromCRM\(\) \{[\s\S]*?\n  \}\n/)?.[0];
const uncertainExpressions = source.match(/  const serverUncertain = [\s\S]*?\n  const manualReplyUncertain = [\s\S]*?;\n/)?.[0];
assert.ok(sendFunction, 'Use the actual component send function');
assert.ok(uncertainExpressions, 'Use the actual component uncertainty expressions');
const compiled = ts.transpileModule(sendFunction + '\napi.run = sendFromCRM;\napi.uncertain = () => {\n' + uncertainExpressions + '\nreturn manualReplyUncertain;\n};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
});
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);

function harness(options = {}) {
  const calls = [], feedback = [], draftChanges = [], busyChanges = [], unconfirmedChanges = [];
  let refreshes = 0, uuidCalls = 0;
  const context = {
    api: {}, request: { id: options.requestId || 'synthetic-request' }, draft: options.draft ?? '  Resposta manual exata.  ', sending: false,
    messages: [], manualReplyUncertain: false, unconfirmedAttemptKey: '', manualAttemptRef: { current: null },
    templateUnconfirmedAttemptKey: '', templateAttemptRef: { current: null }, serviceWindowOpen: true, recentInbound: { id: 'synthetic-inbound' },
    MANUAL_REPLY_SOURCE: 'crm_cloud_api_manual', TEST_REPLY_SOURCE: 'crm_cloud_api_controlled_test', MANUAL_TEMPLATE_SOURCE: 'crm_whatsapp_manual_template', Response,
    crypto: { randomUUID() { return '11111111-1111-4111-8111-' + String(++uuidCalls).padStart(12, '0'); } },
    supabase: { functions: { async invoke(endpoint, request) {
      calls.push({ endpoint, request: structuredClone(request) });
      const result = options.results?.shift();
      if (result instanceof Error) throw result;
      return result || { data: { ok: true, code: 'MANUAL_REPLY_SUBMITTED' }, error: null };
    } } },
    setDraft(value) { context.draft = value; draftChanges.push(value); },
    setSending(value) { context.sending = value; busyChanges.push(value); },
    setFeedback(value) { feedback.push(value); },
    setUnconfirmedAttemptKey(value) { context.unconfirmedAttemptKey = value; unconfirmedChanges.push(value); },
    setServiceWindowRequiredForInbound(value) { context.serviceWindowRequiredForInbound = value; },
    async onChanged() { refreshes++; if (options.refreshFails) throw new Error('Synthetic refresh failure'); },
  };
  vm.runInNewContext(compiled.outputText, context);
  async function click() { context.manualReplyUncertain = context.api.uncertain(); await context.api.run(); }
  return { context, calls, feedback, draftChanges, busyChanges, unconfirmedChanges, click,
    get refreshes() { return refreshes; }, get uuidCalls() { return uuidCalls; } };
}

test('manual reply invokes only the new endpoint after an explicit click with exact text and one idempotency key', async () => {
  const h = harness();
  assert.equal(h.calls.length, 0, 'Rendering and preparing must not invoke a send');
  await h.click();
  assert.equal(h.calls.length, 1);
  const call = h.calls[0];
  assert.equal(call.endpoint, 'watermelon-whatsapp-reply');
  assert.equal(call.request.method, 'POST');
  assert.deepEqual(Object.keys(call.request.body).sort(), ['idempotency_key', 'request_id', 'text']);
  assert.equal(call.request.body.request_id, 'synthetic-request');
  assert.equal(call.request.body.text, '  Resposta manual exata.  ', 'Preserve the exact composed text');
  assert.equal(call.request.body.idempotency_key, h.context.manualAttemptRef.current.key);
  assert.equal(h.uuidCalls, 1);
  assert.equal(h.refreshes, 1);
  assert.equal(h.context.draft, '');
  assert.equal(h.context.manualAttemptRef.current.outcome, 'submitted');
  assert.equal(h.context.unconfirmedAttemptKey, '');
  assert.deepEqual(h.busyChanges, [true, false]);
  assert.ok(!sendFunction.includes('send-v2'));
  assert.ok(!sendFunction.includes('template'));
});

test('submitted and already-submitted results clear the draft without claiming delivery', async () => {
  for (const code of ['MANUAL_REPLY_SUBMITTED', 'ALREADY_SUBMITTED']) {
    const h = harness({ results: [{ data: { ok: true, code }, error: null }] });
    await h.click();
    assert.equal(h.context.draft, '');
    assert.equal(h.context.manualAttemptRef.current.outcome, 'submitted');
    assert.equal(h.context.unconfirmedAttemptKey, '');
    assert.match(h.feedback.at(-1), /Aguarda o estado de entrega/);
    await h.click();
    assert.equal(h.calls.length, 1, 'An emptied composer cannot send again');
  }
});

test('known rejection keeps the draft and reuses the same key only on another explicit attempt', async () => {
  for (const code of ['META_REPLY_REJECTED', 'PREVIOUS_REPLY_REJECTED', 'MANUAL_REPLY_ASSOCIATION_CHANGED', 'DEDICATED_SERVICE_WINDOW_REQUIRED', 'AUTH_REQUIRED', 'DURABLE_CLAIM_FAILED', 'MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT']) {
    const error = { context: Response.json({ code, meta_code: 131047, error: 'SYNTHETIC-SECRET-DO-NOT-RENDER' }) };
    const h = harness({ results: [{ data: null, error }, { data: { ok: false, code: 'PREVIOUS_REPLY_REJECTED' }, error: null }] });
    const draft = h.context.draft;
    await h.click();
    assert.equal(h.calls.length, 1);
    assert.equal(h.context.draft, draft);
    assert.equal(h.context.manualAttemptRef.current.outcome, 'rejected');
    assert.equal(h.context.unconfirmedAttemptKey, '');
    assert.ok(!h.feedback.join().includes('SYNTHETIC-SECRET'));
    const key = h.calls[0].request.body.idempotency_key;
    await Promise.resolve();
    assert.equal(h.calls.length, 1, 'There is no automatic retry');
    await h.click();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].request.body.idempotency_key, key);
    assert.equal(h.uuidCalls, 1, 'A rejected attempt must not silently receive a fresh key');
  }
});

test('unknown and pending outcomes preserve the key and block another call even if the draft changes', async () => {
  for (const result of [
    { data: { ok: false, code: 'MANUAL_REPLY_RESULT_UNKNOWN' }, error: null },
    { data: { ok: false, code: 'MANUAL_REPLY_PENDING' }, error: null },
    { data: null, error: { context: Response.json({ error: 'SYNTHETIC-UNKNOWN-SECRET' }) } },
    new Error('Synthetic network uncertainty'),
  ]) {
    const h = harness({ results: [result] });
    const draft = h.context.draft;
    await h.click();
    assert.equal(h.calls.length, 1);
    const key = h.calls[0].request.body.idempotency_key;
    assert.equal(h.context.manualAttemptRef.current.outcome, 'unknown');
    assert.equal(h.context.unconfirmedAttemptKey, key);
    assert.equal(h.context.draft, draft);
    assert.ok(!h.feedback.join().includes('SYNTHETIC-UNKNOWN-SECRET'));
    await h.click();
    h.context.draft = 'Outra resposta manual';
    await h.click();
    assert.equal(h.calls.length, 1);
    assert.equal(h.uuidCalls, 1);
    assert.equal(h.context.manualAttemptRef.current.key, key);
  }
});

test('uncertainty is derived from actual manual/test message metadata and clears only when local proof is resolved', async () => {
  const samples = [
    ['crm_cloud_api_manual', { manual_reply: { state: 'pending' } }, true],
    ['crm_cloud_api_manual', { manual_reply: { state: 'unknown' } }, true],
    ['crm_cloud_api_controlled_test', { controlled_test_state: 'pending' }, true],
    ['crm_cloud_api_controlled_test', { controlled_test_state: 'unknown' }, true],
    ['crm_cloud_api_manual', { manual_reply: { state: 'submitted' } }, false],
    ['crm_cloud_api_manual', { manual_reply: { state: 'rejected' } }, false],
    ['cloud_api', { manual_reply: { state: 'unknown' } }, false],
    ['crm_cloud_api_manual', {}, false],
  ];
  for (const [source, raw_payload, uncertain] of samples) {
    const h = harness(); h.context.messages = [{ id: 'server-message', source, raw_payload }];
    assert.equal(h.context.api.uncertain(), uncertain);
    if (uncertain) { await h.click(); assert.equal(h.calls.length, 0); assert.equal(h.uuidCalls, 0); }
  }
  const h = harness({ results: [{ data: { ok: false, code: 'MANUAL_REPLY_PENDING' }, error: null }] });
  await h.click();
  const key = h.context.unconfirmedAttemptKey;
  assert.equal(h.context.api.uncertain(), true);
  h.context.messages = [{ id: key, source: 'crm_cloud_api_manual', raw_payload: { manual_reply: { state: 'rejected' } } }];
  assert.equal(h.context.api.uncertain(), false);
  await h.click();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].request.body.idempotency_key, key, 'Resolution must not replace the original attempt key');
});

test('empty, oversized, sending and unresolved composers do not create an attempt', async () => {
  for (const options of [{ draft: '' }, { draft: '  ' }, { draft: 'x'.repeat(4001) }]) {
    const h = harness(options); await h.click(); assert.equal(h.calls.length, 0); assert.equal(h.uuidCalls, 0);
  }
  const h = harness(); h.context.sending = true; await h.click();
  assert.equal(h.calls.length, 0); assert.equal(h.uuidCalls, 0);
});

test('refresh failure preserves a confirmed submission and never retries it automatically', async () => {
  const h = harness({ refreshFails: true });
  await h.click();
  assert.equal(h.calls.length, 1); assert.equal(h.context.draft, '');
  assert.equal(h.context.manualAttemptRef.current.outcome, 'submitted');
  assert.equal(h.context.sending, false);
  assert.match(h.feedback.at(-1), /Mensagem aceite pela Meta/);
});

test('conversation renders only explicitly public rows from the exact dedicated endpoint and allowed sources', () => {
  const begin = source.indexOf('.filter((message) =>');
  const end = source.indexOf('\n        .sort', begin);
  assert.ok(begin >= 0 && end > begin);
  const phone = source.match(/const DEDICATED_PHONE_ID = "([0-9]+)";/)?.[1];
  assert.equal(phone, '1423415737522090');
  const visibleExpression = source.match(/const VISIBLE_SOURCES = ([^;]+);/)?.[1];
  assert.ok(visibleExpression);
  const allowed = new Function('MANUAL_REPLY_SOURCE', 'TEST_REPLY_SOURCE', 'MANUAL_TEMPLATE_SOURCE', 'return ' + visibleExpression)('crm_cloud_api_manual', 'crm_cloud_api_controlled_test', 'crm_whatsapp_manual_template');
  const select = new Function('messages', 'DEDICATED_PHONE_ID', 'VISIBLE_SOURCES', 'return messages' + source.slice(begin, end));
  const good = { id: 'public', is_private: false, phone_number_id: phone, source: 'cloud_api' };
  const rows = [good,
    { ...good, id: 'private', is_private: true }, { ...good, id: 'null-privacy', is_private: null },
    { ...good, id: 'unknown-privacy', is_private: undefined },
    { ...good, id: 'personal-phone', phone_number_id: '874910289048462' },
    { ...good, id: 'missing-phone', phone_number_id: null }, { ...good, id: 'other-phone', phone_number_id: 'unexpected' },
    ...['crm_cloud_api', 'crm_cloud_api_template', 'crm_cloud_api_pending', 'crm_cloud_api_manual_guard', null, undefined].map((value, index) => ({ ...good, id: 'legacy-' + index, source: value })),
    { ...good, id: 'manual', source: 'crm_cloud_api_manual' }, { ...good, id: 'test', source: 'crm_cloud_api_controlled_test' }];
  assert.deepEqual(select(rows, phone, allowed).map(message => message.id), ['public', 'manual', 'test']);
});
