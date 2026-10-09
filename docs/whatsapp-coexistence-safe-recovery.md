# WhatsApp Coexistence: controlled restoration plan (09 Oct 2026)

**Status: draft/test-only. No production deployment authorised.**

## Context established from existing integration

- Watermelon professional WhatsApp Business: **+351 918 404 101**. Preserve the handset app and all chats.
- Former Meta test sender: **+1 (555) 141-2937**. Previous CRM event logs include Delivered / Read outcomes; its sandbox recipient limits mean these tests do **not** prove service for arbitrary clients.
- The current production Supabase WhatsApp config still refers to the Portuguese professional number; therefore reactivating the old send/webhook code alone is unsafe.
- The Meta callback on 09 Oct had failed delivery with **131031 (Business Account locked)**; sending acceptance is not delivery.
- The production webhook, CRM send-v2 and coexistence completion endpoints are currently **suspended** at the owner's request. Leave this intact until explicit go-ahead.
- A previous Vercel deployment was restored to production. Do not redeploy or merge this branch without approval.

## Safeguards required before attempting coexistence

1. In Meta WhatsApp Manager, inspect the business account status, phone-number status, quality and any restriction for the specific WABA. Confirm explicit eligibility for WhatsApp Business App Coexistence. Don't treat verified business details as proof that messaging is unlocked.
2. Test Cloud API end-to-end on a **separate Meta test sender** and **authorised test recipients**: signed inbound callback, API send acknowledgement, and later delivered/read/failed status. Do not change the primary configured business number during these tests.
3. Move routing to isolated settings for test vs production numbers. Never infer that an app echo, history sync, media or unsolicited personal chat is a commercial lead.
4. Create a *commercial request* explicitly in the site/CRM, associate the verified WhatsApp contact and link inbound replies by context or unambiguous request. Keep unrelated chats outside sales tables; restrict by database-backed opt-in/private markers.
5. Never treat a 2xx response as final delivery; only Meta status webhooks confirm Delivered/Read. Error 131031 is a blocking condition.
6. Audit media/attachments and desktop linked devices; ensure no auto-replies, repeated retry loops or messages to personal contacts.
7. Prepare a written rollback procedure, ensure the owner can disconnect the Business Platform without deregistering their phone, preserve local backups and check that the Mac is paired afterward.
8. Only then, and after **fresh explicit owner approval**, attempt WhatsApp Business App Coexistence during a monitored window with the owner using the iPhone. Abort immediately on broken app messaging, media or desktop pairing.

## Test-only implementation here

- `lib/whatsapp-inbound-routing.cjs` is a **pure simulated gate**, not yet wired to the deployed Supabase Edge Function.
- `tests/whatsapp-inbound-routing.test.cjs` uses invented identifiers and no API calls; run `node --test tests/whatsapp-inbound-routing.test.cjs`.
- Tests verify classification only, not live WhatsApp or Meta permissions.

## Unresolved before live attempt

- Meta WABA health/lock and active permission status (requires direct read in Meta dashboard or authorised Graph API diagnostics).
- A genuinely isolated test sender and appropriate token without reusing production phone IDs.
- Whether the existing setup supports the official coexistence onboarding requirements; do not assume app registration/verification implies approval.
