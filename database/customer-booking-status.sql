-- Additive customer-status access for direct bookings. Existing requests remain unchanged.
-- Anonymous guests authenticate with an unguessable receipt capability, never with a reference alone.
alter table public.watermelon_booking_requests add column if not exists customer_access_token uuid;
create unique index if not exists watermelon_booking_customer_access_unique
  on public.watermelon_booking_requests(customer_access_token) where customer_access_token is not null;
create schema if not exists watermelon_customer_private;
revoke all on schema watermelon_customer_private from public;
grant usage on schema watermelon_customer_private to anon, authenticated;

-- Privileged lookup is deliberately outside the exposed API schema, with a fixed search_path.
create or replace function watermelon_customer_private.booking_status(p_reference text, p_access_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'reference', b.reference, 'status', b.status, 'payment_status', b.payment_status,
    'estimated_total', b.estimated_total, 'currency', b.currency, 'updated_at', b.updated_at,
    'payment_url', case when b.status in ('approved','confirmed')
       and b.payment_status = 'awaiting' and b.payment_requested_at is not null
       and b.payment_token is not null and b.estimated_total > 0
       then 'https://www.watermelonexperiences.pt/payment/' || b.reference || '?token=' || b.payment_token::text
       else null end
  )
  from public.watermelon_booking_requests b
  where p_access_token is not null and b.customer_access_token = p_access_token
    and b.reference = p_reference and length(p_reference) between 1 and 80
  limit 1;
$function$;
revoke all on function watermelon_customer_private.booking_status(text,uuid) from public;
grant execute on function watermelon_customer_private.booking_status(text,uuid) to anon, authenticated;

create or replace function public.watermelon_customer_booking_status(p_reference text, p_access_token uuid)
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select watermelon_customer_private.booking_status(p_reference, p_access_token);
$function$;
revoke all on function public.watermelon_customer_booking_status(text,uuid) from public;
grant execute on function public.watermelon_customer_booking_status(text,uuid) to anon, authenticated;
comment on function public.watermelon_customer_booking_status(text,uuid) is
  'Capability-protected read-only status for a single guest booking. No contacts or internal notes are returned. Does not approve reservations or mark payments received.';
