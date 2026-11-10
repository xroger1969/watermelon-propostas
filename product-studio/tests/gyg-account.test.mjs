import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getGetYourGuideReadiness} from '../api/getyourguide-readiness.js';

const source=readFileSync(new URL('../getyourguide-integration.js',import.meta.url),'utf8');
function render(data,error=false){
  const el={innerHTML:''};
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const context=vm.createContext({window:{},document:{querySelector:()=>el},products:[],esc});
  vm.runInContext(source,context,{timeout:2000});
  context.gygRenderIntegrationHub(data,error);
  return el.innerHTML;
}

test('supplier account registration leaves every API activation and approval unchanged',()=>{
  const blank=getGetYourGuideReadiness({});
  const status=getGetYourGuideReadiness({GETYOURGUIDE_SUPPLIER_ID:' 831862 '});
  assert.deepEqual(status.supplier,blank.supplier);
  assert.deepEqual(status.partner,blank.partner);
  assert.deepEqual(status.safeguards,blank.safeguards);
  assert.equal(status.supplierAccount.id,'831862');
  assert.equal(status.supplierAccount.name,'Watermelon Experiences');
  assert.equal(status.supplierAccount.configured,true);
  assert.equal(status.supplier.configurationComplete,false);
  assert.equal(status.supplier.externalConnectionValidated,false);
  assert.equal(status.safeguards.externalBookingsEnabled,false);
  const html=render(status);
  assert.match(html,/Conta de fornecedor configurada no Studio/);
  assert.match(html,/ID do fornecedor<\/dt><dd>831862/);
  assert.match(html,/Sincronização automática de reservas<\/dt><dd>Inativa/);
  assert.match(html,/As reservas ainda não são importadas automaticamente/);
  assert.ok(html.indexOf('gyg-account-card')<html.indexOf('gyg-conn-grid'));
  assert.match(html,/href="https:\/\/supplier.getyourguide.com\/company-profile\/company-details"/);
  assert.doesNotMatch(html,/www\.getyourguide\.com\/-s/);
});

test('missing and malformed supplier IDs are not presented as configured accounts',()=>{
  for(const id of [undefined,'','  ','0','-1','831862suffix','https://example.invalid','<script>','1'.repeat(21)]){
    const status=getGetYourGuideReadiness({GETYOURGUIDE_SUPPLIER_ID:id});
    assert.equal(status.supplierAccount.configured,false);
    assert.equal(status.supplierAccount.id,null);
    assert.equal(status.supplierAccount.profileUrl,null);
    const html=render(status);
    assert.match(html,/ID do fornecedor<\/dt><dd>Por configurar/);
    assert.doesNotMatch(html,/Ver perfil da empresa/);
    assert.doesNotMatch(html,/Conta de fornecedor configurada no Studio/);
  }
});

test('configuration exposes no credentials and account names are escaped in the hub',()=>{
  const status=getGetYourGuideReadiness({
    GETYOURGUIDE_SUPPLIER_ID:'831862', GETYOURGUIDE_SUPPLIER_NAME:'<img src=x onerror=alert(1)>',
    GYG_SUPPLIER_BASIC_USER:'synthetic-user',GYG_SUPPLIER_BASIC_PASSWORD:'synthetic-password',
    GYG_PARTNER_API_KEY:'synthetic-token', PRODUCT_STUDIO_INTERNAL_KEY:'synthetic-internal'
  });
  assert.doesNotMatch(JSON.stringify(status),/synthetic-(user|password|token|internal)/);
  const html=render(status);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  assert.equal(status.supplier.approvalRecorded,false);
  assert.equal(status.supplier.certificationRecorded,false);
});

test('failed status lookup does not show a stale or fictitious configured account',()=>{
  const html=render(null,true);
  assert.match(html,/Não foi possível consultar a configuração/);
  assert.doesNotMatch(html,/gyg-account-card/);
  assert.doesNotMatch(html,/Conta de fornecedor configurada no Studio/);
});
