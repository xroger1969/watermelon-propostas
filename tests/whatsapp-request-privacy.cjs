const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the selection expression from the changed component against synthetic
// records. This verifies a data boundary rather than duplicating its predicate.
const source = fs.readFileSync(path.join(__dirname, '../components/AdminCRM.tsx'), 'utf8');
const selection = source.match(/const messages = (\(request\.messages[\s\S]*?\n        \));/);
assert.ok(selection, 'Request-message selection must be found');
const select = new Function('request', 'return ' + selection[1]);
const requestSelection = source.match(/\.filter\(\s*(\(request\) => request\.contact\?\.is_private === false)\s*\)/);
assert.ok(requestSelection, 'Strict contact privacy selection must be found');
const selectRequests = new Function('requests', 'return requests.filter(' + requestSelection[1] + ')');
const item = (id, request_id, is_private = false) => ({
  id, request_id, contact_id: 'same-business-contact', is_private,
});

test('same contact with two requests keeps each request conversation separate', () => {
  const messages = [item('a', 'request-a'), item('b', 'request-b')];
  assert.deepEqual(select({id: 'request-a', messages}).map(m => m.id), ['a']);
  assert.deepEqual(select({id: 'request-b', messages}).map(m => m.id), ['b']);
});

test('private, standalone and unclassified messages cannot enter the request conversation', () => {
  const messages = [item('commercial', 'request-a'), item('private', 'request-a', true),
    item('standalone', null), {...item('unclassified', 'request-a'), is_private: undefined}];
  assert.deepEqual(select({id: 'request-a', messages}).map(m => m.id), ['commercial']);
});

test('embedded request messages are the only source and absent messages fail closed', () => {
  const request = {id: 'request-a', messages: [item('a', 'request-a'), item('b', 'request-b'),
    item('private', 'request-a', true)]};
  assert.deepEqual(select(request).map(m => m.id), ['a']);
  assert.deepEqual(select({id:'request-a'}), []);
  assert.ok(!source.includes('messagesResult'));
  assert.equal((source.match(/\.from\("watermelon_messages"\)/g) || []).length, 0,
    'No messages query may fetch records outside the scoped requests');
});

test('conversation heading makes the temporary pause and business-only workflow explicit', () => {
  const heading = fs.readFileSync(path.join(__dirname, '../components/WhatsAppConversation.tsx'), 'utf8');
  assert.ok(heading.includes('WhatsApp CRM temporariamente pausado.'));
  assert.ok(heading.includes('Copiar para WhatsApp Business'));
  assert.ok(heading.includes('message.phone_number_id !== LEGACY_PERSONAL_PHONE_ID'));
  assert.ok(!heading.includes('wa.me/'));
  assert.ok(!heading.includes('Full contact history'));
});

test('private contacts and missing contact privacy cannot render their requests', () => {
  const requests = [{id:'business',contact:{is_private:false}},
    {id:'private',contact:{is_private:true}}, {id:'missing',contact:null},
    {id:'unclassified',contact:{}}];
  assert.deepEqual(selectRequests(requests).map(r => r.id), ['business']);
});

test('embedded query filters contact privacy on the server and preserves requests with no messages', () => {
  assert.ok(source.includes('contact:watermelon_contacts!inner(*)'));
  assert.ok(source.includes('.eq("contact.is_private", false)'));
  assert.ok(source.includes('.eq("messages.is_private", false)'));
  assert.ok(source.includes('messages:watermelon_messages(*)'));
  assert.ok(!source.includes('messages:watermelon_messages!inner(*)'));
});

test('private row payloads cannot reach the component through global Realtime subscriptions', () => {
  assert.ok(!source.includes('.channel('));
  assert.ok(!source.includes('"postgres_changes"'));
  assert.ok(!source.includes('latestMessageIdRef'));
});

test('scoped refresh runs every 10 seconds while visible, refreshes on focus, and does not overlap', async () => {
  const begin = source.indexOf('useEffect(() => {\n    if (!supabase || !signedIn) return;');
  const ending = '}, [supabase, signedIn, loadCRM]);';
  const end = source.indexOf(ending, begin);
  assert.ok(begin >= 0 && end > begin);
  const effect = source.slice(begin, end + ending.length);
  const listeners = new Map();
  const visibilityListeners = new Map();
  const timeouts = new Map();
  let timerId = 0;
  let interval;
  let clearedInterval = false;
  let cleanup;
  let calls = 0;
  let completeRefresh;
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => visibilityListeners.set(name, callback),
    removeEventListener: (name) => visibilityListeners.delete(name),
  };
  const window = {
    setTimeout: (callback) => { const id = ++timerId; timeouts.set(id, callback); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (callback, delay) => { assert.equal(delay, 10000); interval = callback; return ++timerId; },
    clearInterval: () => { clearedInterval = true; },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  const flushTimeout = () => {
    for (const [id, callback] of timeouts) { timeouts.delete(id); callback(); }
  };
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    useEffect: (callback) => { cleanup = callback(); },
    supabase: {}, signedIn: true, document, window,
    loadCRM: () => { calls += 1; return new Promise(resolve => { completeRefresh = resolve; }); },
  });
  interval();
  assert.equal(calls, 1);
  interval();
  listeners.get('focus')();
  flushTimeout();
  assert.equal(calls, 1, 'Polling and focus must not overlap an in-flight refresh');
  completeRefresh();
  await new Promise(setImmediate);
  document.visibilityState = 'hidden';
  interval();
  assert.equal(calls, 1, 'Hidden tabs must not poll');
  document.visibilityState = 'visible';
  visibilityListeners.get('visibilitychange')();
  flushTimeout();
  assert.equal(calls, 2, 'Returning to the page must refresh without waiting for a new message ID');
  completeRefresh();
  await new Promise(setImmediate);
  interval();
  assert.equal(calls, 3, 'Each poll refreshes statuses and privacy even without a new message');
  completeRefresh();
  await new Promise(setImmediate);
  cleanup();
  assert.ok(clearedInterval);
  assert.equal(listeners.size, 0);
  assert.equal(visibilityListeners.size, 0);
  interval();
  assert.equal(calls, 3, 'Cleaned-up effects cannot fetch again');
});
