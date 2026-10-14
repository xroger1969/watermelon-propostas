-- Watermelon CRM: owner-only atomic bulk deletion RPCs.
-- This migration only installs functions; it never deletes any live records.

CREATE OR REPLACE FUNCTION public.watermelon_bulk_delete_requests(p_request_ids uuid[], p_expected_status text, p_confirm_count integer, p_allow_paid boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_count integer;
  v_distinct integer;
  v_id uuid;
begin
  if v_email = '' or not exists (select 1 from watermelon_private.admins where email = v_email) then
    raise exception 'Not authorized';
  end if;
  v_count := coalesce(cardinality(p_request_ids),0);
  if v_count < 1 or v_count > 500 or p_confirm_count is distinct from v_count then
    raise exception 'Invalid batch size or confirmation';
  end if;
  select count(distinct id) into v_distinct from unnest(p_request_ids) as ids(id);
  if v_distinct <> v_count then raise exception 'Duplicate request identifiers'; end if;
  select count(*) into v_distinct
    from public.watermelon_requests r
    where r.id = any(p_request_ids) and r.is_private = false
      and (p_expected_status is null or r.status = p_expected_status);
  if v_distinct <> v_count then
    raise exception 'The selected requests changed. Reload the CRM and try again.';
  end if;
  if not coalesce(p_allow_paid,false) and exists(
    select 1 from public.watermelon_requests r
    left join public.watermelon_booking_requests b on b.id=r.linked_booking_id
    where r.id=any(p_request_ids)
      and (b.payment_status in ('paid','refunded')
        or exists (select 1 from public.watermelon_proposals p
          where p.request_id=r.id and p.payment_status in ('paid','refunded')))
  ) then
    raise exception 'Paid or refunded records need an additional confirmation.';
  end if;
  for v_id in select id from public.watermelon_requests where id=any(p_request_ids) order by id for update
  loop
    perform public.watermelon_delete_request(v_id);
  end loop;
  return jsonb_build_object('ok',true,'deleted',v_count);
end;
$function$
;

REVOKE ALL ON FUNCTION public.watermelon_bulk_delete_requests(uuid[],text,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.watermelon_bulk_delete_requests(uuid[],text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.watermelon_bulk_delete_contacts(p_contact_ids uuid[], p_confirm_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_count integer;
  v_distinct integer;
  v_id uuid;
begin
  if v_email = '' or not exists (select 1 from watermelon_private.admins where email = v_email) then
    raise exception 'Not authorized';
  end if;
  v_count := coalesce(cardinality(p_contact_ids),0);
  if v_count < 1 or v_count > 500 or p_confirm_count is distinct from v_count then
    raise exception 'Invalid batch size or confirmation';
  end if;
  select count(distinct id) into v_distinct from unnest(p_contact_ids) as ids(id);
  if v_distinct <> v_count then raise exception 'Duplicate contact identifiers'; end if;
  select count(*) into v_distinct from public.watermelon_contacts
    where id=any(p_contact_ids) and is_private=false;
  if v_distinct <> v_count then
    raise exception 'The selected contacts changed. Reload the CRM and try again.';
  end if;
  if exists(select 1 from public.watermelon_requests
            where contact_id=any(p_contact_ids)) then
    raise exception 'Some contacts have requests. Delete those requests first.';
  end if;
  for v_id in select id from public.watermelon_contacts where id=any(p_contact_ids) order by id for update
  loop
    perform public.watermelon_delete_contact(v_id);
  end loop;
  return jsonb_build_object('ok',true,'deleted',v_count);
end;
$function$
;

REVOKE ALL ON FUNCTION public.watermelon_bulk_delete_contacts(uuid[],integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.watermelon_bulk_delete_contacts(uuid[],integer) TO authenticated;
