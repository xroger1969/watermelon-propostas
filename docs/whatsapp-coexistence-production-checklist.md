# WhatsApp Business App coexistence — production completion checklist

Status: **onboarded in Meta; admin-authenticated exchange function deployed; credentials exchange, subscription and delivery not yet executed or verified**.

## Confirmed assets (not credentials)
- Meta App: Watermelon CRM (1725466825210094), published; WhatsApp permissions approved.
- Meta-hosted Embedded Signup: `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
- WABA: `1785473568789104`.
- Phone Number ID: `874910289048462`.
- Business portfolio owning the WABA: Watermelon Auto (`759014320107772`).
- Phone: +351 918 404 101.
- Existing webhook endpoint: `https://bwujfaptrrkshxarzbid.supabase.co/functions/v1/watermelon-whatsapp-webhook`.
- Existing CRM setup UI: `/admin/whatsapp`; existing Supabase RPC `watermelon_save_whatsapp_config`.

## Safety requirements
- **Do not** register, deregister, migrate or delete the existing phone number.
- **Do not** break coexistence with the WhatsApp Business iPhone app.
- **Do not** paste App Secret, tokens or authorization codes into GitHub, logs, screenshots or client-side JavaScript.
- The previously displayed authorization code is considered exposed. Obtain a fresh code when implementing server exchange.
- Never exchange OAuth code in the browser. Validate state and authorization on the backend, and use the exact redirect URI configured in Meta.
- Do not store access tokens in localStorage or expose them via public status endpoints.
- Keep existing inbound webhook behavior, lead creation and conversation handling intact.

## Required backend work
1. Review the **actual deployed** Supabase Edge Function `watermelon-whatsapp-webhook`, the RPC permissions, and existing credentials/configuration (inspect presence only; never reveal values). Check idempotency and webhook signature verification (`X-Hub-Signature-256`).
2. Implement an **admin-authenticated**, server-only OAuth callback/exchange endpoint with CSRF state, single-use short-lived authorization code, exact Meta app ID and redirect URI, and Meta App Secret from a server secret store. Exchange code via Meta Graph OAuth access-token endpoint. Never return token to browser.
3. Validate token permissions and WABA access; confirm phone number ID and WABA correspond to the account selected in Embedded Signup. Do not assume the response grants message delivery until tested.
4. Persist access token server-side using the existing secure configuration mechanism, scoped to the WhatsApp integration; never overwrite a working credential without validation.
5. Subscribe Watermelon CRM to the WABA via `POST /{waba-id}/subscribed_apps`, after checking existing subscriptions. Confirm via `GET /{waba-id}/subscribed_apps`. Subscribe to `messages` webhook field and confirm the Meta callback URL points to the existing Supabase Edge Function.
6. Check billing requirements in the business's WABA. Do not add payment details or share a line of credit without explicit authorization.
7. Validate inbound messages, status updates, deduplication, CRM conversation mapping, reply delivery, error reporting and webhook retry handling using a controlled test. Verify the iPhone app still works.
8. Add regression tests; deploy only after successful tests and an explicit production go-ahead.

## Known implementation caveat
The current `components/WhatsAppSetup.tsx` expects an operator to paste a permanent/system-user token and Meta App Secret into the admin page, saved through `watermelon_save_whatsapp_config`. A better workflow is a secure server-side code exchange. Avoid implementing a public token-exchange endpoint or sending the token to the UI. Verify whether the existing Supabase functions are deployed from another repository before modifying them.

## Operator acceptance criteria
- WhatsApp Business iPhone app remains connected.
- WABA subscription returns the Watermelon CRM app.
- Meta webhook verification and signed event delivery succeed.
- A real incoming message is visible in the correct Watermelon CRM conversation.
- A CRM reply is received on the intended WhatsApp contact.
- No sensitive credentials appear in browser responses or logs.

## Sources
- Meta WhatsApp Embedded Signup API collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- Meta WhatsApp Cloud API collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Implementation prepared (2026-10-09)
- Deployed new Supabase Edge Function `watermelon-whatsapp-coexistence` to existing Watermelon project, `verify_jwt=true`, separate from the working webhook.
- Restricted invocation to an authenticated CRM administrator, exact expected WABA `1785473568789104`, exact phone ID `874910289048462`, and display number `+351 918 404 101`.
- Meta OAuth code exchange occurs server-to-server with existing App Secret, followed by WABA/phone validation, WABA subscription verification, and only then saving token and IDs via `watermelon_save_whatsapp_config`.
- Added completion form to `components/WhatsAppSetup.tsx` on the preparation branch; not yet in production.
- Existing live Supabase configuration is still for a different/test WABA and phone; intentionally preserved until valid fresh authorization.
- **Not complete:** do not mark integration live before a fresh authorization code is generated, exchanged securely via the admin UI, WABA subscription is confirmed, and two-way message tests pass.
