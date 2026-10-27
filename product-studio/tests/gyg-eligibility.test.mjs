import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../getyourguide-eligibility.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},products:[],galleryOf:(p)=>p.gallery??[],esc:(v)=>String(v)});
vm.runInContext(script,context,{timeout:2000});
const screen=context.window.gygScreenProduct;
function sample(overrides={}){
  return {id:'WM-9963P25',title:'Portuguese Cooking Class at local market',
    description:'An original cooking class and guided market visit with chef, ingredients, tasting and hands-on instruction. Guests learn how to prepare regional recipes while visiting the local market.',
    allOptions:[{priceType:'Per person',adultPrice:'27',cutoffHours:8,startTimes:['10:00']}],
    gallery:[{url:'https://example.org/our-photo.jpg'}],...overrides};
}
test('all 25 programmes have explicit notes and no approved claim',()=>{
  const count=vm.runInContext('Object.keys(GYG_ELIGIBILITY_NOTES).length',context);
  assert.equal(count,25);
  const statuses=vm.runInContext('Object.values(GYG_ELIGIBILITY_NOTES).map(x=>x.status).join(",")',context);
  assert.ok(!statuses.includes('approved'));
});
test('27 EUR per person does not trigger fictitious minimum-price rejection',()=>{
  const result=screen(sample());
  assert.equal(result.unpriced,false);
  assert.equal(result.cutoffInvalid,false);
  assert.equal(result.status,'candidate');
});
test('12-hour cutoff and absent prices are flagged independently',()=>{
  const result=screen(sample({allOptions:[{adultPrice:null,cutoffHours:12,startTimes:[]}]}));
  assert.equal(result.cutoffInvalid,true);
  assert.equal(result.unpriced,true);
  assert.ok(result.issues.some(x=>x.includes('10 h')));
});
test('Viator origin does not automatically prove reseller status',()=>{
  const result=screen(sample({source:'VIATOR',id:'WM-9963P14'}));
  assert.equal(result.status,'candidate');
  assert.ok(result.issues.some(x=>x.includes('Operação direta')));
});
test('identified external operator is held for ownership verification',()=>{
  const result=screen(sample({id:'WM-1791378360618',title:'Quad guided tour'}));
  assert.equal(result.status,'operator');
  assert.ok(result.issues.some(x=>x.includes('Origem externa')));
});
test('horseback products are explicitly marked case-by-case',()=>{
  const result=screen(sample({id:'WM-9963P6'}));
  assert.equal(result.status,'animal');
  assert.ok(result.issues.some(x=>x.includes('bem-estar animal')));
});
