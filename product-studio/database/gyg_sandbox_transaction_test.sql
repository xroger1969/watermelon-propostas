-- Run as a single transaction; assertions stop on any failure. Leaves zero test rows.
begin;
do $test$
declare
  v_option uuid;
  v_slot_start timestamptz:=date_trunc('second',now()+interval '2 days');
  v_iso text;
  v_response jsonb;
  v_ref text;
  v_booking text;
  v_req jsonb;
  v_second jsonb;
  v_existing uuid;
begin
  select id into v_existing from public.product_options limit 1;
  if v_existing is null then raise exception 'No existing studio product options to test';end if;
  insert into gyggateway.options(product_option_id,supplier_product_id,enabled,capacity_mode)
    values(v_existing,'GYG-SANDBOX-TRANSACTION-TEST',true,'individual') returning id into v_option;
  insert into gyggateway.slots(option_id,start_at,capacity,enabled,cutoff_seconds,currency,prices_by_category)
    values(v_option,v_slot_start,1,true,3600,'EUR','[{"category":"ADULT","price":1000}]'::jsonb);
  v_iso:=to_char(v_slot_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00';
  v_response:=public.gyg_sandbox_dispatch('get-availabilities',jsonb_build_object(
    'productId','GYG-SANDBOX-TRANSACTION-TEST','fromDateTime',v_iso,
    'toDateTime',to_char((v_slot_start+interval '1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'));
  if jsonb_array_length(v_response#>'{data,availabilities}')<>1 or
     (v_response#>>'{data,availabilities,0,vacancies}')::int<>1 then
    raise exception 'Availability test failed: %',v_response;
  end if;
  v_req:=jsonb_build_object('productId','GYG-SANDBOX-TRANSACTION-TEST',
    'dateTime',v_iso,'gygBookingReference','GYG-SANDBOX-BOOK-1',
    'bookingItems',jsonb_build_array(jsonb_build_object('category','ADULT','count',1)));
  v_response:=public.gyg_sandbox_dispatch('reserve',v_req);
  v_ref:=v_response#>>'{data,reservationReference}';
  if v_ref is null then raise exception 'Reserve test failed: %',v_response;end if;
  v_response:=public.gyg_sandbox_dispatch('reserve',v_req);
  if v_response#>>'{data,reservationReference}'<>v_ref then raise exception 'Retry reserve not idempotent';end if;
  v_second:=public.gyg_sandbox_dispatch('reserve',jsonb_set(v_req,'{gygBookingReference}','"GYG-SANDBOX-BOOK-2"'::jsonb));
  if v_second->>'errorCode'<>'NO_AVAILABILITY' then raise exception 'Overbooking possible: %',v_second;end if;
  v_response:=public.gyg_sandbox_dispatch('book',jsonb_build_object('productId','GYG-SANDBOX-TRANSACTION-TEST',
     'gygBookingReference','GYG-SANDBOX-BOOK-1','reservationReference',v_ref));
  v_booking:=v_response#>>'{data,bookingReference}';
  if v_booking is null then raise exception 'Book test failed: %',v_response;end if;
  v_response:=public.gyg_sandbox_dispatch('book',jsonb_build_object('productId','GYG-SANDBOX-TRANSACTION-TEST',
     'gygBookingReference','GYG-SANDBOX-BOOK-1','reservationReference',v_ref));
  if v_response#>>'{data,bookingReference}'<>v_booking then raise exception 'Retry book not idempotent';end if;
  v_response:=public.gyg_sandbox_dispatch('cancel-booking',jsonb_build_object(
     'bookingReference',v_booking,'gygBookingReference','GYG-SANDBOX-BOOK-1'));
  if v_response#>'{data}' <> '{}'::jsonb then raise exception 'Booking cancellation failed: %',v_response;end if;
  v_response:=public.gyg_sandbox_dispatch('reserve',
    jsonb_set(v_req,'{gygBookingReference}','"GYG-SANDBOX-BOOK-2"'::jsonb));
  if v_response#>>'{data,reservationReference}' is null then
    raise exception 'Places were not released after cancellation: %',v_response;
  end if;
end $test$;
rollback;

select
  (select count(*) from gyggateway.options where supplier_product_id='GYG-SANDBOX-TRANSACTION-TEST') as leftover_options,
  (select count(*) from gyggateway.reservations where gyg_booking_reference like 'GYG-SANDBOX-BOOK-%') as leftover_reservations,
  has_function_privilege('anon','public.gyg_sandbox_dispatch(text,jsonb)','EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated','public.gyg_sandbox_dispatch(text,jsonb)','EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role','public.gyg_sandbox_dispatch(text,jsonb)','EXECUTE') as service_can_execute;
