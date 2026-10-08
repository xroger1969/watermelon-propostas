const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
const {
  requireWhatsAppDeliveryMode, wasWhatsAppMessageSubmitted, isWhatsAppMessageQueued
} = require('../lib/whatsapp-delivery.ts');

test('WhatsApp payment and free-form submissions are not confused with actual delivery receipts', () => {
  for (const mode of ['text','payment_template']) {
    assert.equal(wasWhatsAppMessageSubmitted(requireWhatsAppDeliveryMode(mode)),true);
    assert.equal(isWhatsAppMessageQueued(requireWhatsAppDeliveryMode(mode)),false);
  }
});
test('queued WhatsApp templates are not reported as payment or proposal messages sent', () => {
  for (const mode of ['template','pending']) {
    assert.equal(wasWhatsAppMessageSubmitted(requireWhatsAppDeliveryMode(mode)),false);
    assert.equal(isWhatsAppMessageQueued(requireWhatsAppDeliveryMode(mode)),true);
  }
});
test('ambiguous, missing or unexpected delivery modes fail closed', () => {
  for (const mode of [undefined,null,'',false,'sent','delivered','queued']) {
    assert.throws(()=>requireWhatsAppDeliveryMode(mode),/confirmed delivery state/);
  }
});
