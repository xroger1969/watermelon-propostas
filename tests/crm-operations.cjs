const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
const {allowedOperationalStatuses, hasPersistedOperationalStatus} = require('../lib/crm-operations.ts');

test('a paid, scheduled service starts before it can be completed', () => {
  assert.deepEqual(allowedOperationalStatuses('confirmed', true, true), ['in_service', 'no_show']);
  assert.deepEqual(allowedOperationalStatuses('in_service', true, true), ['completed', 'no_show']);
  assert.deepEqual(allowedOperationalStatuses('completed', true, true), []);
});

test('payment or scheduling still pending prevents starting the service', () => {
  assert.deepEqual(allowedOperationalStatuses('confirmed', false, true), []);
  assert.deepEqual(allowedOperationalStatuses('confirmed', true, false), []);
  for (const status of ['new', 'accepted', 'awaiting_payment', 'declined', 'cancelled', 'no_show']) {
    assert.deepEqual(allowedOperationalStatuses(status, true, true), []);
  }
});

test('a booking marked completed with a CRM request reverted to confirmed is a failed save', () => {
  assert.equal(hasPersistedOperationalStatus({
    status: 'confirmed', linked_booking_id: 'booking-id', booking: {status: 'completed'}
  }, 'completed'), false);
  assert.equal(hasPersistedOperationalStatus({
    status: 'in_service', linked_booking_id: 'booking-id', booking: {status: 'confirmed'}
  }, 'in_service'), false);
});

test('missing linked bookings and missing verification rows cannot report success', () => {
  assert.equal(hasPersistedOperationalStatus(null, 'completed'), false);
  assert.equal(hasPersistedOperationalStatus({status: 'completed', linked_booking_id: 'booking-id', booking: null}, 'completed'), false);
  assert.equal(hasPersistedOperationalStatus({status: 'completed', linked_booking_id: 'booking-id', booking: []}, 'completed'), false);
});

test('matching persisted request and booking work for both relationship result shapes', () => {
  for (const status of ['in_service', 'completed', 'no_show']) {
    assert.equal(hasPersistedOperationalStatus({status, linked_booking_id: 'booking-id', booking: {status}}, status), true);
    assert.equal(hasPersistedOperationalStatus({status, linked_booking_id: 'booking-id', booking: [{status}]}, status), true);
    assert.equal(hasPersistedOperationalStatus({status, linked_booking_id: null, booking: null}, status), true);
  }
});
