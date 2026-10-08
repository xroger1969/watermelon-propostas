const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
const {countCRMRequests} = require('../lib/crm-dashboard.ts');
const row = (status, ...dates) => ({status, dates});
const TODAY = '2026-10-08';

test('in-progress includes awaiting customer, but excludes sent proposals and completed requests', () => {
  const counts = countCRMRequests([
    row('awaiting_customer'),
    row('in_review'),
    row('proposal_drafting'),
    row('customer_replied'),
    row('accepted'),
    row('proposal_sent'),
    row('completed')
  ], TODAY);
  assert.equal(counts.inReview, 5);
  assert.equal(counts.proposalSent, 1);
  assert.equal(counts.completed, 1);
});

test('today and next 7 days are calendar-date based with clear boundaries', () => {
  const counts = countCRMRequests([
    row('confirmed', '2026-10-08'),
    row('in_service', '2026-10-08'),
    row('completed', '2026-10-08'),
    row('no_show', '2026-10-08'),
    row('confirmed', '2026-10-09'),
    row('confirmed', '2026-10-15'),
    row('confirmed', '2026-10-16'),
    row('awaiting_payment', '2026-10-08'),
    row('confirmed', 'not-a-date')
  ], TODAY);
  assert.equal(counts.today, 4);
  assert.equal(counts.upcoming, 2);
  assert.equal(counts.confirmed, 5);
});

test('multiple experiences on the same request count once, not once per service date', () => {
  const counts = countCRMRequests([row('confirmed', '2026-10-09', '2026-10-10')], TODAY);
  assert.equal(counts.upcoming, 1);
});

test('marketing lead events do not enter operational request counters', () => {
  const counts = countCRMRequests([row('awaiting_customer')], TODAY);
  assert.equal(counts.inReview, 1);
  assert.equal(counts.new, 0);
  assert.equal(counts.proposalSent, 0);
});

test('new, payment and confirmed are mutually exclusive states', () => {
  const counts = countCRMRequests([
    row('new'), row('awaiting_payment'), row('confirmed')
  ], TODAY);
  assert.deepEqual(
    [counts.new,counts.awaitingPayment,counts.confirmed],
    [1,1,1]
  );
});
