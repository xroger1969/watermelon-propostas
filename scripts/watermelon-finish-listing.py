#!/usr/bin/env python3
"""Finish the user-authorised FREE Watermelon listing with verified public APIs.
No secret, customer record, paid price, or guessed privacy declaration is emitted.
"""
import base64, io, json, os, pathlib, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request, zipfile
APP='6821932993'
HOST='https://api.appstoreconnect.apple.com'
OUT=pathlib.Path(os.environ['RUNNER_TEMP'])
SPEC_URL='https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip'
# The reviewed catalogue includes an occasional winery visit, but no games,
# public posting, user-to-user messaging, embedded browser, or ad network.
AGE={
 'advertising':False,'alcoholTobaccoOrDrugUseOrReferences':'INFREQUENT_OR_MILD',
 'contests':'NONE','gambling':False,'gamblingSimulated':'NONE','gunsOrOtherWeapons':'NONE',
 'healthOrWellnessTopics':False,'lootBox':False,'medicalOrTreatmentInformation':'NONE',
 'messagingAndChat':False,'parentalControls':False,'profanityOrCrudeHumor':'NONE','ageAssurance':False,
 'sexualContentGraphicAndNudity':'NONE','sexualContentOrNudity':'NONE','socialMedia':False,
 'socialMediaAgeRestricted':False,'horrorOrFearThemes':'NONE','matureOrSuggestiveThemes':'NONE',
 'unrestrictedWebAccess':False,'userGeneratedContent':False,'violenceCartoonOrFantasy':'NONE',
 'violenceRealisticProlongedGraphicOrSadistic':'NONE','violenceRealistic':'NONE',
 'ageRatingOverride':'NONE','ageRatingOverrideV2':'NONE','koreaAgeRatingOverride':'NONE'}
report={'app_id':APP,'checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'changes':[],'blockers':[],'submitted':False}
# Load only Apple's official public API contract before using account credentials.
try:
 with urllib.request.urlopen(SPEC_URL,timeout=30) as response: archive=response.read(30_000_000)
 with zipfile.ZipFile(io.BytesIO(archive)) as z:
  file=next(n for n in z.namelist() if n.endswith('.json') and not n.startswith('__MACOSX'))
  spec=json.loads(z.read(file))
except Exception as error:
 raise SystemExit('Official API schema unavailable: '+type(error).__name__)
schemas=spec.get('components',{}).get('schemas',{})
def deref(value):
 while isinstance(value,dict) and '$ref' in value:
  value=schemas[value['$ref'].rsplit('/',1)[1]]
 return value
def props(name,parts=()):
 value=deref(schemas[name])
 for part in parts: value=deref(value['properties'][part])
 return value.get('properties',{})
paths=spec.get('paths',{})
report['public_privacy_endpoints']=[p for p in paths if any(s in p.lower() for s in ['privacy','datausage','datacollection'])]
report['public_trader_endpoints']=[p for p in paths if any(s in p.lower() for s in ['trader','compliance'])]
report['public_review_endpoints']=[p for p in paths if any(s in p.lower() for s in ['reviewsubmission','reviewmessage'])]
# Retain only non-secret contract excerpts that are useful for the remaining actions.
selected_names=['AppAvailabilityV2CreateRequest','TerritoryAvailabilityUpdateRequest','ReviewSubmissionCreateRequest','ReviewSubmissionItemCreateRequest','ReviewSubmissionUpdateRequest','AppStoreVersionUpdateRequest','AgeRatingDeclarationUpdateRequest','AppUpdateRequest']
(OUT/'watermelon-api-contract.json').write_text(json.dumps({name:schemas.get(name) for name in selected_names},indent=2))
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
now=int(time.time())
message=b64(json.dumps({'alg':'ES256','kid':os.environ['APPSTORE_API_KEY_ID'],'typ':'JWT'}).encode())+'.'+b64(json.dumps({'iss':os.environ['APPSTORE_ISSUER_ID'],'iat':now,'exp':now+900,'aud':'appstoreconnect-v1'}).encode())
with tempfile.TemporaryDirectory() as directory:
 key=pathlib.Path(directory,'key.p8');key.write_text(os.environ['APPSTORE_API_PRIVATE_KEY']);key.chmod(0o600)
 signature=subprocess.run(['openssl','dgst','-sha256','-sign',str(key)],input=message.encode(),capture_output=True,check=True).stdout
if len(signature)<8 or signature[0]!=48 or signature[1]>=128 or signature[2]!=2: raise SystemExit('Unexpected signing format')
n=signature[3];r=signature[4:4+n];offset=4+n
if signature[offset]!=2: raise SystemExit('Unexpected signing integer')
n=signature[offset+1];s=signature[offset+2:offset+2+n]
token=message+'.'+b64(int.from_bytes(r,'big').to_bytes(32,'big')+int.from_bytes(s,'big').to_bytes(32,'big'))
def call(path,method='GET',body=None):
 if path.startswith(HOST): path=path[len(HOST):]
 if not path.startswith(('/v1/','/v2/')): raise ValueError('Unexpected Apple endpoint')
 request=urllib.request.Request(HOST+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=40) as response:
   data=response.read(); return json.loads(data) if data else {}
 except urllib.error.HTTPError as error:
  try: details=[{'code':e.get('code'),'detail':str(e.get('detail',''))[:500],'source':e.get('source')} for e in json.loads(error.read()).get('errors',[])]
  except Exception: details=[]
  return {'error_status':error.code,'path':path.split('?')[0],'details':details}
def rows(value):
 data=value.get('data',[]);return data if isinstance(data,list) else ([data] if data else [])
def patch(resource,identifier,attributes):
 result=call('/v1/'+resource+'/'+identifier,'PATCH',{'data':{'type':resource,'id':identifier,'attributes':attributes}})
 report['changes'].append({'resource':resource,'success':'error_status' not in result,'error':result if 'error_status' in result else None})
 return result
app_result=call('/v1/apps/'+APP);apps=rows(app_result)
if len(apps)!=1 or apps[0]['attributes'].get('bundleId')!='pt.watermelonexperiences.app':raise SystemExit('Watermelon app identity not confirmed')
version_rows=rows(call('/v1/apps/'+APP+'/appStoreVersions?filter[platform]=IOS&limit=10'))
version=next((v for v in version_rows if v['attributes'].get('versionString')=='1.0'),None)
if not version or version['attributes'].get('appStoreState')!='PREPARE_FOR_SUBMISSION':raise SystemExit('Expected editable version 1.0 not confirmed')
vid=version['id'];report['version_id']=vid
# Rights basis: the owner previously confirmed rights to the Watermelon website
# imagery (29 Sep 2026), authorised reuse of the corresponding Viator product
# imagery (23 Sep), and confirmed operator permission (7 Oct). The native app
# uses those same first-party/authorised supplier products, not unrelated stock.
rights_schema=props('AppUpdateRequest',('data','attributes')).get('contentRightsDeclaration',{})
if 'USES_THIRD_PARTY_CONTENT' in deref(rights_schema).get('enum',[]):
 patch('apps',APP,{'contentRightsDeclaration':'USES_THIRD_PARTY_CONTENT'})
else:report['blockers'].append('Content rights API schema could not be verified')
infos=rows(call('/v1/apps/'+APP+'/appInfos?limit=10'))
for info in infos:
 if info['attributes'].get('appStoreState')!='PREPARE_FOR_SUBMISSION':continue
 declarations=rows(call('/v1/appInfos/'+info['id']+'/ageRatingDeclaration'))
 age_props=props('AgeRatingDeclarationUpdateRequest',('data','attributes'))
 if not declarations:report['blockers'].append('Age declaration unavailable');continue
 attrs={}
 for key,value in AGE.items():
  if key not in age_props:continue
  definition=deref(age_props[key]);enum=definition.get('enum')
  if enum and value not in enum:raise RuntimeError('Age rating value not supported: '+key)
  if definition.get('type')=='boolean' and not isinstance(value,bool):raise RuntimeError('Age boolean mismatch')
  attrs[key]=value
 patch('ageRatingDeclarations',declarations[0]['id'],attrs)
 report['age_rating_readback']=[x.get('attributes',{}) for x in rows(call('/v1/appInfos/'+info['id']+'/ageRatingDeclaration'))]
 report['app_info_after']=[x.get('attributes',{}) for x in rows(call('/v1/appInfos/'+info['id']))]
report['content_rights_readback']=[x['attributes'].get('contentRightsDeclaration') for x in rows(call('/v1/apps/'+APP))]
# Inspect availability; do not silently change the existing storefront selection.
availability=call('/v1/apps/'+APP+'/appAvailabilityV2')
report['availability_error']=availability if 'error_status' in availability else None
report['availability']=[]
for available in rows(availability):
 entry={'id':available['id'],'attributes':available.get('attributes',{}),'territories':[]}
 endpoint='/v2/appAvailabilities/'+available['id']+'/territoryAvailabilities?include=territory&limit=200'
 for _ in range(3):
  results=call(endpoint)
  if 'error_status' in results:entry['error']=results;break
  for item in rows(results):
   attrs=item.get('attributes',{});tid=item.get('relationships',{}).get('territory',{}).get('data',{}).get('id')
   entry['territories'].append({'territory':tid,**attrs})
  endpoint=results.get('links',{}).get('next')
  if not endpoint:break
 report['availability'].append(entry)
# Read back price, screenshots and uploaded binaries; preparation != submission.
report['prices']=[]
for schedule in rows(call('/v1/apps/'+APP+'/appPriceSchedule?include=baseTerritory')):
 prices=call('/v1/appPriceSchedules/'+schedule['id']+'/manualPrices?include=appPricePoint&limit=200')
 report['prices'] += [x['attributes'].get('customerPrice') for x in prices.get('included',[]) if x['type']=='appPricePoints']
result=call('/v1/builds?filter[app]='+APP+'&sort=-uploadedDate&limit=5&include=preReleaseVersion')
pre={x['id']:x['attributes'].get('version') for x in result.get('included',[]) if x['type']=='preReleaseVersions'}
report['builds']=[{'id':x['id'],'build':x['attributes'].get('version'),'version':pre.get(x.get('relationships',{}).get('preReleaseVersion',{}).get('data',{}).get('id')),'processing':x['attributes'].get('processingState')} for x in rows(result)]
report['review_submissions']=[{'id':x['id'],'attributes':x.get('attributes',{})} for x in rows(call('/v1/apps/'+APP+'/reviewSubmissions?limit=20'))]
report['localizations']=[]
for loc in rows(call('/v1/appStoreVersions/'+vid+'/appStoreVersionLocalizations')):
 data={'locale':loc['attributes'].get('locale'),'id':loc['id'],'screenshots':[]}
 for screenshot_set in rows(call('/v1/appStoreVersionLocalizations/'+loc['id']+'/appScreenshotSets')):
  data['screenshots'].append({'display':screenshot_set['attributes'].get('screenshotDisplayType'),'states':[x['attributes'].get('assetDeliveryState',{}).get('state') for x in rows(call('/v1/appScreenshotSets/'+screenshot_set['id']+'/appScreenshots?limit=50'))]})
 report['localizations'].append(data)
if not report['public_privacy_endpoints']:report['blockers'].append('The official public API has no App Privacy questionnaire endpoint; authenticated App Store Connect web entry is required')
text=json.dumps(report,indent=2);print(text)
(OUT/'watermelon-finish-listing-result.json').write_text(text)
