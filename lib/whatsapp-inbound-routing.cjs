"use strict";
// Standalone, pure safety gate. Not connected to production or Meta.
// Before production use, the webhook must verify Meta's HMAC signature and
// query trusted DB records for contact and request fields; never trust webhook
// payloads to supply isCommercial/isPrivate.
function routeWhatsAppEvent(event) {
  const e=event || {};
  const ignore = reason => ({action:"ignore",reason});
  if (!e.expectedPhoneNumberId || String(e.phoneNumberId||"")!==String(e.expectedPhoneNumberId)) return ignore("unexpected_business_number");
  if(e.field!=="messages") return ignore("app_sync_or_unsupported_webhook_field");
  if(e.kind==="status"){
    if(!e.whatsappMessageId) return ignore("unlinked_status");
    if(!["sent","delivered","read","failed","deleted"].includes(e.status))return ignore("unknown_delivery_status");
    return {action:"update_delivery",messageId:e.whatsappMessageId,status:e.status};
  }
  if(e.kind!=="message")return ignore("unsupported_event_kind");
  if(!e.messageId)return ignore("missing_message_id");
  if(e.duplicate)return ignore("duplicate_message");
  if(!e.contactId || e.contactPrivate)return ignore("unknown_or_private_contact");
  const requests=Array.isArray(e.requests)?e.requests.filter(r=>r && r.isCommercial===true && r.isPrivate!==true):[];
  if(!requests.length)return ignore("not_linked_to_commercial_request");
  if(e.contextRequestId){
    const linked=requests.find(r=>r.id===e.contextRequestId);
    if(linked)return {action:"attach",requestId:linked.id,via:"verified_reply_context"};
    return ignore("invalid_or_private_reply_context");
  }
  if(requests.length!==1)return {action:"manual_review",reason:"ambiguous_commercial_request"};
  return {action:"attach",requestId:requests[0].id,via:"single_verified_request"};
}
function resolveDeliveryStatus(previous,next) {
  const accepted=["sent","delivered","read","failed","deleted"];
  if(!accepted.includes(next))return previous || "sent";
  if(next==="failed" || next==="deleted")return next;
  if(previous==="failed" || previous==="deleted")return previous;
  const rank={sent:1,delivered:2,read:3};
  return !previous || (rank[next]||0)>(rank[previous]||0)?next:previous;
}
module.exports = { routeWhatsAppEvent, resolveDeliveryStatus };
