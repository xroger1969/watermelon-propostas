import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCommercialCopy,cleanDraftProduct} from '../lib/commercial-copy.js';
import {completionSourceReference,completionRequest,normalizeCompletion} from '../lib/product-completion.js';

const sourceUrl='https://www.getyourguide.com/pt-pt/lisboa-l42/costa-da-caparica-t836010/?ranking_uuid=d7870ab8-5756-4a63-b3ee-6a2147fca8c4&q=Almada';

test('removes web citations from commercial prose, not from source metadata',()=>{
  const text='Explore the coast with three panoramic viewpoints. ([getyourguide.com]('+sourceUrl+'))';
  const alt='Private guided sightseeing outing. (getyourguide.com)('+sourceUrl+')';
  assert.equal(cleanCommercialCopy(text),'Explore the coast with three panoramic viewpoints.');
  assert.equal(cleanCommercialCopy(alt),'Private guided sightseeing outing.');
  const product=cleanDraftProduct({
    summary:text,
    included:[alt],
    sourceReferences:[{type:'url',url:sourceUrl}]
  });
  assert.equal(product.summary,'Explore the coast with three panoramic viewpoints.');
  assert.deepEqual(product.included,['Private guided sightseeing outing.']);
  assert.equal(product.sourceReferences[0].url,sourceUrl);
});

test('converts escaped linebreaks and deduplicates list entries',()=>{
  const product=cleanDraftProduct({
    description:'Explore the coast.\\nDiscover local traditions.',
    itinerary:['Meet your guide.\\nExplore the beaches.','Explore the beaches.','Enjoy the viewpoints.'],
    highlights:['Coastal views','Coastal views']
  });
  assert.equal(product.description,'Explore the coast.\nDiscover local traditions.');
  assert.deepEqual(product.itinerary,['Meet your guide.','Explore the beaches.','Enjoy the viewpoints.']);
  assert.deepEqual(product.highlights,['Coastal views']);
});

test('only accepts a safe specific GetYourGuide URL, canonicalizing tracking params',()=>{
  const ref=completionSourceReference(sourceUrl);
  assert.equal(ref.provider,'getyourguide');
  assert.equal(ref.activityId,'836010');
  assert.equal(ref.reference,'https://www.getyourguide.com/pt-pt/lisboa-l42/costa-da-caparica-t836010/');
  for(const unsafe of [
    'https://getyourguide.com.evil.example/tour-t836010/',
    'http://getyourguide.com/x-t836010/',
    'https://user@getyourguide.com/x-t836010/',
    'https://www.getyourguide.com/pt-pt/lisboa-l42/',
  ])assert.throws(()=>completionSourceReference(unsafe));
});

test('only marks verified GetYourGuide references as exact-source facts',()=>{
  const exact='https://www.getyourguide.com/en-gb/lisbon-l42/costa-da-caparica-t836010/';
  const other='https://www.getyourguide.com/en-gb/lisbon-l42/other-tour-t919999/';
  const request=completionRequest({product:{title:'Costa da Caparica'},reference:sourceUrl,fields:['summary','included']});
  const result=normalizeCompletion({fields:[
    {field:'summary',value:'A beautiful coast. ([getyourguide.com]('+exact+'))',
      origin:'getyourguide',sourceUrl:exact,evidence:'Coastal experience'},
    {field:'included',value:'Hotel pickup',origin:'getyourguide',sourceUrl:other,evidence:'Hotel pickup'}
  ]},request,[{url:exact},{url:other}]);
  assert.deepEqual(result.fields.map(p=>p.origin),['getyourguide','suggestion']);
  assert.equal(result.fields[0].value,'A beautiful coast.');
  assert.equal(result.fields[0].sourceUrl,exact);
  assert.equal(result.fields[1].sourceUrl,'');
  assert.ok(result.fields.every(p=>p.requiresReview));
});
