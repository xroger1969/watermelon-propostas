#!/usr/bin/env python3
"""Upload reviewed real simulator captures to Watermelon 1.0. Never submit review."""
import base64, hashlib, json, os, pathlib, struct, subprocess, tempfile, time, urllib.request, urllib.parse, urllib.error
APP='6821932993'; HOST='https://api.appstoreconnect.apple.com'
ROOT=pathlib.Path(os.environ['CAPTURE_ARTIFACTS'])
# SHA256 pins identify the exact unmodified images visually reviewed before upload.
CAPTURES={
 'iphone': ('APP_IPHONE_67',(1320,2868),{
 '01-Explore':'5ab1443b8b54779048ea338ac29ed6b26f2e037e42495867420aa21b89b73e0e',
 '02-Watermelon-AI':'7fda252132f6cb7a60746f7300570f717cbe42f56fb4a7c70c5e9eee4aa7971b',
 '03-Proposals':'137953f17114b33ef17e77bd0886cae08897384385842185fd71d00ad932ad7f',
 '04-My-Trips':'2ebabc570ea760d01eeffc63e3f8f42ad9b7420cb76ad51acaebf94c258e6dab'}),
 'ipad': ('APP_IPAD_PRO_3GEN_129',(2064,2752),{
 '01-Explore':'d7f6da87a1fbaa55c26099645c584a8cbed9601dade21c90a68f06ed183cf46c',
 '02-Watermelon-AI':'82cff3dfbd50a732e6d8f697b38f20813cc5fbf305083b18597a2905299ccfc7',
 '03-Proposals':'afc03ae82a10155ee73d6cbe7dd8e3ae3a874a540ab3a11cb4cc594438329d5d',
 '04-My-Trips':'de299c54d75606778caf7436a0cfbe259e8606a81420db1a24717447949d2ce7'})}
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
now=int(time.time()); message=b64(json.dumps({'alg':'ES256','kid':os.environ['APPSTORE_API_KEY_ID'],'typ':'JWT'}).encode())+'.'+b64(json.dumps({'iss':os.environ['APPSTORE_ISSUER_ID'],'iat':now,'exp':now+1200,'aud':'appstoreconnect-v1'}).encode())
with tempfile.TemporaryDirectory() as directory:
 key=pathlib.Path(directory,'key.p8'); key.write_text(os.environ['APPSTORE_API_PRIVATE_KEY']); key.chmod(0o600)
 sig=subprocess.run(['openssl','dgst','-sha256','-sign',str(key)],input=message.encode(),capture_output=True,check=True).stdout
if sig[:1]!=b'0' or sig[1]>=128 or sig[2]!=2: raise SystemExit('Unexpected signature')
n=sig[3]; r=sig[4:4+n]; offset=4+n
if sig[offset]!=2: raise SystemExit('Unexpected signature integer')
n=sig[offset+1]; s=sig[offset+2:offset+2+n]
token=message+'.'+b64(int.from_bytes(r,'big').to_bytes(32,'big')+int.from_bytes(s,'big').to_bytes(32,'big'))
def call(path,method='GET',body=None):
 if not path.startswith('/v1/'): raise ValueError('Non-Apple API endpoint')
 req=urllib.request.Request(HOST+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=40) as response:
   data=response.read(); return json.loads(data) if data else {}
 except urllib.error.HTTPError as error:
  try: details=[{'code':x.get('code'),'detail':str(x.get('detail',''))[:250]} for x in json.loads(error.read()).get('errors',[])]
  except Exception: details=[]
  raise RuntimeError(json.dumps({'status':error.code,'path':path.split('?')[0],'details':details})) from None
def rows(result):
 data=result.get('data',[]); return data if isinstance(data,list) else ([data] if data else [])
versions=rows(call('/v1/apps/'+APP+'/appStoreVersions?filter[platform]=IOS&limit=20'))
versions=[v for v in versions if v['attributes'].get('versionString')=='1.0' and v['attributes'].get('appStoreState')=='PREPARE_FOR_SUBMISSION']
if len(versions)!=1: raise SystemExit('No unique editable Watermelon 1.0 listing')
vid=versions[0]['id']; locales=rows(call('/v1/appStoreVersions/'+vid+'/appStoreVersionLocalizations'))
localization=next((x for x in locales if x['attributes'].get('locale')=='en-US'),None)
if not localization: raise SystemExit('English listing is missing')
lid=localization['id']; sets=rows(call('/v1/appStoreVersionLocalizations/'+lid+'/appScreenshotSets'))
report={'app_id':APP,'version':'1.0','review_submitted':False,'screenshots':[]}
for family,(display,dimensions,pins) in CAPTURES.items():
 root=ROOT/('watermelon-appstore-'+family)
 manifest=json.loads(next(root.rglob('manifest.json')).read_text())
 attachments=[a for test in manifest for a in test.get('attachments',[]) if not a.get('isAssociatedWithFailure')]
 validated=[]
 for name,digest in pins.items():
  matches=[a for a in attachments if a.get('suggestedHumanReadableName','').startswith(name+'_')]
  if len(matches)!=1: raise RuntimeError('Missing or ambiguous reviewed screenshot: '+family+'/'+name)
  match=matches[0]; filename=match['exportedFileName']
  if pathlib.Path(filename).name!=filename: raise RuntimeError('Unsafe artifact filename')
  path=next(root.rglob(filename)); data=path.read_bytes()
  if hashlib.sha256(data).hexdigest()!=digest: raise RuntimeError('Screenshot differs from reviewed asset')
  if data[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',data[16:24])!=dimensions or data[25]!=2:
   raise RuntimeError('Invalid screenshot format, resolution or alpha channel')
  validated.append((name,data))
 screenshot_set=next((x for x in sets if x['attributes'].get('screenshotDisplayType')==display),None)
 if not screenshot_set:
  screenshot_set=call('/v1/appScreenshotSets','POST',{'data':{'type':'appScreenshotSets','attributes':{'screenshotDisplayType':display},'relationships':{'appStoreVersionLocalization':{'data':{'type':'appStoreVersionLocalizations','id':lid}}}}})['data']
 sid=screenshot_set['id']; existing=rows(call('/v1/appScreenshotSets/'+sid+'/appScreenshots?limit=50'))
 for name,data in validated:
  filename='watermelon-'+family+'-'+name+'.png'; checksum=hashlib.md5(data).hexdigest()
  shot=next((x for x in existing if x['attributes'].get('fileName')==filename and x['attributes'].get('sourceFileChecksum')==checksum and x['attributes'].get('assetDeliveryState',{}).get('state')=='COMPLETE'),None)
  if not shot:
   if len(existing)>=10: raise RuntimeError('Screenshot set is full; no existing assets removed')
   shot=call('/v1/appScreenshots','POST',{'data':{'type':'appScreenshots','attributes':{'fileName':filename,'fileSize':len(data)},'relationships':{'appScreenshotSet':{'data':{'type':'appScreenshotSets','id':sid}}}}})['data']
   for operation in shot['attributes'].get('uploadOperations',[]):
    url=operation['url']; parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password: raise RuntimeError('Unsafe upload destination')
    start=operation['offset']; size=operation['length']
    if start<0 or size<=0 or start+size>len(data): raise RuntimeError('Invalid upload byte range')
    # Use only headers supplied by Apple for this signed upload. Never forward the JWT.
    headers={h['name']:h['value'] for h in operation.get('requestHeaders',[])}
    if any(k.lower()=='authorization' for k in headers): raise RuntimeError('Unexpected credential header')
    upload=urllib.request.Request(url,data=data[start:start+size],method=operation['method'],headers=headers)
    try:
     with urllib.request.urlopen(upload,timeout=60) as response: response.read()
    except urllib.error.HTTPError as error: raise RuntimeError('Screenshot byte upload failed: HTTP '+str(error.code)) from None
   shot=call('/v1/appScreenshots/'+shot['id'],'PATCH',{'data':{'type':'appScreenshots','id':shot['id'],'attributes':{'uploaded':True,'sourceFileChecksum':checksum}}})['data']
   existing.append(shot)
  for attempt in range(20):
   state=shot['attributes'].get('assetDeliveryState',{}).get('state')
   if state in ('COMPLETE','FAILED'): break
   time.sleep(3); shot=call('/v1/appScreenshots/'+shot['id'])['data']
  report['screenshots'].append({'device':family,'name':filename,'id':shot['id'],'state':shot['attributes'].get('assetDeliveryState',{}).get('state')})
report['all_complete']=len(report['screenshots'])==8 and all(x['state']=='COMPLETE' for x in report['screenshots'])
text=json.dumps(report,indent=2); print(text)
pathlib.Path(os.environ['RUNNER_TEMP'],'watermelon-screenshots-upload-result.json').write_text(text)
if not report['all_complete']: raise SystemExit('Some screenshots are not yet COMPLETE')
