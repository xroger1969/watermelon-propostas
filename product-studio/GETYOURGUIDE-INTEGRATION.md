# Watermelon Studio — GetYourGuide Integration Runbook

**Status on 27 Oct 2026:** Supplier connectivity sandbox implementation exists. No actual integration with GetYourGuide is certified, no external credentials are installed, **no products/slots are enabled**, and live booking remains OFF.

## Supplier API — what has been built
- Vercel route rewrites (all prefixed \`/1/\`, as required by GetYourGuide):
  - \`GET /1/get-availabilities/\`
  - \`POST /1/reserve/\`
  - \`POST /1/cancel-reservation/\`
  - \`POST /1/book/\`
  - \`POST /1/cancel-booking/\`
- Vercel API gateway: HTTP Basic Auth, sandbox-only feature gate, allowlisted methods, JSON payloads, upstream timeout and no-store.
- Supabase private \`gyggateway\` ledger with source \`product_options\` IDs, manually mapped GYG supplier product IDs, dated slots/capacity, held reservations and confirmed bookings.
- A service-role-only Postgres RPC \`public.gyg_sandbox_dispatch\` handles available capacity and transactionally locks slots before reserve; repeat reservations/bookings are idempotent; cancellation releases capacity.
- The \`gyg-connectivity-dispatch\` Supabase Edge Function accepts **only the internal Studio server key** and calls the privileged RPC.
- Test SQL runs availability → reserve → repeated reserve → capacity exhaustion → book → repeated book → cancel → available again, inside a rolled-back transaction.
- A guarded outbound helper \`lib/gyg-notify.js\` constructs approved \`notify-availability-update\` payloads, but **it is not connected to inventory change events** and deliberately cannot send anything until production certification.

## NOT implemented / NOT certified
- The mandatory sixth feature is a **durable, automated, externally triggered Notify Availability** pipeline. The helper alone is not sufficient for connectivity certification.
- Product-options mapping, validated inventories, price categories, vouchers/ticket fulfillment, amendment cases, optional group prices, all-day products, monitoring, retry queues and SLO performance.
- Real external GetYourGuide self-test/certification and production credentials.
- Public endpoint accessibility from the GetYourGuide Integrator Portal (the Studio has Vercel Deployment Protection; it may require a dedicated verified domain or an explicit protected gateway strategy).
- Actual bookings into the existing Watermelon CRM (requires audited syncing; never claim success before confirmed).
- Any GetYourGuide Partner API / AI catalog access (this is independent and still awaiting partner approval).

## Important operator decisions
1. **All product creation and media updates remain MANUAL** in the GetYourGuide Supplier Portal, per Robin's email (ticket #23114040, 27 Oct 2026).
2. Only tours Watermelon operates directly may be published as its own Supplier product. The Studio assists with the submission pack and status tracking.
3. Register the reservation system as a **single-supplier integrator**, then test each mandatory operation inside the official Integrator Portal.
4. For each approved option, map exactly one supplier option ID to an existing Studio \`product_options.id\`. Do not automatically activate any existing Studio draft or import.
5. Run API tests in a separated, nonpublic staging environment with deliberately seeded test-only slots; only after certification may real availability be exposed.
6. Do not mark live unless booking vouchers, customer communications, automated availability notification, cancellation/refunds, incident handling, and required performance targets are validated.

## Credentials and gates

Set in Vercel Project **watermelon-product-studio**, in PREVIEW ONLY after registering with GetYourGuide:

- \`GYG_SUPPLIER_MODE=sandbox\`
- \`GYG_SUPPLIER_ENABLED=true\`
- \`GYG_SUPPLIER_BASIC_USER\`, \`GYG_SUPPLIER_BASIC_PASSWORD\` — unique, strong inbound Basic Auth credentials registered with the GetYourGuide Integrator Portal.
- Existing \`SUPABASE_PRODUCT_STUDIO_URL\` and \`PRODUCT_STUDIO_INTERNAL_KEY\` are forwarded server-to-server to Supabase.
- Do not set any GYG Supplier secret in \`NEXT_PUBLIC_*\`, client-side source, chats, or a Git repository.

The Vercel gateway **has no live mode**; simply setting \`GYG_SUPPLIER_MODE=live\` leaves it closed. This is intentional. Direct conversion to production requires a new audited implementation and certification.

Outbound only after certification:
- \`GYG_NOTIFY_MODE=production\`, \`GYG_NOTIFY_ENABLED=true\`,
  \`GYG_SUPPLIER_APPROVED=true\`, \`GYG_SUPPLIER_CONNECTIVITY_CERTIFIED=true\`, plus GetYourGuide-issued \`GYG_OUTBOUND_BASIC_USER/PASSWORD\`.
- Current outbound helper is not called automatically. Do NOT enable it until a durable inventory-change outbox exists.

## Privacy and operational safety
- Private schema is not exposed by Supabase Data API.
- RPC is \`SECURITY INVOKER\` and grants EXECUTE only to \`service_role\`, not to \`anon\` or \`authenticated\`.
- Booking table stores only refs, product/slot/quantities and timestamps. No names, email addresses or payment data.
- Changes to available units are serialized with PostgreSQL row locks; repeated bookings return the same confirmation.
- Unknown products and dates never invent inventory; inactive mappings are blocked.
- No automated third-party website scraping, affiliate referrals or GetYourGuide real booking calls are enabled.

## Official references
- Supplier API overview: https://integrator.getyourguide.com/documentation/overview
- Supplier endpoints: https://integrator.getyourguide.com/documentation/supplier_endpoints
- Notify Availability: https://integrator.getyourguide.com/documentation/gyg_endpoints
- Integrator registration: https://integrator.getyourguide.com/signup
- Quality requirements: https://supply.getyourguide.support/hc/en-us/articles/29184465026845-GetYourGuide-Activity-Quality-Guidelines

## Test
\`cd product-studio && npm test\` executes Node unit tests. Supabase transaction assertions:
\`product-studio/database/gyg_sandbox_transaction_test.sql\` (read/review first). The transaction rolls back test records.
