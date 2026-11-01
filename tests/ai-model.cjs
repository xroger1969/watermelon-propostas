const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { conciergeModel, matchesRequestedModel } = require('../lib/ai-model.ts');

test('missing or blank model uses Astra; deliberate overrides stay observable', () => {
  const before = process.env.OPENAI_CONCIERGE_MODEL;
  try {
    delete process.env.OPENAI_CONCIERGE_MODEL;
    assert.equal(conciergeModel(), 'gpt-6-astra');
    process.env.OPENAI_CONCIERGE_MODEL = '   ';
    assert.equal(conciergeModel(), 'gpt-6-astra');
    process.env.OPENAI_CONCIERGE_MODEL = ' gpt-4.1-mini ';
    assert.equal(conciergeModel(), 'gpt-4.1-mini');
  } finally {
    if (before === undefined) delete process.env.OPENAI_CONCIERGE_MODEL;
    else process.env.OPENAI_CONCIERGE_MODEL = before;
  }
});

test('provider verification accepts the requested alias or its dated snapshot only', () => {
  assert.equal(matchesRequestedModel('gpt-6-astra', 'gpt-6-astra'), true);
  assert.equal(matchesRequestedModel('gpt-6-astra', 'gpt-6-astra-2026-09-03'), true);
  for (const actual of [undefined, null, {}, '', 'gpt-4.1-mini', 'gpt-5.6-terra', 'gpt-6-astra-mini', 'gpt-6-astra-2026-09-03-extra']) {
    assert.equal(matchesRequestedModel('gpt-6-astra', actual), false);
  }
});
