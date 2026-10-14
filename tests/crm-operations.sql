-- Exercises the real RPC and triggers inside a rolled-back subtransaction.
-- No booking, activity, financial record or push event from this test is retained.
create temp table crm_operation_checks(report jsonb) on commit drop;
do $checks$
declare
  v_id uuid;
  v_booking uuid;
  v_before jsonb;
  v_after jsonb;
  v_result text;
  v_started timestamptz;
  v_activity_count bigint;
  v_checks jsonb := '[]'::jsonb;
begin
  select r.id, r.linked_booking_id,
    jsonb_build_object('request', to_jsonb(r), 'booking', to_jsonb(b))
  into v_id, v_booking, v_before
  from public.watermelon_requests r
  join public.watermelon_booking_requests b on b.id=r.linked_booking_id
  where r.kind='direct_booking'
  order by r.updated_at desc limit 1;
  if v_id is null then raise exception 'No linked booking for rollback-only regression test'; end if;
  select count(*) into v_activity_count from public.watermelon_activities where request_id=v_id;

  begin
    perform set_config('request.jwt.claims', '{"email":"c.vasconcelos1969@gmail.com","role":"authenticated"}', true);
    update public.watermelon_booking_requests set status='confirmed',payment_status='paid' where id=v_booking;
    update public.watermelon_requests set status='confirmed',service_started_at=null,completed_at=null,no_show_at=null where id=v_id;

    begin
      perform public.watermelon_set_request_operation_status(v_id, 'completed');
      raise exception 'Premature completion was accepted';
    exception when others then
      if sqlerrm <> 'Start the service before marking it completed' then raise; end if;
    end;
    if not exists(select 1 from public.watermelon_requests where id=v_id and status='confirmed' and completed_at is null) then
      raise exception 'Premature completion changed the request';
    end if;
    v_checks := v_checks || '["completion requires starting"]'::jsonb;

    v_result := public.watermelon_set_request_operation_status(v_id, 'in_service');
    if v_result <> 'in_service' or not exists(
      select 1 from public.watermelon_requests r join public.watermelon_booking_requests b on b.id=r.linked_booking_id
      where r.id=v_id and r.status='in_service' and b.status='in_service'
        and r.service_started_at is not null and r.completed_at is null and b.payment_status='paid'
    ) then raise exception 'Start did not persist in request and booking'; end if;
    select service_started_at into v_started from public.watermelon_requests where id=v_id;
    v_checks := v_checks || '["start persists both states and start timestamp"]'::jsonb;

    update public.watermelon_booking_requests set payment_reference=coalesce(payment_reference,'') || ' [rollback check]' where id=v_booking;
    if not exists(select 1 from public.watermelon_requests where id=v_id and status='in_service') then
      raise exception 'Payment metadata reverted an active service';
    end if;
    v_checks := v_checks || '["payment metadata preserves in-service state"]'::jsonb;

    v_result := public.watermelon_set_request_operation_status(v_id, 'completed');
    if v_result <> 'completed' or not exists(
      select 1 from public.watermelon_requests r join public.watermelon_booking_requests b on b.id=r.linked_booking_id
      where r.id=v_id and r.status='completed' and b.status='completed'
        and r.service_started_at=v_started and r.completed_at is not null and b.payment_status='paid'
    ) then raise exception 'Completion did not persist in request and booking'; end if;
    v_checks := v_checks || '["completion persists both states and timestamps"]'::jsonb;

    update public.watermelon_booking_requests set payment_reference=coalesce(payment_reference,'') || ' [completed check]' where id=v_booking;
    if not exists(select 1 from public.watermelon_requests where id=v_id and status='completed') then
      raise exception 'Payment metadata reopened a completed service';
    end if;
    v_checks := v_checks || '["payment metadata preserves completion"]'::jsonb;

    begin
      perform public.watermelon_set_request_operation_status(v_id, 'in_service');
      raise exception 'Closed service was restarted';
    exception when others then
      if sqlerrm <> 'This request is already closed' then raise; end if;
    end;
    v_checks := v_checks || '["closed service cannot restart"]'::jsonb;

    update public.watermelon_booking_requests set status='confirmed' where id=v_booking;
    update public.watermelon_requests set status='confirmed',no_show_at=null where id=v_id;
    v_result := public.watermelon_set_request_operation_status(v_id, 'no_show');
    if v_result <> 'no_show' or not exists(
      select 1 from public.watermelon_requests r join public.watermelon_booking_requests b on b.id=r.linked_booking_id
      where r.id=v_id and r.status='no_show' and b.status='no_show' and r.no_show_at is not null
    ) then raise exception 'No-show did not persist in request and booking'; end if;
    v_checks := v_checks || '["no-show persists both states"]'::jsonb;

    perform set_config('request.jwt.claims', '{}', true);
    begin
      perform public.watermelon_set_request_operation_status(v_id, 'completed');
      raise exception 'Unauthenticated operation was accepted';
    exception when others then
      if sqlerrm <> 'Not authorized' then raise; end if;
    end;
    v_checks := v_checks || '["unauthenticated caller is rejected"]'::jsonb;

    perform set_config('request.jwt.claims', '{"email":"crm-regression@example.invalid","role":"authenticated"}', true);
    begin
      perform public.watermelon_set_request_operation_status(v_id, 'completed');
      raise exception 'Non-admin operation was accepted';
    exception when others then
      if sqlerrm <> 'Not authorized' then raise; end if;
    end;
    v_checks := v_checks || '["non-admin caller is rejected"]'::jsonb;

    raise exception using errcode='PT001',message='Rollback regression changes';
  exception when sqlstate 'PT001' then null;
  end;

  select jsonb_build_object('request',to_jsonb(r),'booking',to_jsonb(b)) into v_after
  from public.watermelon_requests r join public.watermelon_booking_requests b on b.id=r.linked_booking_id where r.id=v_id;
  if v_before is distinct from v_after or v_activity_count <> (
    select count(*) from public.watermelon_activities where request_id=v_id
  ) then raise exception 'Rollback failed to restore original records'; end if;
  v_checks := v_checks || '["all test changes rolled back"]'::jsonb;
  insert into crm_operation_checks values (jsonb_build_object('passed',jsonb_array_length(v_checks),'checks',v_checks));
end;
$checks$;
select report from crm_operation_checks;
