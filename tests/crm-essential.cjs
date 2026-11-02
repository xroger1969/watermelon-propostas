const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/SimpleCRMRequest.tsx'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'components/AdminCRM.tsx'), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const text = node => Array.isArray(node) ? node.map(text).join('') : node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : text(node.children);
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [] : [node, ...flatten(node.children)];

function fixture(status = 'in_review', kind = 'direct_booking') {
  return {
    id: 'synthetic', reference: 'SYNTHETIC-REQUEST', created_at: '2026-11-01T23:50:00Z', status, kind, currency: 'EUR', estimated_total: 648,
    contact: { name: 'Synthetic customer', email: 'customer@example.invalid', phone: '+351900000001', preferred_language: 'Portuguese' },
    items: [{ id: 'item1', experience_title: 'Beach day', requested_date: '2026-11-03', guests: 4, dietary: 'No nuts', accessibility: 'Step-free', children_ages: '7, 10', pickup_location: 'Hotel', guide_language: 'Portuguese', special_request: 'Beach and lunch' }],
    proposals: [], activities: [], messages: [], customer_notes: 'Vegetarian lunch'
  };
}

function render(request, overrides = {}) {
  const states = [], refs = []; let state = 0;
  const context = {
    exports: {}, Intl, Set, Error,
    window: { requestAnimationFrame(fn) { fn(); } },
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'fragment' },
    useRef() { const ref = { current: { scrollIntoView() {} } }; refs.push(ref); return ref; },
    useState(initial) { const i = state++; states[i] = initial; return [initial, next => states[i] = typeof next === 'function' ? next(states[i]) : next]; },
    EmailConversation: 'EmailConversation', WhatsAppConversation: 'WhatsAppConversation', ProposalEditor: 'ProposalEditor',
  };
  vm.runInNewContext(compile(source.replace(/^import .*;\n/gm, '')), context);
  const calls = [];
  const tree = context.exports.default({
    request, busy: false,
    onAccept: () => calls.push('accept'),
    onDecline: () => calls.push('decline'),
    onPayment: async () => { calls.push('payment'); return 'Synthetic payment link'; },
    onPaid: () => calls.push('paid'),
    onChanged() {},
    ...overrides
  });
  const nodes = flatten(tree);
  return { tree, nodes, calls, states, refs, button: label => nodes.find(n => n.type === 'button' && text(n) === label) };
}

test('essential inbox preserves customer needs and starts with the three simple actions', () => {
  const r = render(fixture());
  for (const value of ['Beach day', '4 pessoas', 'No nuts', 'Step-free', '7, 10', 'Hotel', 'Portuguese', 'Vegetarian lunch']) assert.ok(text(r.tree).includes(value), value);
  assert.ok(r.button('WhatsApp'));
  assert.ok(r.button('Email'));
  assert.ok(r.button('Fazer proposta'));
  assert.equal(r.nodes.filter(n => n.props.className === 'crm-essential-active-panel').length, 0);
  assert.deepEqual(r.calls, []);
});

test('WhatsApp, email and proposal buttons select exactly one working panel', () => {
  for (const [label, expected] of [['WhatsApp', 'whatsapp'], ['Email', 'email'], ['Fazer proposta', 'proposal']]) {
    const r = render(fixture());
    r.button(label).props.onClick();
    assert.equal(r.states[3], expected);
  }
});

test('decision controls remain separate from communication and no payment control appears before acceptance', () => {
  const r = render(fixture());
  r.button('Aceitar').props.onClick();
  r.button('Recusar').props.onClick();
  assert.deepEqual(r.calls, ['accept', 'decline']);
  assert.equal(r.button('Enviar dados de pagamento'), undefined);
  for (const status of ['declined', 'cancelled', 'completed']) {
    const closed = render(fixture(status));
    assert.equal(closed.button('Aceitar'), undefined);
    assert.equal(closed.button('Recusar'), undefined);
    assert.ok(closed.button('WhatsApp'));
    assert.ok(closed.button('Email'));
    assert.ok(closed.button('Fazer proposta'));
  }
});

test('payment preparation opens the available contact channel with a draft and never sends automatically', async () => {
  const r = render(fixture('accepted'));
  assert.equal(r.button('Aceitar'), undefined);
  r.button('Enviar dados de pagamento').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(r.calls, ['payment']);
  assert.equal(r.states[0].text, 'Synthetic payment link');
  assert.equal(r.states[3], 'email');
  assert.equal(r.states[1], false);
});

test('missing proposal opens the proposal form instead of preparing payment', async () => {
  const missing = render(fixture('accepted', 'personalized_proposal'));
  missing.button('Enviar dados de pagamento').props.onClick();
  assert.deepEqual(missing.calls, []);
  assert.equal(missing.states[0], undefined);
  assert.equal(missing.states[3], 'proposal');

  const failed = render(fixture('accepted'), { onPayment: async () => { throw new Error('Preparation failed'); } });
  failed.button('Enviar dados de pagamento').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.states[0], undefined);
  assert.equal(failed.states[1], false);
  assert.equal(failed.states[2], 'Preparation failed');
});

test('payment callback uses the appropriate authenticated RPC and returns a reviewable link without any outbound operation', async () => {
  const fn = admin.match(/  async function prepareSimplePayment\([\s\S]*?\n  \}\n/)[0];
  for (const kind of ['direct_booking', 'personalized_proposal']) {
    const calls = []; let refreshes = 0;
    const context = {
      api: {}, window: { location: { origin: 'https://synthetic.invalid' } }, encodeURIComponent,
      supabase: { async rpc(name, args) { calls.push({ name, args }); return { data: { payment_token: 'synthetic-token', reference: 'SYNTHETIC-REQUEST', amount: 648, proposal_total: 648 } }; } },
      async loadCRM() { refreshes++; }, money: value => 'EUR ' + value
    };
    vm.runInNewContext(compile(fn + '\napi.prepare = prepareSimplePayment;'), context);
    const request = fixture('accepted', kind); request.proposals = [{ total: 648 }];
    const draft = await context.api.prepare(request);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, kind === 'direct_booking' ? 'watermelon_prepare_direct_booking_payment' : 'watermelon_admin_accept_request');
    assert.match(draft, /https:\/\/synthetic.invalid\/payment\/SYNTHETIC-REQUEST\?token=synthetic-token/);
    assert.match(draft, /Valor: EUR 648/);
    assert.equal(refreshes, 1);
    await assert.rejects(context.api.prepare({ ...request, status: 'in_review' }));
    assert.equal(calls.length, 1);
  }
});
