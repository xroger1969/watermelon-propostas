const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the selection expression from the changed component against synthetic
// records. This verifies a data boundary rather than duplicating its predicate.
const componentDir = process.env.WHATSAPP_UI_TEST_DIR || path.resolve(__dirname, '../components');
const source = fs.readFileSync(path.join(componentDir, 'AdminCRM.tsx'), 'utf8');
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
  assert.equal(source.match(/\.from\("watermelon_messages"\)/g).length, 1,
    'Only metadata safety polling may query messages separately');
});

test('conversation heading describes only this request without claiming full personal-chat exclusion', () => {
  const heading = fs.readFileSync(path.join(componentDir, 'WhatsAppConversation.tsx'), 'utf8');
  assert.ok(heading.includes('Only replies to CRM messages are imported into this request.'));
  assert.ok(heading.includes('Messages written in the WhatsApp phone app are not imported.'));
  assert.ok(!heading.includes('Full contact history'));
  assert.ok(!heading.includes('Unrelated personal WhatsApp chats are excluded.'));
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

test('metadata poll uses the same message, request and contact privacy scope', () => {
  assert.ok(source.includes('.select("id,created_at,request:watermelon_requests!inner(id,is_private,contact:watermelon_contacts!inner(id,is_private))")'));
  assert.ok(source.includes('.eq("request.is_private", false)'));
  assert.ok(source.includes('.eq("request.contact.is_private", false)'));
});
