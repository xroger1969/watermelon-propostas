/**
 * Supplier-side outbound availability notification.
 * Intentionally not scheduled/called until genuine external inventory changes
 * are wired into a durable outbox and GYG Connectivity authorizes activation.
 * Docs: https://integrator.getyourguide.com/documentation/gyg_endpoints
 */
const ENDPOINT='https://supplier-api.getyourguide.com/1/notify-availability-update';
export function buildAvailabilityNotification(productId, availabilities) {
  if(typeof productId!=='string'||!productId.trim()||productId.length>200) throw Error('Invalid productId');
  if(!Array.isArray(availabilities)||!availabilities.length||availabilities.length>100) throw Error('Invalid availabilities');
  const items=availabilities.map(item=>{
    if(typeof item?.dateTime!=='string'||!Number.isFinite(Date.parse(item.dateTime))) throw Error('Invalid dateTime');
    if(!Number.isSafeInteger(item.vacancies)||item.vacancies<0) throw Error('Invalid vacancies');
    return {dateTime:item.dateTime,vacancies:item.vacancies};
  });
  return {data:{productId,availabilities:items}};
}
export async function sendAvailabilityNotification(payload,env=process.env,fetcher=fetch) {
  // Sending changes to GYG is never allowed just because a product was marked "ready".
  if(env.GYG_NOTIFY_MODE!=='production'||env.GYG_NOTIFY_ENABLED!=='true'||
    env.GYG_SUPPLIER_APPROVED!=='true'||env.GYG_SUPPLIER_CONNECTIVITY_CERTIFIED!=='true')
    return {sent:false,reason:'not-authorized-or-not-certified'};
  const user=env.GYG_OUTBOUND_BASIC_USER,pass=env.GYG_OUTBOUND_BASIC_PASSWORD;
  if(!user||!pass)return {sent:false,reason:'outbound-credentials-missing'};
  // Reject malformed data before any HTTP request.
  const safe=buildAvailabilityNotification(payload?.data?.productId,payload?.data?.availabilities);
  const result=await fetcher(ENDPOINT,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Basic '+Buffer.from(user+':'+pass).toString('base64')},
    body:JSON.stringify(safe),signal:AbortSignal.timeout(7000)
  });
  return {sent:result.status===202,status:result.status,retryable:result.status===429||result.status>=500};
}
