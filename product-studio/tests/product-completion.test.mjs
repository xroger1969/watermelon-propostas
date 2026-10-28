import test from 'node:test';
import assert from 'node:assert/strict';
import {completionRequest,viatorReference,normalizeCompletion,fetchViatorEvidence,completeProductFields} from '../lib/product-completion.js';
import {normalizeCompletionValue,pendingCompletionFields,packCompletionMetadata,unpackCompletionMetadata} from '../completion-fields.js';
import handler from '../api/complete.js';

test('completion scopes exclude identity, publication and provider mappings',()=>{
  for(const field of ['id','status','pricingProvider','availabilityProvider','viatorCode','__proto__']){
    assert.throws(()=>completionRequest({product:{title:'Beach day'},fields:[field]}));
  }
  assert.throws(()=>completionRequest({product:{title:'Beach day'},fields:[]}));
  assert.equal(completionRequest({product:{title:'Beach day',viatorCode:'9963p8'},fields:['itinerary','itinerary']}).code,'9963P8');
});
test('references reject unsafe and lookalike URLs and recover exact Viator code',()=>{
  for(const value of ['http://www.viator.com/tour','https://viator.com.evil.test/tour','https://viator.com@evil.test','file:///tmp/test','https://127.0.0.1/','https://viator.com:444/tour'])assert.throws(()=>viatorReference(value));
  assert.equal(viatorReference('https://www.viator.com/tours/Lisbon/Beach-Day/d538-9963P8').code,'9963P8');
});
test('source claims require retrieved exact-product URLs and supporting evidence',()=>{
  const url='https://www.viator.com/tours/Lisbon/Beach/d538-9963P8';
  const request=completionRequest({product:{title:'Beach',viatorCode:'9963P8'},fields:['pickup','cancellation','adultPrice']});
  const result=normalizeCompletion({fields:[
    {field:'pickup',value:'Hotel pickup',origin:'viator',sourceUrl:url,evidence:'Hotel pickup is offered'},
    {field:'cancellation',value:'24 hours',origin:'viator',sourceUrl:url.replace('P8','P18'),evidence:'24 hours'},
    {field:'adultPrice',value:'90',origin:'viator',sourceUrl:'https://made-up.test',evidence:'90 EUR'},
    {field:'status',value:'Live',origin:'viator'}
  ]},request,[{url}]);
  assert.deepEqual(result.fields.map(p=>p.origin),['viator','suggestion','suggestion']);
  assert.ok(result.fields.every(p=>p.requiresReview));
  assert.equal(result.fields[1].sourceUrl,'');
});
test('invalid operational values remain missing while zero cutoff and child price are supported',()=>{
  for(const [field,value] of [['adultPrice','-1'],['capacity','8.5'],['cutoffHours','200'],['startTimes','25:00'],['days','Every day'],['language','Klingon']])assert.equal(normalizeCompletionValue(field,value),'');
  assert.equal(normalizeCompletionValue('cutoffHours',0),'0');
  assert.equal(normalizeCompletionValue('childPrice',0),'0');
  assert.equal(normalizeCompletionValue('days',['Mon','Tue','Mon']),'Mon,Tue');
  assert.equal(normalizeCompletionValue('itinerary',['Meet the guide','Visit the beach']),'Meet the guide\nVisit the beach');
});
test('Viator data retrieval checks product identity and uses a fixed integration origin',async()=>{
  let calls=0;
  assert.equal(await fetchViatorEvidence('not-a-code',()=>{calls++;}),null);
  assert.equal(calls,0);
  const mismatch=await fetchViatorEvidence('9963P8',async url=>{
    assert.equal(new URL(url).hostname,'www.watermelonexperiences.pt');
    return {ok:true,json:async()=>({code:'9963P18',description:'Another experience'})};
  });
  assert.equal(mismatch,null);
});
test('completion calls existing OpenAI integration, requires Viator search and validates output',async()=>{
  const originalFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test-key-not-real';
  try{
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('watermelonexperiences.pt'))return {ok:false};
      assert.equal(url,'https://api.openai.com/v1/responses');
      const body=JSON.parse(options.body);
      assert.equal(body.tool_choice,'required');
      assert.deepEqual(body.tools[0].filters.allowed_domains,['viator.com']);
      assert.ok(body.input.includes('9963P8'));
      return {ok:true,json:async()=>({model:'configured-test-model',output_text:JSON.stringify({summary:'Proposta para rever',fields:[
        {field:'capacity',value:'8',origin:'suggestion',sourceUrl:'',evidence:'',note:'Capacidade proposta, confirmar.'}
      ]})})};
    };
    const result=await completeProductFields(completionRequest({product:{title:'Beach',viatorCode:'9963P8'},fields:['capacity','meetingPoint']}));
    assert.equal(result.fields[0].requiresReview,true);
    assert.equal(result.fields[1].origin,'missing');
    assert.equal(result.model,'configured-test-model');
  }finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('endpoint rejects cross-origin and malformed requests without calling AI',async()=>{
  const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}});
  const cross=response();await handler({method:'POST',headers:{host:'studio.example',origin:'https://other.example'},body:{}},cross);assert.equal(cross.statusCode,403);
  const invalid=response();await handler({method:'POST',headers:{},body:{product:{title:'Beach'},fields:['status']}},invalid);assert.equal(invalid.statusCode,400);
  const get=response();await handler({method:'GET',headers:{}},get);assert.equal(get.statusCode,405);
});
test('review blocks only unchanged, unvalidated AI proposals',()=>{
  const p={capacity:'8',aiCompletion:{fields:{capacity:{value:'8',requiresReview:true,reviewed:false}}}};
  assert.deepEqual(pendingCompletionFields(p),['capacity']);
  p.aiCompletion.fields.capacity.reviewed=true;assert.deepEqual(pendingCompletionFields(p),[]);
});
test('cloud round-trip preserves field provenance, review state and undo history in existing JSON storage',()=>{
  const product={title:'Beach',aiAutoComplete:true,aiSourceUrl:'9963P8',inputSource:{mode:'viator',references:[{type:'viator',url:'https://www.viator.com/tours/Lisbon/Beach/d538-9963P8'}]},
    aiCompletion:{version:1,unsaved:true,fields:{itinerary:{value:'Beach',origin:'suggestion',requiresReview:true,reviewed:false}},history:[{fields:['itinerary'],previous:{itinerary:{value:'',meta:null}}}]}};
  const packed=packCompletionMetadata(product);
  const cloudRow={title:packed.title,inputSource:JSON.parse(JSON.stringify(packed.inputSource))};
  const loaded=unpackCompletionMetadata(cloudRow);
  assert.equal(loaded.aiAutoComplete,true);assert.equal(loaded.aiSourceUrl,'9963P8');
  assert.deepEqual(loaded.aiCompletion.fields,product.aiCompletion.fields);
  assert.deepEqual(loaded.aiCompletion.history,product.aiCompletion.history);
  assert.equal(loaded.inputSource.mode,'viator');assert.equal(loaded.inputSource.references.length,1);
  assert.equal(loaded.aiCompletion.unsaved,false);assert.equal(product.aiCompletion.unsaved,true);
});
test('commas within AI itinerary steps survive the legacy cloud list conversion',()=>{
  const itinerary='Meet the guide, then travel to the beach\nEnjoy free time';
  const product={itinerary,aiCompletion:{fields:{itinerary:{value:itinerary,requiresReview:true,reviewed:false}}}};
  const packed=packCompletionMetadata(product);
  assert.deepEqual(packed.itinerary,['Meet the guide, then travel to the beach','Enjoy free time']);
  const reloaded=unpackCompletionMetadata({itinerary:packed.itinerary.join('\n'),inputSource:packed.inputSource});
  assert.deepEqual(pendingCompletionFields(reloaded),['itinerary']);
});
