-- Apply atomically to the Watermelon booking database.
CREATE OR REPLACE FUNCTION watermelon_private.sync_booking_to_crm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private'
AS $function$
declare
  v_contact_id uuid;
  v_request_id uuid;
  v_existing_status text;
  v_phone_digits text := regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g');
  v_status text;
begin
  select r.id, r.contact_id, r.status
  into v_request_id, v_contact_id, v_existing_status
  from public.watermelon_requests r
  where r.linked_booking_id = new.id
  limit 1;

  v_status := case
    -- Operational and terminal states take precedence over payment status.
    when new.status in ('in_service', 'completed', 'no_show') then new.status
    when new.status = 'confirmed' then 'confirmed'
    when new.status = 'declined' then 'declined'
    when new.status = 'cancelled' then 'cancelled'
    when new.payment_status = 'awaiting' then 'awaiting_payment'
    when new.payment_status = 'paid' then 'confirmed'
    when new.status = 'approved' then 'accepted'
    when new.status = 'alternative_proposed' then 'in_review'
    when new.status = 'pending'
      and v_existing_status in ('in_review','awaiting_customer','customer_replied')
      then v_existing_status
    else 'new'
  end;

  if v_request_id is null then
    if v_phone_digits <> '' then
      select c.id into v_contact_id
      from public.watermelon_contacts c
      where regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits
      order by c.last_contact_at desc
      limit 1;
    end if;

    if v_contact_id is null and nullif(trim(coalesce(new.customer_email, '')), '') is not null then
      select c.id into v_contact_id
      from public.watermelon_contacts c
      where lower(c.email) = lower(trim(new.customer_email))
      order by c.last_contact_at desc
      limit 1;
    end if;

    if v_contact_id is null then
      insert into public.watermelon_contacts (
        name, email, phone, preferred_language, source, last_contact_at
      ) values (
        new.customer_name,
        new.customer_email,
        new.customer_phone,
        new.language,
        'direct_booking',
        now()
      )
      returning id into v_contact_id;
    else
      update public.watermelon_contacts
      set
        name = new.customer_name,
        email = coalesce(nullif(trim(coalesce(new.customer_email, '')), ''), email),
        phone = coalesce(nullif(trim(coalesce(new.customer_phone, '')), ''), phone),
        preferred_language = coalesce(nullif(trim(coalesce(new.language, '')), ''), preferred_language),
        last_contact_at = now()
      where id = v_contact_id;
    end if;

    insert into public.watermelon_requests (
      reference, contact_id, kind, status, source, currency, estimated_total,
      customer_notes, linked_booking_id, last_contact_at
    ) values (
      new.reference, v_contact_id, 'direct_booking', v_status, 'website',
      new.currency, new.estimated_total, new.customer_notes, new.id, now()
    )
    returning id into v_request_id;

    insert into public.watermelon_request_items (
      request_id, position, product_code, experience_title, option_code, option_name,
      requested_date, preferred_time, guests, unit_price, subtotal, pricing_mode, pickup_location,
      guide_language, special_request
    ) values (
      v_request_id, 0, new.product_code, new.experience_title, new.option_code, new.option_name,
      new.requested_date, new.preferred_time, new.guests, new.unit_price, new.estimated_total,
      new.pricing_mode, new.pickup_location, new.language, new.customer_notes
    );

    insert into public.watermelon_activities (
      request_id, contact_id, activity_type, summary, metadata
    ) values (
      v_request_id, v_contact_id, 'request_received',
      'Direct booking request received from the website',
      jsonb_build_object('reference', new.reference, 'source', 'website')
    );
  else
    update public.watermelon_contacts
    set
      name = new.customer_name,
      email = coalesce(nullif(trim(coalesce(new.customer_email, '')), ''), email),
      phone = coalesce(nullif(trim(coalesce(new.customer_phone, '')), ''), phone),
      preferred_language = coalesce(nullif(trim(coalesce(new.language, '')), ''), preferred_language),
      last_contact_at = now()
    where id = v_contact_id;

    update public.watermelon_requests
    set
      status = v_status,
      currency = new.currency,
      estimated_total = new.estimated_total,
      customer_notes = new.customer_notes,
      last_contact_at = now()
    where id = v_request_id;

    update public.watermelon_request_items
    set
      product_code = new.product_code,
      experience_title = new.experience_title,
      option_code = new.option_code,
      option_name = new.option_name,
      requested_date = new.requested_date,
      preferred_time = new.preferred_time,
      guests = new.guests,
      unit_price = new.unit_price,
      subtotal = new.estimated_total,
      pricing_mode = new.pricing_mode,
      pickup_location = new.pickup_location,
      guide_language = new.language,
      special_request = new.customer_notes
    where request_id = v_request_id and position = 0;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.watermelon_set_request_operation_status(p_request_id uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private', 'auth'
AS $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_current_status text;
  v_kind text;
  v_booking_id uuid;
  v_contact_id uuid;
begin
  if not exists (
    select 1
    from watermelon_private.admins a
    where a.email = lower(coalesce(auth.jwt()->>'email',''))
  ) then
    raise exception 'Not authorized';
  end if;

  if v_status not in ('in_service', 'completed', 'no_show') then
    raise exception 'Invalid operational status';
  end if;

  select status, kind, linked_booking_id, contact_id
    into v_current_status, v_kind, v_booking_id, v_contact_id
  from public.watermelon_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if v_current_status in ('declined', 'cancelled', 'completed', 'no_show') then
    raise exception 'This request is already closed';
  end if;

  if v_status = 'in_service' and v_current_status <> 'confirmed' then
    raise exception 'Only confirmed bookings can be checked in';
  end if;

  if v_status = 'completed' and v_current_status <> 'in_service' then
    raise exception 'Start the service before marking it completed';
  end if;

  if v_status in ('completed', 'no_show')
     and v_current_status not in ('confirmed', 'in_service') then
    raise exception 'Only confirmed or checked-in bookings can be closed operationally';
  end if;

  update public.watermelon_requests
  set
    status = v_status,
    service_started_at = case
      when v_status = 'in_service' then coalesce(service_started_at, now())
      else service_started_at
    end,
    completed_at = case
      when v_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end,
    no_show_at = case
      when v_status = 'no_show' then coalesce(no_show_at, now())
      else no_show_at
    end,
    last_contact_at = now(),
    updated_at = now()
  where id = p_request_id;

  if v_kind = 'direct_booking' and v_booking_id is not null then
    update public.watermelon_booking_requests
    set
      status = v_status,
      updated_at = now()
    where id = v_booking_id;
  end if;

  -- Never report success if a linked-booking trigger overwrites the CRM state.
  if not exists (
    select 1 from public.watermelon_requests r
    where r.id = p_request_id and r.status = v_status
  ) or (v_kind = 'direct_booking' and v_booking_id is not null and not exists (
    select 1 from public.watermelon_booking_requests b
    where b.id = v_booking_id and b.status = v_status
  )) then
    raise exception 'Operational status did not persist consistently';
  end if;

  insert into public.watermelon_activities (
    request_id, contact_id, activity_type, summary, metadata, actor_email
  ) values (
    p_request_id,
    v_contact_id,
    'booking_operation_status',
    case v_status
      when 'in_service' then 'Guest checked in — experience started'
      when 'completed' then 'Experience completed'
      when 'no_show' then 'Guest marked as no-show'
    end,
    jsonb_build_object('old_status', v_current_status, 'new_status', v_status),
    lower(coalesce(auth.jwt()->>'email',''))
  );

  return v_status;
end;
$function$
;


-- Recover only states evidenced by the last recorded operational action.
-- Preserve existing timestamps and all financial/customer data.
with repaired as (
  update public.watermelon_requests r
  set status = b.status, updated_at = now()
  from public.watermelon_booking_requests b
  where r.linked_booking_id = b.id
    and r.kind = 'direct_booking'
    and r.status = 'confirmed'
    and b.status in ('in_service', 'completed', 'no_show')
    and (
      select a.metadata->>'new_status'
      from public.watermelon_activities a
      where a.request_id = r.id and a.activity_type = 'booking_operation_status'
      order by a.created_at desc, a.id desc
      limit 1
    ) = b.status
  returning r.id, r.contact_id, r.status
)
insert into public.watermelon_activities (
  request_id, contact_id, activity_type, summary, metadata
)
select id, contact_id, 'operation_status_reconciled',
  'Recovered the recorded service state after correcting booking synchronization',
  jsonb_build_object('old_status', 'confirmed', 'new_status', status)
from repaired;

