-- The limited import token is provisioned separately. Only its SHA-256 hash is
-- stored here; neither campaign controls nor CRM customer records are granted.
create schema if not exists watermelon_ads_private;
revoke all on schema watermelon_ads_private from public, anon, authenticated;
grant usage on schema watermelon_ads_private to anon, authenticated;

create table if not exists watermelon_ads_private.report_connection (
  id boolean primary key default true check (id),
  token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$'),
  account_id text not null check (account_id = '5755985719'),
  campaign_id text not null check (campaign_id = '24302500298'),
  time_zone text not null default 'Europe/Lisbon',
  last_received_at timestamptz,
  last_snapshot_at timestamptz
);
alter table watermelon_ads_private.report_connection enable row level security;
revoke all on watermelon_ads_private.report_connection from public, anon, authenticated;

create or replace function watermelon_ads_private.import_report(p_token text, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_config watermelon_ads_private.report_connection%rowtype;
  v_until date;
  v_from date;
  v_snapshot timestamptz;
  v_zone text;
  v_campaign jsonb;
  v_now timestamptz := now();
begin
  select * into v_config from watermelon_ads_private.report_connection where id for update;
  if not found or p_token is null or p_token !~ '^[a-f0-9]{64}$' or
     encode(sha256(convert_to(p_token, 'UTF8')), 'hex') is distinct from v_config.token_sha256 then
    raise exception 'Invalid report authorization' using errcode = '28000';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object' or
     p_report->>'schemaVersion' is distinct from '1' or
     p_report->>'accountId' is distinct from v_config.account_id or
     p_report->>'campaignId' is distinct from v_config.campaign_id or
     p_report->>'currency' is distinct from 'EUR' then
    raise exception 'Unexpected account, campaign or currency';
  end if;
  v_zone := p_report->>'timeZone';
  if v_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    raise exception 'Invalid timezone';
  end if;
  v_until := (p_report->>'reportDate')::date;
  v_from := v_until - 29;
  v_snapshot := (p_report->>'snapshotAt')::timestamptz;
  if v_until is null or v_until not between (v_now at time zone v_zone)::date - 1 and (v_now at time zone v_zone)::date or
     v_snapshot is null or v_snapshot not between v_now - interval '15 minutes' and v_now + interval '5 minutes' then
    raise exception 'Outdated or future report';
  end if;
  if v_config.last_snapshot_at is not null and v_snapshot < v_config.last_snapshot_at then
    raise exception 'An older report cannot overwrite a newer one';
  end if;
  v_campaign := p_report->'campaign';
  if jsonb_typeof(v_campaign) is distinct from 'object' or
     length(trim(coalesce(v_campaign->>'name',''))) not between 1 and 300 or
     coalesce(v_campaign->>'status','') not in ('ENABLED','PAUSED','REMOVED') or
     jsonb_typeof(v_campaign->'budgetAmount') is distinct from 'number' or
     (v_campaign->>'budgetAmount')::numeric not between 0 and 1000000000 or
     jsonb_typeof(v_campaign->'primaryStatusReasons') is distinct from 'array' then
    raise exception 'Invalid campaign metadata';
  end if;
  if jsonb_typeof(p_report->'daily') is distinct from 'array' or jsonb_array_length(p_report->'daily') <> 30 then
    raise exception 'A complete 30-day report is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_report->'daily') as item
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'impressions') is distinct from 'number'
       or jsonb_typeof(item->'clicks') is distinct from 'number'
       or jsonb_typeof(item->'cost') is distinct from 'number'
       or jsonb_typeof(item->'conversions') is distinct from 'number'
       or jsonb_typeof(item->'conversionValue') is distinct from 'number'
  ) then raise exception 'Invalid daily metrics'; end if;
  if (select count(distinct item->>'reportDate') from jsonb_array_elements(p_report->'daily') as item) <> 30 or exists (
    select 1 from jsonb_array_elements(p_report->'daily') as item
    where (item->>'reportDate')::date is null or (item->>'reportDate')::date not between v_from and v_until
       or (item->>'impressions')::numeric not between 0 and 1000000000000
       or (item->>'clicks')::numeric not between 0 and 1000000000000
       or (item->>'impressions')::numeric <> trunc((item->>'impressions')::numeric)
       or (item->>'clicks')::numeric <> trunc((item->>'clicks')::numeric)
       or (item->>'cost')::numeric not between 0 and 1000000000000
       or (item->>'conversions')::numeric not between 0 and 1000000000000
       or (item->>'conversionValue')::numeric not between 0 and 1000000000000
  ) then raise exception 'Missing, duplicated or invalid report days'; end if;

  insert into public.watermelon_google_ads_daily (
    report_date, account_id, campaign_id, campaign_name, currency,
    impressions, clicks, cost, conversions, conversion_value, synced_at
  ) select (item->>'reportDate')::date, v_config.account_id, v_config.campaign_id,
    v_campaign->>'name', 'EUR', (item->>'impressions')::bigint, (item->>'clicks')::bigint,
    (item->>'cost')::numeric, (item->>'conversions')::numeric, (item->>'conversionValue')::numeric, v_now
  from jsonb_array_elements(p_report->'daily') as item
  on conflict (report_date, campaign_id) do update set
    account_id = excluded.account_id, campaign_name = excluded.campaign_name, currency = excluded.currency,
    impressions = excluded.impressions, clicks = excluded.clicks, cost = excluded.cost,
    conversions = excluded.conversions, conversion_value = excluded.conversion_value, synced_at = excluded.synced_at;

  insert into public.watermelon_google_ads_campaigns (
    campaign_id, account_id, name, status, budget_amount, budget_type, start_date, end_date,
    bidding_strategy, campaign_type, primary_status, primary_status_reasons, url_tags, synced_at
  ) values (
    v_config.campaign_id, v_config.account_id, v_campaign->>'name', v_campaign->>'status',
    (v_campaign->>'budgetAmount')::numeric, 'DAILY', (v_campaign->>'startDate')::date, (v_campaign->>'endDate')::date,
    v_campaign->>'biddingStrategy', v_campaign->>'campaignType', v_campaign->>'primaryStatus',
    v_campaign->'primaryStatusReasons', v_campaign->>'urlTags', v_now
  ) on conflict (campaign_id) do update set
    account_id = excluded.account_id, name = excluded.name, status = excluded.status, budget_amount = excluded.budget_amount,
    budget_type = excluded.budget_type, start_date = excluded.start_date, end_date = excluded.end_date,
    bidding_strategy = excluded.bidding_strategy, campaign_type = excluded.campaign_type,
    primary_status = excluded.primary_status, primary_status_reasons = excluded.primary_status_reasons,
    url_tags = excluded.url_tags, synced_at = excluded.synced_at;

  update watermelon_ads_private.report_connection set
    last_received_at = v_now, last_snapshot_at = v_snapshot, time_zone = v_zone where id;
  return jsonb_build_object('reportDate',v_until,'days',30,'receivedAt',v_now);
end;
$function$;
revoke all on function watermelon_ads_private.import_report(text,jsonb) from public;
grant execute on function watermelon_ads_private.import_report(text,jsonb) to anon, authenticated;

-- The exposed wrapper does not elevate privileges. All privileged writes and
-- token verification stay in the non-exposed schema above.
create or replace function public.watermelon_import_google_ads_report(p_token text, p_report jsonb)
returns jsonb language sql security invoker set search_path = ''
as $function$ select watermelon_ads_private.import_report(p_token,p_report); $function$;
revoke all on function public.watermelon_import_google_ads_report(text,jsonb) from public;
grant execute on function public.watermelon_import_google_ads_report(text,jsonb) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.watermelon_marketing_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'watermelon_private', 'auth'
AS $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_today date;
  v_result jsonb;
  v_status jsonb;
begin
  if v_email = '' or not exists (
    select 1 from watermelon_private.admins where email = v_email
  ) then
    raise exception 'Not authorized';
  end if;

  v_today := (now() at time zone coalesce((select time_zone from watermelon_ads_private.report_connection where id),'Europe/Lisbon'))::date;

  with ad_base as (
    select *
    from public.watermelon_google_ads_daily
    where report_date >= v_today - 29
  ),
  ad_metrics as (
    select
      coalesce(sum(cost) filter (where report_date = v_today),0) as today_cost,
      coalesce(sum(impressions) filter (where report_date = v_today),0) as today_impressions,
      coalesce(sum(clicks) filter (where report_date = v_today),0) as today_clicks,
      coalesce(sum(conversions) filter (where report_date = v_today),0) as today_conversions,
      coalesce(sum(conversion_value) filter (where report_date = v_today),0) as today_conversion_value,

      coalesce(sum(cost) filter (where report_date between v_today-6 and v_today),0) as seven_cost,
      coalesce(sum(impressions) filter (where report_date between v_today-6 and v_today),0) as seven_impressions,
      coalesce(sum(clicks) filter (where report_date between v_today-6 and v_today),0) as seven_clicks,
      coalesce(sum(conversions) filter (where report_date between v_today-6 and v_today),0) as seven_conversions,
      coalesce(sum(conversion_value) filter (where report_date between v_today-6 and v_today),0) as seven_conversion_value,

      coalesce(sum(cost) filter (where report_date between v_today-13 and v_today-7),0) as previous_seven_cost,
      coalesce(sum(clicks) filter (where report_date between v_today-13 and v_today-7),0) as previous_seven_clicks,
      coalesce(sum(conversions) filter (where report_date between v_today-13 and v_today-7),0) as previous_seven_conversions,

      coalesce(sum(cost),0) as thirty_cost,
      coalesce(sum(impressions),0) as thirty_impressions,
      coalesce(sum(clicks),0) as thirty_clicks,
      coalesce(sum(conversions),0) as thirty_conversions,
      coalesce(sum(conversion_value),0) as thirty_conversion_value,
      max(synced_at) as last_synced_at
    from ad_base
  ),
  site_base as (
    select *
    from public.watermelon_analytics_events
    where created_at >= now() - interval '30 days'
      and lower(coalesce(medium,'')) = 'cpc'
      and lower(coalesce(source,'')) in ('google','googleads','google_ads')
  ),
  site_metrics as (
    select
      count(distinct visitor_id) filter (where created_at >= now()-interval '7 days' and event_type='page_view') as seven_visitors,
      count(*) filter (where created_at >= now()-interval '7 days' and event_type<>'page_view') as seven_leads,
      count(distinct visitor_id) filter (where event_type='page_view') as thirty_visitors,
      count(*) filter (where event_type<>'page_view') as thirty_leads
    from site_base
  ),
  campaigns as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'campaignId', campaign_id,
          'name', name,
          'status', status,
          'budgetAmount', budget_amount,
          'budgetType', budget_type,
          'startDate', start_date,
          'endDate', end_date,
          'biddingStrategy', bidding_strategy,
          'campaignType', campaign_type,
          'primaryStatus', primary_status,
          'primaryStatusReasons', primary_status_reasons,
          'urlTags', url_tags,
          'syncedAt', synced_at
        )
        order by start_date desc nulls last
      ),
      '[]'::jsonb
    ) as value
    from public.watermelon_google_ads_campaigns
  )
  select jsonb_build_object(
    'today', jsonb_build_object(
      'cost', a.today_cost,
      'impressions', a.today_impressions,
      'clicks', a.today_clicks,
      'conversions', a.today_conversions,
      'conversionValue', a.today_conversion_value,
      'ctr', case when a.today_impressions > 0 then round(a.today_clicks::numeric/a.today_impressions*100,2) else 0 end,
      'cpc', case when a.today_clicks > 0 then round(a.today_cost/a.today_clicks,2) else 0 end,
      'cpl', case when a.today_conversions > 0 then round(a.today_cost/a.today_conversions,2) else 0 end,
      'roas', case when a.today_cost > 0 then round(a.today_conversion_value/a.today_cost,2) else 0 end
    ),
    'last7', jsonb_build_object(
      'cost', a.seven_cost,
      'impressions', a.seven_impressions,
      'clicks', a.seven_clicks,
      'conversions', a.seven_conversions,
      'conversionValue', a.seven_conversion_value,
      'ctr', case when a.seven_impressions > 0 then round(a.seven_clicks::numeric/a.seven_impressions*100,2) else 0 end,
      'cpc', case when a.seven_clicks > 0 then round(a.seven_cost/a.seven_clicks,2) else 0 end,
      'cpl', case when a.seven_conversions > 0 then round(a.seven_cost/a.seven_conversions,2) else 0 end,
      'roas', case when a.seven_cost > 0 then round(a.seven_conversion_value/a.seven_cost,2) else 0 end
    ),
    'previous7', jsonb_build_object(
      'cost', a.previous_seven_cost,
      'clicks', a.previous_seven_clicks,
      'conversions', a.previous_seven_conversions
    ),
    'last30', jsonb_build_object(
      'cost', a.thirty_cost,
      'impressions', a.thirty_impressions,
      'clicks', a.thirty_clicks,
      'conversions', a.thirty_conversions,
      'conversionValue', a.thirty_conversion_value,
      'ctr', case when a.thirty_impressions > 0 then round(a.thirty_clicks::numeric/a.thirty_impressions*100,2) else 0 end,
      'cpc', case when a.thirty_clicks > 0 then round(a.thirty_cost/a.thirty_clicks,2) else 0 end,
      'cpl', case when a.thirty_conversions > 0 then round(a.thirty_cost/a.thirty_conversions,2) else 0 end,
      'roas', case when a.thirty_cost > 0 then round(a.thirty_conversion_value/a.thirty_cost,2) else 0 end
    ),
    'siteAttributed', jsonb_build_object(
      'last7', jsonb_build_object('visitors', s.seven_visitors, 'leads', s.seven_leads),
      'last30', jsonb_build_object('visitors', s.thirty_visitors, 'leads', s.thirty_leads)
    ),
    'lastSyncedAt', a.last_synced_at,
    'campaigns', c.value
  )
  into v_result
  from ad_metrics a
  cross join site_metrics s
  cross join campaigns c;


  select jsonb_build_object(
    'latestReportDate', (select max(report_date) from public.watermelon_google_ads_daily where account_id='5755985719' and campaign_id='24302500298'),
    'lastReceivedAt', (select last_received_at from watermelon_ads_private.report_connection where id),
    'timeZone', coalesce((select time_zone from watermelon_ads_private.report_connection where id),'Europe/Lisbon'),
    'coverage', jsonb_build_object(
      'today', jsonb_build_object('reportedDays',(select count(*) from public.watermelon_google_ads_daily where account_id='5755985719' and campaign_id='24302500298' and report_date=v_today),'expectedDays',1),
      'last7', jsonb_build_object('reportedDays',(select count(*) from public.watermelon_google_ads_daily where account_id='5755985719' and campaign_id='24302500298' and report_date between v_today-6 and v_today),'expectedDays',7),
      'previous7', jsonb_build_object('reportedDays',(select count(*) from public.watermelon_google_ads_daily where account_id='5755985719' and campaign_id='24302500298' and report_date between v_today-13 and v_today-7),'expectedDays',7),
      'last30', jsonb_build_object('reportedDays',(select count(*) from public.watermelon_google_ads_daily where account_id='5755985719' and campaign_id='24302500298' and report_date between v_today-29 and v_today),'expectedDays',30)
    )
  ) into v_status;
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('reportStatus',v_status);

end;
$function$
