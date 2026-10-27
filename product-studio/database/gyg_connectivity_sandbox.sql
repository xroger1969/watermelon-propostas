-- Watermelon Experiences: GetYourGuide Supplier sandbox reservation ledger.
-- All option mappings/slots start DISABLED. No production bookings can arrive until
-- the explicit Vercel sandbox gate and authentication are configured.
create schema if not exists gyggateway;
revoke all on schema gyggateway from public, anon, authenticated;
grant usage on schema gyggateway to service_role;

create table if not exists gyggateway.options (
  id uuid primary key default gen_random_uuid(),
  product_option_id uuid not null references public.product_options(id) on delete restrict,
  supplier_product_id text not null unique,
  capacity_mode text not null default 'individual' check (capacity_mode in ('individual','group')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists gyggateway.slots (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references gyggateway.options(id) on delete restrict,
  start_at timestamptz not null,
  capacity integer not null check (capacity >= 0),
  currency text not null default 'EUR' check (length(currency)=3),
  prices_by_category jsonb not null default '[]'::jsonb check (jsonb_typeof(prices_by_category)='array'),
  cutoff_seconds integer not null default 43200 check (cutoff_seconds >= 0),
  enabled boolean not null default false,
  unique(option_id,start_at)
);
create table if not exists gyggateway.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references gyggateway.slots(id) on delete restrict,
  gyg_booking_reference text not null unique,
  reservation_reference text not null unique,
  booking_reference text unique,
  booking_items jsonb not null check (jsonb_typeof(booking_items)='array'),
  units integer not null check (units > 0),
  status text not null default 'held' check (status in ('held','booked','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gyg_reservations_slot_state on gyggateway.reservations(slot_id,status,expires_at);
create index if not exists gyg_slots_option_date on gyggateway.slots(option_id,start_at);
alter table gyggateway.options enable row level security;
alter table gyggateway.slots enable row level security;
alter table gyggateway.reservations enable row level security;
revoke all on all tables in schema gyggateway from public, anon, authenticated;
grant select,insert,update on all tables in schema gyggateway to service_role;

create or replace function public.gyg_sandbox_dispatch(p_operation text,p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $fn$
declare
 v_option gyggateway.options%rowtype;
 v_slot gyggateway.slots%rowtype;
 v_res gyggateway.reservations%rowtype;
 v_product text := p_payload->>'productId';
 v_gyg text := p_payload->>'gygBookingReference';
 v_from timestamptz;
 v_to timestamptz;
 v_start timestamptz;
 v_items jsonb;
 v_units integer;
 v_used integer;
 v_avail jsonb;
 v_category text;
 v_book text;
begin
 if p_operation='get-availabilities' then
   if v_product is null or p_payload->>'fromDateTime' is null or p_payload->>'toDateTime' is null then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Product and time range are required.');
   end if;
   v_from := (p_payload->>'fromDateTime')::timestamptz;
   v_to := (p_payload->>'toDateTime')::timestamptz;
   if v_from>v_to or v_to-v_from>interval '366 days' then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Invalid time range.');
   end if;
   select * into v_option from gyggateway.options where supplier_product_id=v_product and enabled=true;
   if not found then
     return jsonb_build_object('errorCode','INVALID_PRODUCT','errorMessage','Unknown or inactive option.');
   end if;
   select coalesce(jsonb_agg(jsonb_build_object(
       'productId',v_product,
       'dateTime',to_char(s.start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00',
       'vacancies',greatest(0, s.capacity -
         (select coalesce(sum(r.units),0)::integer from gyggateway.reservations r
          where r.slot_id=s.id and (r.status='booked' or (r.status='held' and r.expires_at>now())))),
       'cutoffSeconds',s.cutoff_seconds,
       'currency',s.currency,
       'pricesByCategory',jsonb_build_object('retailPrices',s.prices_by_category)
   ) order by s.start_at),'[]'::jsonb) into v_avail
   from gyggateway.slots s where s.option_id=v_option.id and s.enabled=true
    and s.start_at between v_from and v_to and s.start_at>now()+(s.cutoff_seconds||' seconds')::interval;
   return jsonb_build_object('data',jsonb_build_object('availabilities',v_avail));
 end if;
 if p_operation='reserve' then
   if v_product is null or v_gyg is null or length(v_gyg)>120 or p_payload->>'dateTime' is null then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Incomplete reservation request.');
   end if;
   v_start := (p_payload->>'dateTime')::timestamptz;
   v_items := p_payload->'bookingItems';
   if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items)=0 then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','bookingItems is required.');
   end if;
   select * into v_option from gyggateway.options where supplier_product_id=v_product and enabled=true;
   if not found then return jsonb_build_object('errorCode','INVALID_PRODUCT','errorMessage','Inactive option.');end if;
   select * into v_slot from gyggateway.slots
    where option_id=v_option.id and start_at=v_start and enabled=true for update;
   if not found then return jsonb_build_object('errorCode','NO_AVAILABILITY','errorMessage','Time slot not configured.');end if;
   if v_slot.start_at<=now()+(v_slot.cutoff_seconds||' seconds')::interval then
     return jsonb_build_object('errorCode','NO_AVAILABILITY','errorMessage','Booking cutoff has passed.');
   end if;
   select * into v_res from gyggateway.reservations where gyg_booking_reference=v_gyg for update;
   if found then
     if v_res.slot_id<>v_slot.id or v_res.status='cancelled' then
       return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Booking reference already used.');
     end if;
     return jsonb_build_object('data',jsonb_build_object(
       'reservationReference',v_res.reservation_reference,
       'reservationExpiration',to_char(v_res.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'));
   end if;
   if exists(select 1 from jsonb_array_elements(v_items) j
    where (j->>'count') is null or (j->>'count') !~ '^[1-9][0-9]*$'
       or not exists(select 1 from jsonb_array_elements(v_slot.prices_by_category) p
                     where p->>'category'=j->>'category')) then
     return jsonb_build_object('errorCode','INVALID_TICKET_CATEGORY','errorMessage','Unsupported category or quantity.');
   end if;
   select coalesce(sum((j->>'count')::integer),0)::integer into v_units from jsonb_array_elements(v_items) j;
   if v_units<1 or v_units>100 then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Invalid quantity.');
   end if;
   if v_option.capacity_mode='group' then v_units:=1;end if;
   select coalesce(sum(r.units),0)::integer into v_used from gyggateway.reservations r
    where r.slot_id=v_slot.id and (r.status='booked' or (r.status='held' and r.expires_at>now()));
   if v_slot.capacity-v_used<v_units then
     return jsonb_build_object('errorCode','NO_AVAILABILITY','errorMessage','Insufficient places.');
   end if;
   insert into gyggateway.reservations
      (slot_id,gyg_booking_reference,reservation_reference,booking_items,units,expires_at)
      values(v_slot.id,v_gyg,'WMRES-'||gen_random_uuid()::text,v_items,v_units,now()+interval '60 minutes')
      returning * into v_res;
   return jsonb_build_object('data',jsonb_build_object(
     'reservationReference',v_res.reservation_reference,
     'reservationExpiration',to_char(v_res.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'));
 end if;
 if p_operation='cancel-reservation' then
   if p_payload->>'reservationReference' is null or v_gyg is null then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','References required.');
   end if;
   select * into v_res from gyggateway.reservations
    where reservation_reference=p_payload->>'reservationReference' and gyg_booking_reference=v_gyg for update;
   if not found then return jsonb_build_object('errorCode','INVALID_RESERVATION','errorMessage','Unknown reservation.');end if;
   if v_res.status='held' then
     update gyggateway.reservations set status='cancelled',updated_at=now() where id=v_res.id;
   end if;
   return jsonb_build_object('data',jsonb_build_object());
 end if;
 if p_operation='book' then
   if p_payload->>'reservationReference' is null or v_gyg is null or v_product is null then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','References required.');
   end if;
   select r.* into v_res from gyggateway.reservations r
    join gyggateway.slots s on s.id=r.slot_id
    join gyggateway.options o on o.id=s.option_id
    where r.reservation_reference=p_payload->>'reservationReference'
      and r.gyg_booking_reference=v_gyg and o.supplier_product_id=v_product
      for update of r;
   if not found then return jsonb_build_object('errorCode','INVALID_RESERVATION','errorMessage','Reservation not found.');end if;
   if v_res.status='booked' then
     return jsonb_build_object('data',jsonb_build_object('bookingReference',v_res.booking_reference,'tickets',jsonb_build_array()));
   end if;
   if v_res.status<>'held' or v_res.expires_at<now() then
     return jsonb_build_object('errorCode','NO_AVAILABILITY','errorMessage','Reservation is no longer active.');
   end if;
   v_book:='WMBK-'||gen_random_uuid()::text;
   update gyggateway.reservations set status='booked',booking_reference=v_book,updated_at=now()
   where id=v_res.id;
   -- Actual voucher issuance awaits GetYourGuide ticket configuration confirmation.
   return jsonb_build_object('data',jsonb_build_object('bookingReference',v_book,'tickets',jsonb_build_array()));
 end if;
 if p_operation='cancel-booking' then
   if p_payload->>'bookingReference' is null or v_gyg is null then
     return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','References required.');
   end if;
   select * into v_res from gyggateway.reservations
     where booking_reference=p_payload->>'bookingReference' and gyg_booking_reference=v_gyg for update;
   if not found then return jsonb_build_object('errorCode','INVALID_BOOKING','errorMessage','Booking not found.');end if;
   update gyggateway.reservations set status='cancelled',updated_at=now()
    where id=v_res.id and status<>'cancelled';
   return jsonb_build_object('data',jsonb_build_object());
 end if;
 return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Unsupported operation.');
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
 return jsonb_build_object('errorCode','INVALID_REQUEST','errorMessage','Invalid date or quantity.');
end;
$fn$;
revoke all on function public.gyg_sandbox_dispatch(text,jsonb) from public, anon, authenticated;
grant execute on function public.gyg_sandbox_dispatch(text,jsonb) to service_role;
