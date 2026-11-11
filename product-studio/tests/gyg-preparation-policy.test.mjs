import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../gyg-preparation-policy.js';
import {publicationIssues,approveSellingPrice,approveProductReview} from '../product-integrity.js';
import productsHandler from '../api/products.js';

function product(){
  const p={id:'WM-9963P14',status:'Draft',title:'South of Lisbon',shortTitle:'South bank',destination:'Almada',duration:'3 hours',summary:'Explore the south bank.',description:'Explore the south bank with your guide.',highlights:'See the river\nDiscover the coast\nExplore Almada',itinerary:'Meet the guide\nExplore Almada',included:'Guide',excluded:'Lunch',language:'English',groupType:'Private',maxGuests:'8',capacity:'8',days:'Mon,Wed,Fri',startTimes:'09:00',cutoffHours:'10',cancellation:'Confirmed policy',meetingPoint:'Confirmed point',adultPrice:'90',childPrice:'',priceType:'Per person',currency:'EUR',optionCode:'DEFAULT',optionTitle:'South of Lisbon',gallery:Array.from({length:7},(_,i)=>({url:`https://images.example/photo-${i}.jpg`,type:'image'})),inputSource:{gygPreparation:{version:1,selected:true,supplierId:'831862',pricing:{basePerPerson:90,perPerson:81,solo:162,currency:'EUR',source:'website_promotion',observedAt:'2026-11-11T10:00:00Z'},operations:{minParticipants:1,cutoffHours:10,seasonStart:'2027-01-01',seasonEnd:'2027-02-14',days:['Mon','Wed','Fri'],confirmed:true},photoQualityReviewed:true,websiteParityConfirmed:true}}};
  approveSellingPrice(p);approveProductReview(p);return p;
}

function publisher(products=[]){
  const writes=[],ctx={products,window:{gygPreparationPolicy:policy,studioPublicationIssues:publicationIssues},galleryOf:p=>p.gallery||[],esc:String,document:{querySelector(){return null;}},toast(){},save(){},saveCloud:async p=>{writes.push(p.id);}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../getyourguide-publisher.js',import.meta.url),'utf8'),ctx);
  return {ctx,writes};
}

test('solo and pair tiers preserve one actual participant and equal totals',()=>{
  const p=product(),{ctx}=publisher();
  assert.deepEqual(policy.gygPriceTiers(p),[
    {minParticipants:1,maxParticipants:1,pricePerPerson:162,totalPrice:162},
    {minParticipants:2,maxParticipants:2,pricePerPerson:81,totalPrice:162},
  ]);
  const payload=ctx.buildGygPayload(p);
  assert.equal(payload.maxGuests,2);assert.equal(payload.options[0].priceType,'Per person');
  assert.equal(payload.options[0].minParticipants,1);assert.equal(payload.options[0].maxParticipants,2);
  assert.deepEqual(policy.gygPreparationIssues(p,payload),[]);
  assert.deepEqual(Array.from(ctx.gygReadiness(p,payload).missing),[]);
});

test('maximum 200 EUR includes the solo tier, not just the advertised pair price',()=>{
  const p=product(),price=p.inputSource.gygPreparation.pricing;
  price.basePerPerson=100;price.perPerson=100;price.solo=200;p.adultPrice='100';
  assert.equal(policy.gygPreparationIssues(p).some(x=>x.includes('máximo de 200')),false);
  price.perPerson=100.01;price.solo=200.02;
  assert.equal(policy.gygPreparationIssues(p).some(x=>x.includes('máximo de 200')),true);
  price.perPerson=81;price.solo=81;
  assert.equal(policy.gygPreparationIssues(p).some(x=>x.includes('mesmo total')),true);
});

test('unknown prices, group units, unselected codes and absent price provenance fail closed',()=>{
  for(const change of [p=>p.adultPrice='',p=>p.priceType='Per group',p=>p.currency='USD',p=>p.id='WM-9963P13',p=>delete p.inputSource.gygPreparation.pricing.source,p=>delete p.inputSource.gygPreparation.pricing.observedAt,p=>p.inputSource.gygPreparation.selected=false]){
    const p=product();change(p);assert.ok(policy.gygPreparationIssues(p).length);
  }
  const p=product();p.allOptions=[{optionCode:'DEFAULT',adultPrice:'90',priceType:'Per group',currency:'EUR',activeDays:['Mon','Wed','Fri'],cutoffHours:10}];
  assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('por pessoa')));
});

test('seven distinct photos and human quality review are required; size variants do not count twice',()=>{
  const p=product();p.gallery.pop();
  assert.equal(policy.gygPhotoCount(p),6);assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('faltam 1')));
  p.gallery.push({...p.gallery[0],url:p.gallery[0].url+'?width=900'});
  assert.equal(policy.gygPhotoCount(p),6);
  p.gallery=[{url:'https://media.tacdn.com/media/attractions-splice-spp-674x446/0a/bb/cc.jpg'},{url:'https://media.tacdn.com/media/attractions-splice-spp-1440x960/0a/bb/cc.jpg'}];
  assert.equal(policy.gygPhotoCount(p),1);
  const q=product();q.inputSource.gygPreparation.photoQualityReviewed=false;
  assert.ok(policy.gygPreparationIssues(q).some(x=>x.includes('qualidade')));
  const low=product();low.gallery[0].width=1279;low.gallery[0].height=960;
  assert.equal(policy.gygPhotoCount(low),6);
  low.gallery[0].width=1280;low.gallery[0].height=959;assert.equal(policy.gygPhotoCount(low),6);
  low.gallery[0].height=960;assert.equal(policy.gygPhotoCount(low),7);
  low.gallery.push({url:'https://images.example/extra-small.jpg',width:640,height:480});
  assert.ok(policy.gygPreparationIssues(low).some(x=>x.includes('1280')));
});

test('changing tier amounts invalidates price and operational approval while other products retain their approval format',()=>{
  const p=product();assert.deepEqual(publicationIssues(p),[]);
  p.inputSource.gygPreparation.pricing.perPerson=80;p.inputSource.gygPreparation.pricing.solo=160;
  assert.ok(publicationIssues(p).some(x=>x.includes('preço de venda')));
  assert.ok(publicationIssues(p).some(x=>x.includes('revisão dos dados')));
});

test('season requires 45 calendar days in a year and three unique confirmed weekdays',()=>{
  assert.equal(policy.gygSeasonDays('2027-01-01','2027-02-14'),45);
  assert.equal(policy.gygSeasonDays('2027-01-01','2027-02-13'),44);
  assert.equal(policy.gygSeasonDays('2027-02-30','2027-04-30'),0);
  assert.equal(policy.gygSeasonDays('2026-12-15','2027-01-28'),28);
  const p=product(),op=p.inputSource.gygPreparation.operations;
  op.seasonEnd='2027-02-13';op.days=['Mon','Mon','Wed'];
  assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('45 dias')));
  assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('3 dias')));
  op.seasonEnd='2027-02-14';op.days=['Mon','Wed','Fri'];op.confirmed=false;
  assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('confirmar operação')));
});

test('cutoff accepts zero or ten, rejects missing/over-ten and inconsistent source availability',()=>{
  for(const cutoff of [0,10]){const p=product();p.cutoffHours=String(cutoff);p.inputSource.gygPreparation.operations.cutoffHours=cutoff;assert.equal(policy.gygPreparationIssues(p).some(x=>x.includes('antecedência')),false);}
  for(const cutoff of [undefined,null,'',11,NaN]){const p=product();p.inputSource.gygPreparation.operations.cutoffHours=cutoff;assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('antecedência')));}
  const p=product();p.days='Mon,Tue,Wed';assert.ok(policy.gygPreparationIssues(p).some(x=>x.includes('dias da ficha')));
});

test('tampered exported tiers, photos, participants and dates cannot activate a package',()=>{
  for(const change of [x=>x.options[0].pricingTiers[0].pricePerPerson=81,x=>x.options[0].minParticipants=2,x=>x.options[0].pricingTiers[1].maxParticipants=8,x=>x.options[0].bookingCutoffHours=12,x=>x.options[0].seasonEnd='2027-06-01',x=>x.photos[0].url='https://unrelated.example/photo.jpg',x=>x.maxGuests=8]){
    const p=product(),{ctx}=publisher(),payload=ctx.buildGygPayload(p);change(payload);assert.ok(policy.gygPreparationIssues(p,payload).length);
  }
});

test('bulk preparation touches only the selected three and preserves prior selection notes',async()=>{
  const selected=product(),other={...product(),id:'WM-9963P13'};
  selected.getYourGuidePublication={status:'Not prepared',notes:'[Seleção GYG 2026-11-11] Selected by owner'};
  const {ctx,writes}=publisher([selected,other]);
  await ctx.prepareAllGetYourGuide();
  assert.deepEqual(writes,['WM-9963P14']);assert.ok(selected.getYourGuidePublication.notes.startsWith('[Seleção GYG 2026-11-11] Selected by owner'));
  assert.ok(selected.getYourGuidePublication.notes.includes('[Verificação GYG]'));
  await ctx.prepareGygProduct(other.id);assert.deepEqual(writes,['WM-9963P14']);
});

const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;},send(b){this.body=b;return this;}});
test('server rejects every active GYG state with missing account rules, even if payload/status unchanged',async()=>{
  const realFetch=globalThis.fetch,env={url:process.env.SUPABASE_PRODUCT_STUDIO_URL,key:process.env.PRODUCT_STUDIO_INTERNAL_KEY};
  process.env.SUPABASE_PRODUCT_STUDIO_URL='https://fake.test';process.env.PRODUCT_STUDIO_INTERNAL_KEY='test-only';
  const writes=[];let current;
  globalThis.fetch=async(u,o)=>{if(o.method==='POST')writes.push(JSON.parse(o.body));return {ok:true,status:200,json:async()=>({products:[current]}),text:async()=>'{"revision":1}'};};
  try{
    const p=product(),{ctx}=publisher();
    p.inputSource.gygPreparation.websiteParityConfirmed=false;
    for(const status of ['Ready','Submitted','In review','Published']){
      p.getYourGuidePublication={status,payload:ctx.buildGygPayload(p)};current=structuredClone(p);
      const r=response();await productsHandler({method:'POST',headers:{},body:{product:p}},r);
      assert.equal(r.statusCode,422);assert.ok(r.body.issues.some(x=>x.includes('mesmos preços')));
    }
    assert.equal(writes.length,0);
    p.getYourGuidePublication.status='Not prepared';const draft=response();await productsHandler({method:'POST',headers:{},body:{product:p}},draft);assert.equal(draft.statusCode,200);
    p.inputSource.gygPreparation.websiteParityConfirmed=true;p.getYourGuidePublication.status='Ready';const ready=response();await productsHandler({method:'POST',headers:{},body:{product:p}},ready);assert.equal(ready.statusCode,200);
    assert.equal(writes.length,2);
  }finally{globalThis.fetch=realFetch;for(const [k,v] of [['SUPABASE_PRODUCT_STUDIO_URL',env.url],['PRODUCT_STUDIO_INTERNAL_KEY',env.key]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
