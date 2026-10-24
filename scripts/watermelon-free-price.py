#!/usr/bin/env python3
"""Configure the user's explicitly authorised FREE app price; never use a paid point."""
import base64, decimal, json, os, pathlib, subprocess, tempfile, time, urllib.error, urllib.request
APP='6821932993'; HOST='https://api.appstoreconnect.apple.com'
def b64(value): return base64.urlsafe_b64encode(value).rstrip(b'=').decode()
now=int(time.time())
header={'alg':'ES256','kid':os.environ['APPSTORE_API_KEY_ID'],'typ':'JWT'}
claims={'iss':os.environ['APPSTORE_ISSUER_ID'],'iat':now,'exp':now+900,'aud':'appstoreconnect-v1'}
message=b64(json.dumps(header).encode())+'.'+b64(json.dumps(claims).encode())
with tempfile.TemporaryDirectory() as directory:
    key=pathlib.Path(directory,'key.p8'); key.write_text(os.environ['APPSTORE_API_PRIVATE_KEY']); key.chmod(0o600)
    sig=subprocess.run(['openssl','dgst','-sha256','-sign',str(key)],input=message.encode(),capture_output=True,check=True).stdout
if len(sig)<8 or sig[0]!=48 or sig[1]>=128 or sig[2]!=2: raise SystemExit('Unexpected signing format')
n=sig[3]; r=sig[4:4+n]; offset=4+n
if sig[offset]!=2: raise SystemExit('Unexpected signing integer')
n=sig[offset+1]; s=sig[offset+2:offset+2+n]
token=message+'.'+b64(int.from_bytes(r,'big').to_bytes(32,'big')+int.from_bytes(s,'big').to_bytes(32,'big'))
def call(path,method='GET',body=None):
    if path.startswith(HOST): path=path[len(HOST):]
    if not path.startswith(('/v1/','/v2/')): raise ValueError('Non-Apple endpoint rejected')
    req=urllib.request.Request(HOST+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            data=response.read(); return json.loads(data) if data else {}
    except urllib.error.HTTPError as error:
        try: codes=[x.get('code') for x in json.loads(error.read()).get('errors',[])]
        except Exception: codes=[]
        return {'error_status':error.code,'codes':codes}
def rows(result):
    data=result.get('data',[]); return data if isinstance(data,list) else ([data] if data else [])
def zero(value):
    try: return decimal.Decimal(str(value))==0
    except decimal.InvalidOperation: return False
report={'app_id':APP,'only_zero_price_authorised':True,'configured':False,'verified':False,'review_submitted':False}
version=call('/v1/apps/'+APP+'/appStoreVersions?filter[platform]=IOS&limit=20')
if not any(v.get('attributes',{}).get('versionString')=='1.0' and v.get('attributes',{}).get('appStoreState')=='PREPARE_FOR_SUBMISSION' for v in rows(version)):
    raise SystemExit('Watermelon editable 1.0 version not confirmed; no price changed')
point=None; path='/v1/apps/'+APP+'/appPricePoints?filter[territory]=PRT&include=territory&limit=200'
for _ in range(10):
    result=call(path)
    if 'error_status' in result:
        report['price_point_error']=result; break
    point=next((x for x in rows(result) if zero(x.get('attributes',{}).get('customerPrice'))),None)
    if point: break
    path=result.get('links',{}).get('next')
    if not path: break
if point:
    territory=point.get('relationships',{}).get('territory',{}).get('data',{}).get('id')
    if territory and territory!='PRT': raise SystemExit('Price point territory mismatch')
    report['selected_price']='0'; report['base_territory']='PRT'; report['price_point_id']=point['id']
    body={'data':{'type':'appPriceSchedules','relationships':{
        'app':{'data':{'type':'apps','id':APP}},
        'baseTerritory':{'data':{'type':'territories','id':'PRT'}},
        'manualPrices':{'data':[{'type':'appPrices','id':'${free-price}'}]}}},
        'included':[{'type':'appPrices','id':'${free-price}','attributes':{'startDate':None,'endDate':None},
            'relationships':{'app':{'data':{'type':'apps','id':APP}},'appPricePoint':{'data':{'type':'appPricePoints','id':point['id']}}}}]}
    changed=call('/v1/appPriceSchedules','POST',body)
    report['configured']='error_status' not in changed
    report['change_error']=changed.get('error_status'); report['change_codes']=changed.get('codes')
    schedule=call('/v1/apps/'+APP+'/appPriceSchedule?include=baseTerritory')
    for item in rows(schedule):
        report['readback_base_territory']=item.get('relationships',{}).get('baseTerritory',{}).get('data',{}).get('id')
        prices=call('/v1/appPriceSchedules/'+item['id']+'/manualPrices?include=appPricePoint&limit=200')
        values=[x.get('attributes',{}).get('customerPrice') for x in prices.get('included',[]) if x.get('type')=='appPricePoints']
        report['readback_prices']=values; report['readback_error']=prices.get('error_status')
        report['verified']=bool(values) and all(zero(value) for value in values)
else:
    report['reason']='No verified zero-price point found. No price change attempted.'
text=json.dumps(report,indent=2); print(text)
pathlib.Path(os.environ['RUNNER_TEMP'],'watermelon-free-price-result.json').write_text(text)
