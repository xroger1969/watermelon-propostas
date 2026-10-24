#!/usr/bin/env python3
"""Finish the owner's authorised free public submission; report any Apple rejection.
Never substitute an older binary or invent App Privacy/trader responses.
"""
import json,os,pathlib,time,urllib.request,urllib.error
OUT=pathlib.Path(os.environ['RUNNER_TEMP'])
APP='6821932993';EXPECTED_SHA='90dcb27c9607be8271bb18f205f245e40b775b5a';RUN=40088893798;BUILD='7401'
report={'app_id':APP,'expected_build':BUILD,'review_submitted':False,'actions':[],'blockers':[]}
def save():
 text=json.dumps(report,indent=2);print(text)
 (OUT/'watermelon-public-submission-result.json').write_text(text)
class Stop(Exception):pass
try:
 # Verify the exact main-branch workflow, including its signed binary upload.
 state={}
 for attempt in range(13):
  req=urllib.request.Request('https://api.github.com/repos/xroger1969/watermelon-propostas/actions/runs/'+str(RUN),headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  with urllib.request.urlopen(req,timeout=30) as response: state=json.load(response)
  if state.get('head_sha')!=EXPECTED_SHA or state.get('head_branch')!='main':raise RuntimeError('Unexpected release source')
  if state.get('status')=='completed':break
  if attempt<12:time.sleep(30)
 report['release_workflow']={'id':RUN,'status':state.get('status'),'conclusion':state.get('conclusion')}
 if state.get('status')!='completed' or state.get('conclusion')!='success':
  report['blockers'].append('The exact release workflow has not successfully completed; no old binary substituted.')
  raise Stop()
 # Reuse the reviewed public-API client, without executing its mutation section.
 source=pathlib.Path('scripts/watermelon-finish-listing.py').read_text()
 marker='app_result=call('
 if source.count(marker)!=1:raise RuntimeError('Public API client boundary changed')
 namespace={'__name__':'watermelon_public_api'}
 exec(compile(source.split(marker)[0],'reviewed-public-api-client','exec'),namespace)
 call=namespace['call'];rows=namespace['rows']
 def require(result,label):
  if 'error_status' in result:
   report['blockers'].append({'step':label,**result});raise Stop()
  return result
 app=rows(require(call('/v1/apps/'+APP),'read app'))
 if len(app)!=1 or app[0]['attributes'].get('bundleId')!='pt.watermelonexperiences.app':raise RuntimeError('Wrong app')
 if app[0]['attributes'].get('contentRightsDeclaration')!='USES_THIRD_PARTY_CONTENT':
  report['blockers'].append('Confirmed content rights declaration is absent');raise Stop()
 versions=rows(require(call('/v1/apps/'+APP+'/appStoreVersions?filter[platform]=IOS&limit=20'),'read version'))
 version=next((v for v in versions if v['attributes'].get('versionString')=='1.0'),None)
 if not version:raise RuntimeError('Missing public 1.0 version')
 vid=version['id'];report['version_id']=vid;report['app_store_state']=version['attributes'].get('appStoreState')
 if report['app_store_state'] in ('WAITING_FOR_REVIEW','IN_REVIEW','PENDING_APPLE_RELEASE','PENDING_DEVELOPER_RELEASE','READY_FOR_SALE'):
  report['review_submitted']=True;report['actions'].append('Already submitted; no duplicate submission');raise Stop()
 if report['app_store_state']!='PREPARE_FOR_SUBMISSION':
  report['blockers'].append('Version is not editable for this release');raise Stop()
 prices=[]
 for schedule in rows(require(call('/v1/apps/'+APP+'/appPriceSchedule'),'read price schedule')):
  value=require(call('/v1/appPriceSchedules/'+schedule['id']+'/manualPrices?include=appPricePoint&limit=200'),'read prices')
  prices += [x['attributes'].get('customerPrice') for x in value.get('included',[]) if x['type']=='appPricePoints']
 from decimal import Decimal
 if not prices or not all(Decimal(p)==0 for p in prices):raise RuntimeError('Free pricing not verified')
 report['price_verified']='0'
 builds=require(call('/v1/builds?filter[app]='+APP+'&filter[version]='+BUILD+'&include=preReleaseVersion'),'read consent binary')
 pre={x['id']:x['attributes'].get('version') for x in builds.get('included',[]) if x['type']=='preReleaseVersions'}
 candidates=[x for x in rows(builds) if x['attributes'].get('version')==BUILD and x['attributes'].get('processingState')=='VALID' and pre.get(x.get('relationships',{}).get('preReleaseVersion',{}).get('data',{}).get('id'))=='1.0']
 if len(candidates)!=1:report['blockers'].append('Exact privacy-consent build is not yet VALID');raise Stop()
 build=candidates[0];report['build_id']=build['id']
 selected=require(call('/v1/appStoreVersions/'+vid,'PATCH',{'data':{'type':'appStoreVersions','id':vid,'relationships':{'build':{'data':{'type':'builds','id':build['id']}}}}}),'select build')
 actual=rows(require(call('/v1/appStoreVersions/'+vid+'/build'),'verify selected build'))
 if len(actual)!=1 or actual[0]['id']!=build['id']:raise RuntimeError('Build selection readback differs')
 report['actions'].append('Selected and read back version 1.0 build '+BUILD)
 # Apple's review-item and submission validation provides the authoritative list
 # of remaining requirements. No privacy statement is fabricated to bypass it.
 existing=rows(require(call('/v1/apps/'+APP+'/reviewSubmissions?filter[platform]=IOS&limit=20'),'read review submissions'))
 editable=[x for x in existing if x['attributes'].get('state')=='READY_FOR_REVIEW']
 active=[x for x in existing if x['attributes'].get('state') in ('WAITING_FOR_REVIEW','IN_REVIEW')]
 if active:
  report['blockers'].append('Another active public submission exists; not creating a duplicate');raise Stop()
 if len(editable)>1:raise RuntimeError('Ambiguous public review draft')
 if editable:submission=editable[0]
 else:
  submission=require(call('/v1/reviewSubmissions','POST',{'data':{'type':'reviewSubmissions','attributes':{'platform':'IOS'},'relationships':{'app':{'data':{'type':'apps','id':APP}}}}}),'create review draft')['data']
 sid=submission['id'];report['review_submission_id']=sid
 items=rows(require(call('/v1/reviewSubmissions/'+sid+'/items'),'read review items'))
 if not any(x.get('relationships',{}).get('appStoreVersion',{}).get('data',{}).get('id')==vid for x in items):
  require(call('/v1/reviewSubmissionItems','POST',{'data':{'type':'reviewSubmissionItems','relationships':{'reviewSubmission':{'data':{'type':'reviewSubmissions','id':sid}},'appStoreVersion':{'data':{'type':'appStoreVersions','id':vid}}}}}),'add version to review')
  report['actions'].append('Added version 1.0 to public review draft')
 sent=require(call('/v1/reviewSubmissions/'+sid,'PATCH',{'data':{'type':'reviewSubmissions','id':sid,'attributes':{'submitted':True}}}),'submit public review')
 final=rows(require(call('/v1/reviewSubmissions/'+sid),'verify public submission'))
 report['submission_state']=final[0]['attributes'].get('state') if final else None
 report['review_submitted']=report['submission_state'] in ('WAITING_FOR_REVIEW','IN_REVIEW','COMPLETED')
 if not report['review_submitted']:report['blockers'].append('Apple did not confirm a submitted review state')
except Stop:pass
except Exception as error:
 report['blockers'].append({'unexpected_error_type':type(error).__name__,'message':str(error)[:250] if isinstance(error,RuntimeError) else 'Operation failed; no success assumed.'})
finally:save()
