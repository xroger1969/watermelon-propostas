#!/usr/bin/env python3
"""Prepare the already-authorized Watermelon listing. Never submits review or charges users.
Credentials are read only from the protected CI environment and never logged.
"""
import base64
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

APP_ID = '6821932993'
API = 'https://api.appstoreconnect.apple.com'
APPLY = os.environ.get('WATERMELON_APPLY_METADATA') == 'true'

def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode()

def access_token():
    for name in ('APPSTORE_ISSUER_ID', 'APPSTORE_API_KEY_ID', 'APPSTORE_API_PRIVATE_KEY'):
        if not os.environ.get(name):
            raise RuntimeError('Required protected Apple configuration is missing: ' + name)
    now = int(time.time())
    header = {'alg': 'ES256', 'kid': os.environ['APPSTORE_API_KEY_ID'], 'typ': 'JWT'}
    claims = {'iss': os.environ['APPSTORE_ISSUER_ID'], 'iat': now, 'exp': now+900, 'aud': 'appstoreconnect-v1'}
    message = encode(json.dumps(header).encode()) + '.' + encode(json.dumps(claims).encode())
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory, 'key.p8')
        path.write_text(os.environ['APPSTORE_API_PRIVATE_KEY'])
        path.chmod(0o600)
        der = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(path)], input=message.encode(), capture_output=True, check=True).stdout
    if len(der) < 8 or der[0] != 48 or der[1] >= 128 or der[2] != 2:
        raise RuntimeError('Unexpected signing response')
    size = der[3]; r = der[4:4+size]; offset = 4+size
    if der[offset] != 2:
        raise RuntimeError('Invalid signing response')
    size = der[offset+1]; s = der[offset+2:offset+2+size]
    signature = int.from_bytes(r, 'big').to_bytes(32, 'big') + int.from_bytes(s, 'big').to_bytes(32, 'big')
    return message + '.' + encode(signature)

TOKEN = access_token()
report = {'app_id': APP_ID, 'applied': APPLY, 'changes': [], 'remaining': [], 'review_submitted': False}

def request(path, method='GET', body=None):
    if not path.startswith(('/v1/', '/v2/')) or '..' in path:
        raise ValueError('Unexpected Apple endpoint')
    req = urllib.request.Request(API+path, data=None if body is None else json.dumps(body).encode(), method=method,
        headers={'Authorization': 'Bearer '+TOKEN, 'Accept': 'application/json', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as error:
        try:
            codes = [item.get('code') for item in json.loads(error.read()).get('errors', [])]
        except Exception:
            codes = []
        return {'error_status': error.code, 'codes': codes, 'path': path.split('?')[0]}

def rows(result):
    data = result.get('data', [])
    return data if isinstance(data, list) else ([data] if data else [])

def patch(resource, identifier, attributes=None, relationships=None):
    data = {'type': resource, 'id': identifier}
    if attributes is not None: data['attributes'] = attributes
    if relationships is not None: data['relationships'] = relationships
    if not APPLY:
        report['changes'].append({'resource': resource, 'status': 'dry-run'})
        return
    result = request('/v1/'+resource+'/'+identifier, 'PATCH', {'data': data})
    report['changes'].append({'resource': resource, 'id': identifier, 'success': 'error_status' not in result,
                              'error': result.get('error_status'), 'codes': result.get('codes')})

versions = rows(request('/v1/apps/'+APP_ID+'/appStoreVersions?filter[platform]=IOS&limit=20'))
candidates = [v for v in versions if v['attributes'].get('versionString') == '1.0' and v['attributes'].get('appStoreState') in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED')]
if len(candidates) != 1:
    raise SystemExit('No unique editable Watermelon 1.0 version; no changes made')
version = candidates[0]; version_id = version['id']
localizations = rows(request('/v1/appStoreVersions/'+version_id+'/appStoreVersionLocalizations'))
locale = next((loc for loc in localizations if loc['attributes'].get('locale') == 'en-US'), None)
if locale is None:
    raise SystemExit('Expected English listing is absent; no changes made')
description = '''Discover Portugal with Watermelon Experiences.

Explore our tours and activities, view photographs, itineraries and available prices, and save the experiences you like.

Plan a personalised programme with Watermelon AI. Ask about travel ideas or use voice input to describe the experience you are looking for.

Request a reservation or a tailored proposal directly from Watermelon. Choose your preferred date, option and number of guests. Our team checks availability and confirms the arrangements before requesting payment.

Keep your requests and travel information in My Trips. For eligible confirmed requests, continue to Watermelon's payment page using the payment options provided by our team.

The app is free to download and use. Tours and experiences are paid real-world services. Prices, availability and final arrangements are subject to confirmation by Watermelon Experiences.'''
patch('appStoreVersionLocalizations', locale['id'], {
    'description': description,
    'keywords': 'Portugal,tours,Lisbon,Arrabida,Setubal,experiences,travel,activities,private,planner',
    'supportUrl': 'https://www.watermelonexperiences.pt/support',
    'marketingUrl': 'https://www.watermelonexperiences.pt/',
    'promotionalText': 'Explore Watermelon experiences in Portugal, plan with AI and request your personalised programme. Free app; paid tours and activities.'})
patch('appStoreVersions', version_id, {'copyright': '2026 Watermelon Experiences'})

infos = rows(request('/v1/apps/'+APP_ID+'/appInfos?limit=10'))
editable = [info for info in infos if info['attributes'].get('appStoreState') in ('PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED')]
if len(editable) == 1:
    info = editable[0]
    categories = rows(request('/v1/appCategories?filter[platforms]=IOS&limit=200'))
    travel = next((item for item in categories if item['id'] == 'TRAVEL'), None)
    if travel:
        patch('appInfos', info['id'], relationships={'primaryCategory': {'data': {'type': 'appCategories', 'id': travel['id']}}})
    else:
        report['remaining'].append('Travel category needs verification')
    for loc in rows(request('/v1/appInfos/'+info['id']+'/appInfoLocalizations')):
        if loc['attributes'].get('locale') == 'en-US':
            patch('appInfoLocalizations', loc['id'], {'subtitle': 'Portugal tours & experiences', 'privacyPolicyUrl': 'https://www.watermelonexperiences.pt/privacy'})
    age = request('/v1/appInfos/'+info['id']+'/ageRatingDeclaration')
    report['age_rating_fields'] = [item.get('attributes', {}) for item in rows(age)]
else:
    report['remaining'].append('App information requires manual verification')

review_attributes = {'contactFirstName': 'Carlos', 'contactLastName': 'Vasconcelos',
 'contactPhone': '+351918404101', 'contactEmail': 'info@watermelonexperiences.pt', 'demoAccountRequired': False,
 'notes': 'This free native app sells real-world tourism experiences in Portugal, not digital content or subscriptions. Browsing and AI planning do not require an account. Reservations are requests: Watermelon manually confirms availability before requesting payment. Existing PayPal, Revolut and bank-transfer payment options are offered on a secure website only after approval. Choosing a payment method or returning to the app does not mark a request paid; Watermelon validates receipt. Please label any reservation request made during review as APP REVIEW TEST. Do not make a real payment. Contact info@watermelonexperiences.pt for assistance.'}
review = rows(request('/v1/appStoreVersions/'+version_id+'/appStoreReviewDetail'))
if review:
    patch('appStoreReviewDetails', review[0]['id'], review_attributes)
elif APPLY:
    created = request('/v1/appStoreReviewDetails', 'POST', {'data': {'type': 'appStoreReviewDetails', 'attributes': review_attributes,
      'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': version_id}}}}})
    report['changes'].append({'resource': 'appStoreReviewDetails', 'success': 'error_status' not in created, 'error': created.get('error_status')})

schedule = request('/v1/apps/'+APP_ID+'/appPriceSchedule?include=baseTerritory')
report['price_schedule_id'] = next((x['id'] for x in rows(schedule)), None)
report['pricing'] = []
for data in rows(schedule):
    report['base_territory'] = data.get('relationships', {}).get('baseTerritory', {}).get('data', {}).get('id')
    prices = request('/v1/appPriceSchedules/'+data['id']+'/manualPrices?include=appPricePoint,territory&limit=200')
    report['pricing_error'] = prices.get('error_status')
    for item in prices.get('included', []):
        if item.get('type') == 'appPricePoints':
            report['pricing'].append({'id': item['id'], 'customer_price': item.get('attributes', {}).get('customerPrice')})
report['remaining'].extend(['Verify Free price and countries in App Store Connect', 'Select a tested version 1.0 build', 'Supply genuine iPhone and iPad screenshots', 'Complete truthful age rating, content rights, App Privacy and trader declarations'])
verified = request('/v1/appStoreVersionLocalizations/'+locale['id'])
report['metadata_verified'] = [{key: bool(item.get('attributes', {}).get(key)) for key in ('description','keywords','supportUrl')} for item in rows(verified)]
text = json.dumps(report, indent=2)
print(text)
pathlib.Path(os.environ.get('RUNNER_TEMP', '.'), 'watermelon-metadata-result.json').write_text(text)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as file:
        file.write('## Watermelon listing preparation (not submitted)\n```json\n'+text+'\n```\n')
