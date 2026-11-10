const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText, filename);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
require.extensions['.css'] = module => { module.exports = {}; };
const { getGetYourGuideIntegrationStatus } = require('../lib/getyourguide-live.ts');
const { GetYourGuideAccountDetails } = require('../components/GetYourGuideAccount.tsx');

function configured(values, check) {
  const keys = ['GETYOURGUIDE_SUPPLIER_ID', 'GETYOURGUIDE_SUPPLIER_NAME', 'GETYOURGUIDE_PARTNER_API_TOKEN', 'GETYOURGUIDE_TOUR_IDS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, values);
    check(getGetYourGuideIntegrationStatus());
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('recording the supplier account does not enable catalog access or booking sync', () => {
  configured({ GETYOURGUIDE_SUPPLIER_ID: ' 831862 ' }, status => {
    assert.equal(status.supplierAccount.id, '831862');
    assert.equal(status.supplierAccount.configured, true);
    assert.equal(status.supplierAccount.name, 'Watermelon Experiences');
    assert.equal(status.accountStatus, 'supplier-account-configured');
    assert.equal(status.configured, false);
    assert.equal(status.enabled, false);
    assert.equal(status.catalogEnabled, false);
    assert.equal(status.bookingSyncEnabled, false);
    assert.equal(status.externalConnectionValidated, false);
    const markup = renderToStaticMarkup(React.createElement(GetYourGuideAccountDetails, { status }));
    assert.match(markup, /831862/);
    assert.match(markup, /Conta de fornecedor configurada no CRM/);
    assert.match(markup, /Sincronização automática de reservas<\/dt><dd>Inativa/);
    assert.match(markup, /As reservas ainda não são importadas automaticamente/);
    assert.match(markup, /https:\/\/supplier.getyourguide.com\/company-profile\/company-details/);
  });
});

test('catalog credentials and activity IDs remain separate from supplier account and live connectivity', () => {
  configured({ GETYOURGUIDE_PARTNER_API_TOKEN: 'synthetic-secret', GETYOURGUIDE_TOUR_IDS: '123,456' }, status => {
    assert.equal(status.supplierAccount.configured, false);
    assert.equal(status.catalogApiConfigured, true);
    assert.equal(status.catalogEnabled, true);
    assert.equal(status.productCount, 2);
    assert.equal(status.bookingSyncEnabled, false);
    assert.equal(status.externalConnectionValidated, false);
    assert.ok(!JSON.stringify(status).includes('synthetic-secret'));
    const markup = renderToStaticMarkup(React.createElement(GetYourGuideAccountDetails, { status }));
    assert.match(markup, /Conta de fornecedor por configurar/);
    assert.match(markup, /2 atividades configuradas · ligação por validar/);
  });
  configured({ GETYOURGUIDE_PARTNER_API_TOKEN: 'synthetic-secret' }, status => {
    assert.equal(status.catalogApiConfigured, true);
    assert.equal(status.catalogEnabled, false);
  });
});

test('missing or malformed supplier IDs are never represented as configured accounts', () => {
  for (const id of ['', '   ', '0', '-1', '831862suffix', 'https://example.invalid', '<script>', '1'.repeat(21)]) {
    configured({ GETYOURGUIDE_SUPPLIER_ID: id }, status => {
      assert.equal(status.supplierAccount.id, null);
      assert.equal(status.supplierAccount.profileUrl, null);
      assert.equal(status.supplierAccount.configured, false);
      assert.equal(status.accountStatus, 'awaiting-supplier-account');
      assert.equal(status.supplierAccount.portalUrl, 'https://supplier.getyourguide.com/home');
      const markup = renderToStaticMarkup(React.createElement(GetYourGuideAccountDetails, { status }));
      assert.doesNotMatch(markup, /Ver perfil da empresa/);
    });
  }
});
