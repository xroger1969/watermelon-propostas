# Dedicated Watermelon WhatsApp — activation checklist

Status on 31 October 2026: **preparation only; CRM ingestion and all automated delivery remain paused**. This document replaces the earlier checklist that treated the personal number as a business number.

## Authorized account

| Asset | Authorized value |
| --- | --- |
| Business WhatsApp | +351 965 637 736 |
| Phone Number ID | 1423415737522090 |
| WABA | 4408982439363483 |
| Meta app | Watermelon CRM — 1725466825210094 |
| Business portfolio | Watermelon Auto — 759014320107772 |
| CRM setup | https://www.watermelonexperiences.pt/admin/whatsapp |
| Webhook | https://bwujfaptrrkshxarzbid.supabase.co/functions/v1/watermelon-whatsapp-webhook |

The personal +351 918 404 101 and its former Phone Number ID 874910289048462 are excluded. Do not register, migrate, reconnect, sync contacts/history, or otherwise associate that personal account with the CRM.

These identifiers identify the approved endpoint; they are not credentials. If Meta changes either ID, verify the replacement against the dedicated display number and update the allowlist before considering activation.

## Preparation in the repository

- `CRM_INBOUND_ENABLED = false`, `CRM_OUTBOUND_ENABLED = false` and the CRM send UI remain paused.
- The server-side coexistence exchange validates the dedicated display number through Meta Graph, verifies the app subscription, and only then saves configuration. The webhook additionally requires the exact number, Phone Number ID and WABA above.
- Once explicitly activated later, fresh enquiries to the dedicated number can create a business contact/request without a quoted message. Existing private or unclassified matching contacts block ingestion.
- Unquoted messages continue only a request linked by non-private messages from this dedicated endpoint. A private, missing or inconsistent linked request blocks fallback creation. Old personal-endpoint requests are not chosen merely because the customer number matches.
- Concurrent first enquiries share a deterministic request reference. A closed dedicated request starts a new generation. Repeated message deliveries do not create duplicate messages or receipt activities.
- Explicit replies still require the exact non-private CRM outbound message, contact and request. An unknown or invalid quoted context never falls back to creating a lead.
- Only live `messages` events are processed. Phone-app echoes, address-book sync and history fields are ignored. Shared contact cards, stickers, reactions and unknown message types do not create enquiries.
- This preparation does not enable sends, change credentials, execute SQL migrations, or deploy an Edge Function.

## Before activation

1. Confirm the Meta business restriction is cleared and the dedicated account has the required permissions and billing. Obtain the owner's confirmation at Meta's final authorization screen.
2. Complete a fresh, single-use authorization code exchange in the authenticated CRM setup UI. Do not put tokens, App Secret or authorization codes in chat, GitHub, screenshots or logs. Confirm the saved number/IDs without exposing credentials.
3. Confirm `GET /4408982439363483/subscribed_apps` identifies Watermelon CRM, the app's `messages` subscription is enabled, and the callback uses the endpoint above. Do not subscribe to personal history, app-state/contacts sync or message echoes.
4. Review and merge the prepared code only after checks pass. Deploy the reviewed webhook source separately; a Vercel website deployment does not deploy Supabase Edge Functions. Verify the deployed source and preserve the signature check and webhook authentication mode.
5. Arrange a controlled business-number test. Enable inbound ingestion only for this validated endpoint; keep outbound automation paused. Check a first-time enquiry creates one correctly scoped request and a second message continues it.
6. Test duplicate/retried delivery, wrong WABA/Phone ID/display number, old personal endpoint, private contacts/requests, history and echoes. None may create or expose unrelated records.
7. Separately validate a deliberate CRM reply and Meta delivery receipt with an authorized test contact before enabling production outbound delivery. Never use existing queued activities as a test batch.
8. Confirm the personal iPhone WhatsApp remains independent and the dedicated WhatsApp Business still works. Check the released iOS build uses the new contact links; source changes alone do not update installed apps.

Rollback: leave or restore both webhook guards to `false`, retain the dedicated endpoint allowlist and verify the deployed source. Do not restore the personal account's configuration.

## Verification performed for this preparation

Synthetic tests exercise the production webhook in memory. Only the test copy enables inbound routing; source guards remain false. The suite includes first-time enquiries, private/legacy exclusion, concurrent initial messages, repeated deliveries, quoted replies, signed-event authentication and paused outbound behavior. Tests use no real CRM records, credentials or Graph delivery.

Live authorization, deployment and two-way delivery remain separate acceptance steps. Do not mark the integration operational until those steps pass.

