# Dedicated Watermelon WhatsApp — activation checklist

Status on 31 October 2026: **draft normal activation; do not publish until the controlled reply is confirmed delivered**. The dedicated account authorization and real inbound acceptance phrase have been validated. This release additionally depends on the separate authenticated manual-reply endpoint and its review. No automatic sending is enabled.

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

- The draft sets `CRM_INBOUND_ENABLED = true`, `CRM_INBOUND_TEST_ONLY = false` and keeps `CRM_OUTBOUND_ENABLED = false`. General reception is allowed only at the exact dedicated endpoint; history, address-book sync, echoes and private records remain excluded. Outbound requests use only the authenticated manual-reply endpoint when an operator presses the conversation button. Legacy send/send-v2, pending queues, automatic templates and reminders remain blocked.
- The server-side coexistence exchange validates the dedicated display number through Meta Graph, verifies the app subscription, and only then saves configuration. The webhook additionally requires the exact number, Phone Number ID and WABA above.
- Fresh enquiries can create a business contact/request without a quoted message. Existing private or unclassified matching contacts block ingestion. A quoted message still needs a valid association with a manual CRM reply or the controlled test, and never falls back to importing an older queued conversation.
- Unquoted messages continue only a request linked by non-private messages from this dedicated endpoint. A private, missing or inconsistent linked request blocks fallback creation. Old personal-endpoint requests are not chosen merely because the customer number matches.
- Concurrent first enquiries share a deterministic request reference. A closed dedicated request starts a new generation. Repeated message deliveries do not create duplicate messages or receipt activities.
- Explicit replies still require the exact non-private CRM outbound message, contact and request. Only `crm_cloud_api_manual` and the controlled-test source qualify. An unknown or invalid quoted context never falls back to creating a lead. Old cloud-api/template/pending sources do not qualify.
- Only live `messages` events are processed. Phone-app echoes, address-book sync and history fields are ignored. Shared contact cards, stickers, reactions and unknown message types do not create enquiries.
- This draft does not change credentials or execute SQL migrations. Deployment and every manual message remain separate actions; publishing this branch before the delivery gate is forbidden.

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

## Normal manual activation gate

1. Confirm the single controlled reply was delivered and retain its durable reservation.
2. Review and deploy `watermelon-whatsapp-reply` separately with `verify_jwt=true`. It accepts only `request_id`, exact operator-approved `text`, and a stable UUIDv4 `idempotency_key`; it derives the business recipient and verifies strict privacy, dedicated endpoint and a request-scoped service window under 24 hours.
3. Only after that endpoint is ready, publish this UI and webhook together. Preserve webhook HMAC authentication, `verify_jwt=false` and its existing import map. Do not update the suspended send/send-v2 endpoints or enable cron/queue draining.
4. The composer invokes the new endpoint only from its click handler. A draft attempt retains its UUID across uncertainty; no automatic retries occur. Pending/unknown messages, including the controlled test, block new sends in that conversation until an explicit submitted/rejected outcome resolves them. The backend also needs to prevent a new key from bypassing an existing uncertain attempt.
5. Manual receipts must preserve `raw_payload.manual_reply`, including actor, operation hash, proof and submission state. Receipt metadata lives alongside it, never replaces it. Match only the manual source, dedicated endpoint, WAMID and non-private request/contact, then use compare-and-set and monotonic delivery ranks. Early or concurrent uncorrelated receipts request retry; they never trigger an outbound send.

The draft depends on the backend manual-reply PR. Do not combine deployment approval with proof of delivery: production remains in controlled-test mode until the owner has confirmed that proof.

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

