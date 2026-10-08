begin;
alter table public.watermelon_booking_requests add column if not exists pricing_mode text not null default 'per_person' check (pricing_mode in ('per_person','group'));
alter table public.watermelon_request_items add column if not exists pricing_mode text not null default 'per_person' check (pricing_mode in ('per_person','group'));
alter table public.watermelon_proposal_items add column if not exists pricing_mode text not null default 'per_person' check (pricing_mode in ('per_person','group'));
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
$function$;

CREATE OR REPLACE FUNCTION public.watermelon_create_proposal_request(p_reference text, p_customer_name text, p_customer_email text, p_customer_phone text, p_customer_notes text, p_estimated_total numeric, p_currency text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private'
AS $function$
declare
  v_contact_id uuid;
  v_request_id uuid;
  v_phone_digits text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if nullif(trim(coalesce(p_reference, '')), '') is null
     or nullif(trim(coalesce(p_customer_name, '')), '') is null
     or nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'Missing required proposal details';
  end if;

  if v_phone_digits <> '' then
    select c.id into v_contact_id
    from public.watermelon_contacts c
    where regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits
    order by c.last_contact_at desc
    limit 1;
  end if;

  if v_contact_id is null and v_email is not null then
    select c.id into v_contact_id
    from public.watermelon_contacts c
    where lower(c.email) = v_email
    order by c.last_contact_at desc
    limit 1;
  end if;

  if v_contact_id is null then
    insert into public.watermelon_contacts (
      name, email, phone, source, last_contact_at
    ) values (
      left(trim(p_customer_name), 150),
      nullif(left(trim(coalesce(p_customer_email, '')), 250), ''),
      left(trim(p_customer_phone), 80),
      'website_proposal',
      now()
    )
    returning id into v_contact_id;
  else
    update public.watermelon_contacts
    set
      name = left(trim(p_customer_name), 150),
      email = coalesce(nullif(left(trim(coalesce(p_customer_email, '')), 250), ''), email),
      phone = coalesce(nullif(left(trim(coalesce(p_customer_phone, '')), 80), ''), phone),
      last_contact_at = now()
    where id = v_contact_id;
  end if;

  insert into public.watermelon_requests (
    reference,
    contact_id,
    kind,
    status,
    source,
    currency,
    estimated_total,
    customer_notes,
    last_contact_at
  ) values (
    left(trim(p_reference), 80),
    v_contact_id,
    'personalized_proposal',
    'new',
    'website',
    upper(left(coalesce(nullif(trim(p_currency), ''), 'EUR'), 3)),
    p_estimated_total,
    nullif(left(trim(coalesce(p_customer_notes, '')), 4000), ''),
    now()
  )
  returning id into v_request_id;

  insert into public.watermelon_request_items (
    request_id,
    position,
    product_code,
    experience_title,
    option_code,
    option_name,
    requested_date,
    preferred_time,
    date_flexibility,
    guests,
    unit_price,
    subtotal,
    pricing_mode,
    pickup_location,
    guide_language,
    special_request,
    children_ages,
    accessibility,
    dietary,
    occasion
  )
  select
    v_request_id,
    coalesce(x.position, 0),
    nullif(left(trim(coalesce(x.product_code, '')), 80), ''),
    left(trim(coalesce(x.experience_title, 'Experience')), 250),
    nullif(left(trim(coalesce(x.option_code, '')), 80), ''),
    nullif(left(trim(coalesce(x.option_name, '')), 200), ''),
    case
      when coalesce(x.requested_date, '') ~ '^\d{4}-\d{2}-\d{2}$' then x.requested_date::date
      else null
    end,
    nullif(left(trim(coalesce(x.preferred_time, '')), 80), ''),
    nullif(left(trim(coalesce(x.date_flexibility, '')), 80), ''),
    greatest(1, least(50, coalesce(x.guests, 1))),
    x.unit_price,
    round(x.unit_price * case when x.pricing_mode = 'group' then 1 else greatest(1, least(50, coalesce(x.guests, 1))) end, 2),
    coalesce(x.pricing_mode, 'per_person'),
    nullif(left(trim(coalesce(x.pickup_location, '')), 500), ''),
    nullif(left(trim(coalesce(x.guide_language, '')), 80), ''),
    nullif(left(trim(coalesce(x.special_request, '')), 2000), ''),
    nullif(left(trim(coalesce(x.children_ages, '')), 500), ''),
    nullif(left(trim(coalesce(x.accessibility, '')), 1000), ''),
    nullif(left(trim(coalesce(x.dietary, '')), 1000), ''),
    nullif(left(trim(coalesce(x.occasion, '')), 500), '')
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    position integer,
    product_code text,
    experience_title text,
    option_code text,
    option_name text,
    requested_date text,
    preferred_time text,
    date_flexibility text,
    guests integer,
    unit_price numeric,
    subtotal numeric,
    pricing_mode text,
    pickup_location text,
    guide_language text,
    special_request text,
    children_ages text,
    accessibility text,
    dietary text,
    occasion text
  );

  update public.watermelon_requests set estimated_total=(select coalesce(sum(subtotal),0) from public.watermelon_request_items where request_id=v_request_id) where id=v_request_id;

  insert into public.watermelon_activities (
    request_id, contact_id, activity_type, summary, metadata
  ) values (
    v_request_id,
    v_contact_id,
    'request_received',
    'Personalized proposal request received from the website',
    jsonb_build_object('reference', p_reference, 'source', 'website')
  );

  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.watermelon_save_proposal_draft(p_request_id uuid, p_valid_until date, p_intro_text text, p_conditions_text text, p_discount_amount numeric, p_extras_amount numeric, p_items jsonb)
 RETURNS TABLE(proposal_id uuid, public_token uuid, version integer, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private', 'auth'
AS $function$
declare
  v_proposal_id uuid;
  v_token uuid;
  v_version integer;
  v_status text;
  v_currency text;
  v_subtotal numeric := 0;
  v_discount numeric := greatest(0, coalesce(p_discount_amount, 0));
  v_extras numeric := greatest(0, coalesce(p_extras_amount, 0));
  v_total numeric := 0;
  v_contact_id uuid;
begin
  if not exists (
    select 1
    from watermelon_private.admins a
    where a.email = lower(coalesce(auth.jwt()->>'email',''))
  ) then
    raise exception 'Not authorized';
  end if;

  select r.currency, r.contact_id
    into v_currency, v_contact_id
  from public.watermelon_requests r
  where r.id = p_request_id;

  if v_currency is null then
    raise exception 'Request not found';
  end if;

  select p.id, p.public_token, p.version, p.status
    into v_proposal_id, v_token, v_version, v_status
  from public.watermelon_proposals p
  where p.request_id = p_request_id
  order by p.version desc
  limit 1;

  if v_proposal_id is null or v_status <> 'draft' then
    select coalesce(max(p.version), 0) + 1
      into v_version
    from public.watermelon_proposals p
    where p.request_id = p_request_id;

    insert into public.watermelon_proposals (
      request_id, version, status, currency
    ) values (
      p_request_id, v_version, 'draft', v_currency
    )
    returning
      watermelon_proposals.id,
      watermelon_proposals.public_token
    into v_proposal_id, v_token;
  end if;

  select coalesce(sum(
    greatest(0, coalesce(x.unit_price, 0))
    * case when x.pricing_mode = 'group' then 1 else greatest(1, least(50, coalesce(x.guests, 1))) end
  ), 0)
  into v_subtotal
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    pricing_mode text,
    unit_price numeric,
    guests integer
  );

  v_total := greatest(0, v_subtotal - v_discount + v_extras);

  update public.watermelon_proposals
  set
    valid_until = p_valid_until,
    intro_text = nullif(left(trim(coalesce(p_intro_text, '')), 4000), ''),
    conditions_text = nullif(left(trim(coalesce(p_conditions_text, '')), 6000), ''),
    subtotal = v_subtotal,
    discount_amount = v_discount,
    extras_amount = v_extras,
    total = v_total,
    currency = v_currency
  where id = v_proposal_id;

  delete from public.watermelon_proposal_items pi
  where pi.proposal_id = v_proposal_id;

  insert into public.watermelon_proposal_items (
    proposal_id,
    position,
    experience_title,
    option_name,
    proposed_date,
    proposed_time,
    guests,
    unit_price,
    pricing_mode,
    line_total,
    pickup_location,
    notes
  )
  select
    v_proposal_id,
    coalesce(x.position, 0),
    left(trim(coalesce(x.experience_title, 'Experience')), 250),
    nullif(left(trim(coalesce(x.option_name, '')), 200), ''),
    case
      when coalesce(x.proposed_date, '') ~ '^\d{4}-\d{2}-\d{2}$' then x.proposed_date::date
      else null
    end,
    nullif(left(trim(coalesce(x.proposed_time, '')), 80), ''),
    greatest(1, least(50, coalesce(x.guests, 1))),
    greatest(0, coalesce(x.unit_price, 0)),
    coalesce(x.pricing_mode, 'per_person'),
    greatest(0, coalesce(x.unit_price, 0))
      * case when x.pricing_mode = 'group' then 1 else greatest(1, least(50, coalesce(x.guests, 1))) end,
    nullif(left(trim(coalesce(x.pickup_location, '')), 500), ''),
    nullif(left(trim(coalesce(x.notes, '')), 2000), '')
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    position integer,
    experience_title text,
    option_name text,
    proposed_date text,
    proposed_time text,
    guests integer,
    pricing_mode text,
    unit_price numeric,
    pickup_location text,
    notes text
  );

  update public.watermelon_requests
  set
    status = 'proposal_drafting',
    estimated_total = v_total,
    last_contact_at = now()
  where id = p_request_id;

  insert into public.watermelon_activities (
    request_id,
    contact_id,
    activity_type,
    summary,
    metadata,
    actor_email
  ) values (
    p_request_id,
    v_contact_id,
    'proposal_draft_saved',
    'Proposal draft v' || v_version || ' saved',
    jsonb_build_object(
      'proposal_id', v_proposal_id,
      'version', v_version,
      'total', v_total
    ),
    lower(coalesce(auth.jwt()->>'email',''))
  );

  return query
  select v_proposal_id, v_token, v_version, v_total;
end;
$function$;

CREATE OR REPLACE FUNCTION public.watermelon_proposal_page(p_reference text, p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private'
AS $function$
  select jsonb_build_object(
    'proposal_id', p.id,
    'reference', r.reference,
    'version', p.version,
    'status', p.status,
    'is_expired', (
      p.valid_until is not null
      and p.valid_until < (now() at time zone 'Europe/Lisbon')::date
    ),
    'created_at', p.created_at,
    'sent_at', p.sent_at,
    'accepted_at', p.accepted_at,
    'valid_until', p.valid_until,
    'currency', p.currency,
    'intro_text', p.intro_text,
    'conditions_text', p.conditions_text,
    'subtotal', p.subtotal,
    'discount_amount', p.discount_amount,
    'extras_amount', p.extras_amount,
    'total', p.total,
    'customer_response', p.customer_response,
    'customer_name', c.name,
    'payment_status', p.payment_status,
    'payment_method', p.payment_method,
    'payment_token', case when p.status = 'accepted' then p.payment_token else null end,
    'payment_requested_at', p.payment_requested_at,
    'paid_at', p.paid_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'position', i.position,
          'experience_title', i.experience_title,
          'option_name', i.option_name,
          'proposed_date', i.proposed_date,
          'proposed_time', i.proposed_time,
          'guests', i.guests,
          'unit_price', i.unit_price,
          'pricing_mode', i.pricing_mode,
          'line_total', i.line_total,
          'pickup_location', i.pickup_location,
          'notes', i.notes
        )
        order by i.position
      )
      from public.watermelon_proposal_items i
      where i.proposal_id = p.id
    ), '[]'::jsonb)
  )
  from public.watermelon_proposals p
  join public.watermelon_requests r on r.id = p.request_id
  join public.watermelon_contacts c on c.id = r.contact_id
  where r.reference = p_reference
    and p.public_token = p_token
    and p.status in ('sent','accepted','changes_requested')
  limit 1;
$function$;

update public.watermelon_request_items set pricing_mode='group' where guests>1 and unit_price>0 and subtotal=unit_price;
update public.watermelon_proposal_items set pricing_mode='group' where guests>1 and unit_price>0 and line_total=unit_price;
update public.watermelon_booking_requests set pricing_mode='group' where guests>1 and unit_price>0 and estimated_total=unit_price;
update public.watermelon_booking_requests set pricing_mode='group',estimated_total=unit_price where reference='WM-261008-A68CE15' and product_code='9963P3' and option_code='TG1' and status='pending' and payment_status='not_requested' and unit_price=882 and estimated_total=10584;
commit;

