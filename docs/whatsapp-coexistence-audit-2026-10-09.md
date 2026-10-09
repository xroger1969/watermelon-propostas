# Watermelon WhatsApp Coexistence audit — 2026-10-09

## Outcome and limits

The professional number remains paused in CRM. No messages, registration/deregistration,
number migration, subscription changes, OAuth exchange or credential changes were performed
in this audit. WhatsApp Business on iPhone and Mac was not operated or altered.
End-to-end iPhone/Mac coexistence is **not yet verified**.

Confirmed a historical failed delivery for the configured phone with Meta error **131031 —
Business Account locked**, at 2026-10-09 11:28:45 UTC (12:28:45 Lisbon). The API accepted a
message submission earlier in the workflow; its webhook receipt ultimately marked it failed.
This does not establish the current cause of Meta's restriction.

Meta Business opened in the cloud browser but remained on its sign-in page after secure
authentication handoff. Current account restrictions, permissions, billing, owner portfolio,
and the actual coexistence flags remain unverified. Do not infer them from past screenshots,
business verification, an app being live, or the absence of a CRM last_error.

## Verified live configuration (presence only)

- Supabase: watermelon-booking / bwujfaptrrkshxarzbid, ACTIVE_HEALTHY.
- CRM config: WABA 1785473568789104; phone ID 874910289048462; Graph v25.0.
- App Secret, access token and verification token are present. Their values were not retrieved.
- Configuration last updated 2026-10-09 11:56:57 UTC.
- Stored last_error is null despite a failed message with error 131031.
- Last webhook timestamp is historical; it is not evidence of current ingestion.
- Contacts, messages and requests have RLS enabled.
- A unique index on whatsapp_message_id exists.
- One previous pending message exists, already marked sent; no outstanding pending item
  was found using the existing activity-based queue representation.

## Deployed Edge Functions

| Function | Version observed | State |
| --- | --- | --- |
| watermelon-whatsapp-webhook | 6 | POST returns EVENT_RECEIVED/200 before processing; ingestion and pending auto-send suspended |
| watermelon-whatsapp-send-v2 | 8 | POST returns WHATSAPP_INTEGRATION_PAUSED/503 before credentials, DB or Graph |
| watermelon-whatsapp-coexistence | 2 | POST returns WHATSAPP_INTEGRATION_PAUSED/503 before OAuth/subscription/config writes |
| watermelon-whatsapp-subscribe-once | 2 | Always Gone/410; no subscription action |
| watermelon-whatsapp-send | 1 → 2 | **Fixed in this audit:** legacy route now paused with JWT protection retained |
| watermelon-whatsapp-templates | 1 | Admin-only GET lists templates; POST can create a template. Not invoked or modified |

The legacy v1 send route was still capable of sending with the saved credentials even though
send-v2 was paused. Replaced it with a minimal dependency-free handler:
POST returns 503/WHATSAPP_INTEGRATION_PAUSED; other methods return 405.
It cannot read credentials, parse a destination, access Supabase or call Graph.
verify_jwt remains true. The source was fetched again after deployment and matched the tested source.

The paused webhook acknowledges incoming events without storing them. Those discarded events
should not be assumed recoverable from a later replay. Historical message sync and supported
linked clients must be verified before any future resumption.

## Vercel and GitHub

- Vercel project watermelon-propostas / prj_6mGqtAOpF3GAK75WMPES0Nysxp3r.
- Latest production deployment returned by Vercel: READY, dpl_GYsTVZNBaeVmLA2CSr4r9RbQ5nbZ,
  Git commit d225460d39fb136d9d49fb110994b679c740bf2e.
- GitHub main returned by connector: 5e58a88e0a1d1b3ee9fe808469b403ccf94f9efe.
  These different refs were inspected explicitly; no production redeploy, merge or rollback occurred.
- Vercel environment metadata contains no WhatsApp credentials; this integration runs in Supabase.
- A 50-minute Vercel runtime query for whatsapp returned no results. A seven-day request exceeded
  plan retention. Neither proves the absence of earlier errors.
- Existing checklist says WABA owner was Watermelon Auto (759014320107772),
  whereas the requested Meta portfolio is Watermelon Experiences 360 (216654619029058).
  Ownership must be confirmed in Meta; this audit did not change it.
- Existing checklist statements about onboarding completion and permissions are prior notes,
  not current verification.

## Tests

Executed six isolated in-memory cases against the exact new legacy handler:
POST, GET, PUT, PATCH, DELETE and OPTIONS. All passed.
Assertions include status, pause code, no-store, and no body/credential/network access.
No real destinations, tokens, database writes or Meta calls were used.

GitHub Actions ran the full Node suite: **26 tests passed, zero failed**, including all six
new suspension tests. The Next.js TypeScript configuration now excludes supabase/functions
because those files run on Deno rather than the browser/Node app runtime. Supabase compiled
and deployed the Edge Function successfully.

Saved equivalent Node regression tests at tests/whatsapp-suspension.cjs.
Full local npm/typecheck execution was unavailable because automatic command approval review
could not complete due to a usage limit. In-memory tests are not an end-to-end delivery test.
No test was executed against the professional number.

## Preconditions for a future approval to resume

1. Authenticate Meta; inspect Watermelon Experiences 360 and the exact WABA owner.
   Confirm account restrictions and the 131031 reason in Business Support Home/WhatsApp Manager.
2. Confirm current Advanced Access for whatsapp_business_messaging and
   whatsapp_business_management, app ownership, asset assignments and effective token scopes.
3. Confirm Coexistence through the official existing-business-app onboarding flow;
   verify the number is on the Business app and coexistence is enabled. Do not register,
   deregister, migrate, remove or relink the professional number as a troubleshooting experiment.
4. Confirm supported Mac client and linked-device behavior with the actual account.
5. Keep current credentials unchanged until a separate approved, validated completion.
6. Before resumption, harden the dormant exchange path: server-side single-use state,
   exact expected redirect URI, token/app/scopes and account health/coexistence validation,
   existing subscription check, and a clear no-side-effect failure path.
7. Before resumption, validate webhook metadata phone/WABA against the authorized account,
   signed payloads, echo direction, concurrent duplicate processing, monotonic delivery status,
   and pending-message cancellation/no automatic replay. Current cold code needs these tests.
8. Only after explicit owner approval, perform a controlled real inbound/outbound acceptance test,
   confirming iPhone and Mac remain functional. No real messages are authorized by this audit.

## Official references

- Meta error codes:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- Existing WhatsApp Business app onboarding:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

Indexed Meta documentation describes 131031 as account restriction/disablement or an inability
to verify account/request data. The code alone does not identify a policy violation or justify
resetting a PIN. Meta's onboarding documentation describes retaining the existing Business app
and number, subject to eligibility and linked-client limitations; it is not a guarantee that this
particular iPhone/Mac setup is fully functional.
