# Dedicated Watermelon WhatsApp — activation checklist

Status on 31 October 2026: **controlled reception test prepared; general enquiries and all automated delivery remain blocked**. The existing server authorization has been validated against the dedicated account and its app subscription. Deploy this release before asking for the real acceptance message. This document replaces the earlier checklist that treated the personal number as a business number.

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

- `CRM_INBOUND_ENABLED = true`, `CRM_INBOUND_TEST_ONLY = true` and `CRM_OUTBOUND_ENABLED = false`. General CRM sends remain paused. Only a text body exactly equal to **TESTE WATERMELON 965** can be stored from the authorized endpoint; whitespace, case changes, attachments and other texts are discarded. Only receipts for the single controlled reply below may update its own record; unrelated receipts remain discarded.
- The server-side coexistence exchange validates the dedicated display number through Meta Graph, verifies the app subscription, and only then saves configuration. The webhook additionally requires the exact number, Phone Number ID and WABA above.
- The acceptance phrase can create a business contact/request without a quoted message. General enquiry routing is prepared behind the explicit test gate and is not enabled in this release. Existing private or unclassified matching contacts block ingestion.
- Unquoted messages continue only a request linked by non-private messages from this dedicated endpoint. A private, missing or inconsistent linked request blocks fallback creation. Old personal-endpoint requests are not chosen merely because the customer number matches.
- Concurrent first enquiries share a deterministic request reference. A closed dedicated request starts a new generation. Repeated message deliveries do not create duplicate messages or receipt activities.
- Explicit replies still require the exact non-private CRM outbound message, contact and request. An unknown or invalid quoted context never falls back to creating a lead.
- Only live `messages` events are processed. Phone-app echoes, address-book sync and history fields are ignored. Shared contact cards, stickers, reactions and unknown message types do not create enquiries.
- This release does not enable sends, change credentials, execute SQL migrations or send a test message. Deploying the Edge Function remains a separate action.

## Before activation

1. Confirm the Meta business restriction is cleared and the dedicated account has the required permissions and billing. Obtain the owner's confirmation at Meta's final authorization screen.
2. Complete a fresh, single-use authorization code exchange in the authenticated CRM setup UI. Do not put tokens, App Secret or authorization codes in chat, GitHub, screenshots or logs. Confirm the saved number/IDs without exposing credentials.
3. Confirm `GET /4408982439363483/subscribed_apps` identifies Watermelon CRM, the app's `messages` subscription is enabled, and the callback uses the endpoint above. Do not subscribe to personal history, app-state/contacts sync or message echoes.
4. Review and merge the prepared code only after checks pass. Deploy the reviewed webhook source separately; a Vercel website deployment does not deploy Supabase Edge Functions. Verify the deployed source and preserve the signature check and webhook authentication mode.
5. With this exact release deployed and verified, ask the owner to send **TESTE WATERMELON 965** to +351 965 637 736. Check that only this phrase creates one correctly scoped business request. Confirm that a repeated delivery does not duplicate it. Do not bypass an existing privacy flag on the test sender.
6. Test duplicate/retried delivery, wrong WABA/Phone ID/display number, old personal endpoint, private contacts/requests, history and echoes. None may create or expose unrelated records.
7. Separately validate a deliberate CRM reply and Meta delivery receipt with an authorized test contact before enabling production outbound delivery. Never use existing queued activities as a test batch.
8. Confirm the personal iPhone WhatsApp remains independent and the dedicated WhatsApp Business still works. Check the released iOS build uses the new contact links; source changes alone do not update installed apps.

Rollback: set `CRM_INBOUND_ENABLED = false` and retain `CRM_OUTBOUND_ENABLED = false`, the dedicated endpoint allowlist and the test-only gate. Verify the deployed source. Do not restore the personal account's configuration. General reception requires a separate explicit change to the test-only gate after this acceptance test; outbound delivery requires its own authorized test.

## Verification performed for this preparation

Synthetic tests exercise the exact production test-phrase gate in memory, plus separate in-memory copies for emergency pause and prepared future routing. The suite includes exact/non-exact phrases, attachments, private/legacy exclusion, concurrent initial messages, repeated deliveries, quoted replies, signed-event authentication, ignored statuses and paused outbound behavior. Tests use no real CRM records, credentials or Graph delivery.

Live authorization, deployment and two-way delivery remain separate acceptance steps. Do not mark the integration operational until those steps pass.

## Single controlled reply

The authenticated conversation provides a separate **Enviar resposta única de teste** button only when a recent, non-private inbound acceptance phrase is loaded. A native confirmation identifies the recipient and fixed reply. General sends stay disabled.

The new `watermelon-whatsapp-test-reply` endpoint must be deployed with `verify_jwt=true`. It accepts only `operation: send_single_test_reply` and `inbound_test_message_id`. The server derives the request, contact and recipient from that exact validated inbound record, checks the dedicated endpoint, strict privacy flags and a service window under 24 hours, then sends only:

> Teste Watermelon recebido. A ligação de resposta do CRM está a funcionar.

A constant message-row primary key reserves one attempt for the entire test cycle before any Graph request. The existing database constraint has no pending status: the reservation conservatively uses `failed` plus `raw_payload.controlled_test_state=pending`. The UI displays **Teste em preparação; não repetir**, rather than rejection. A timeout or missing Meta message ID uses state `unknown` and displays an uncertain result. Only a valid Meta message ID permits `sent`. Any claim conflict blocks repeat delivery, including concurrent clicks and retries after failures. Do not delete the reservation to retry an uncertain send.

The webhook accepts receipts only for this constant row, controlled-test source, saved Meta message ID, dedicated endpoint and validated non-private recipient/request. State updates use compare-and-set; a concurrent conflict requests webhook retry rather than regressing delivery state. An early receipt for the intended recipient requests retry until the sender saves its message ID. Uncorrelated receipts are never assumed to prove delivery.

Publish only the new endpoint and reviewed webhook update; preserve the webhook's HMAC authentication and `verify_jwt=false`. Leave `send` and `send-v2` returning 503. A successful Graph submission is not delivery confirmation: check a delivered/read receipt and the recipient's phone before preparing general manual operation. No automatic reminders, pending queues, templates or bulk replies are enabled.

