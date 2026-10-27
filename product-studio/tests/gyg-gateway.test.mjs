import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/gyg-supplier.js';
import { buildAvailabilityNotification, sendAvailabilityNotification } from '../lib/gyg-notify.js';

function request(method,operation,headers={},body=null,query={}) {
  return {method,headers,body,query:{operation,...query}};
}
function mockResponse() {
  return {
    headers:{},statusCode:200,data:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(d){this.data=d;return this;}
  };
}
test('Sandbox is closed by default, with no configuration',async()=>{
  const keys=['GYG_SUPPLIER_MODE','GYG_SUPPLIER_ENABLED','GYG_SUPPLIER_BASIC_USER','GYG_SUPPLIER_BASIC_PASSWORD'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    for(const key of keys)delete process.env[key];
    const res=mockResponse();
    await handler(request('GET','get-availabilities'),res);
    assert.equal(res.statusCode,503);
    assert.equal(res.data.errorCode,'INTERNAL_SYSTEM_FAILURE');
  } finally {
    for(const key of keys) old[key]===undefined?delete process.env[key]:process.env[key]=old[key];
  }
});
test('Notification refuses unauthorized outbound calls',async()=>{
  let calls=0;
  const result=await sendAvailabilityNotification(
    {data:{productId:'WM-T',availabilities:[{dateTime:'2026-11-03T10:00:00+00:00',vacancies:0}]}},
    {},async()=>{calls++;return{status:202}});
  assert.equal(calls,0);
  assert.equal(result.sent,false);
});
test('Notification payload rejects invalid counts and dates',()=>{
  assert.throws(()=>buildAvailabilityNotification('T',[{dateTime:'bad',vacancies:1}]));
  assert.throws(()=>buildAvailabilityNotification('T',[{dateTime:'2026-11-03T10:00:00Z',vacancies:-1}]));
  assert.deepEqual(buildAvailabilityNotification('WM-1',[{dateTime:'2026-11-03T10:00:00Z',vacancies:0}]),
    {data:{productId:'WM-1',availabilities:[{dateTime:'2026-11-03T10:00:00Z',vacancies:0}]}});
});

test('Production refuses sandbox even if someone sets its flags',async()=>{
  const values={
    VERCEL_ENV:'production', GYG_SUPPLIER_MODE:'sandbox', GYG_SUPPLIER_ENABLED:'true',
    GYG_SUPPLIER_BASIC_USER:'test', GYG_SUPPLIER_BASIC_PASSWORD:'secret',
    SUPABASE_PRODUCT_STUDIO_URL:'https://example.supabase.co',
    PRODUCT_STUDIO_INTERNAL_KEY:'test-key'
  };
  const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,values);
    const res=mockResponse();
    await handler(request('GET','get-availabilities',{authorization:'Basic dGVzdDpzZWNyZXQ='}),res);
    assert.equal(res.statusCode,503);
  }finally{
    for(const key of Object.keys(values))old[key]===undefined?delete process.env[key]:process.env[key]=old[key];
  }
});
