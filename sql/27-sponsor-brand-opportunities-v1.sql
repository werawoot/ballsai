-- 27-sponsor-brand-opportunities-v1.sql
-- Sponsor / Brand v1: public opportunities with athlete-initiated interest only.
-- Apply after 26-organizations-v1.sql to project hivedzrwrrcnjrlirhtv only.

begin;

alter table public.profiles
  drop constraint if exists profiles_onboarding_persona_check;
alter table public.profiles
  add constraint profiles_onboarding_persona_check
  check (onboarding_persona is null or onboarding_persona = any (array[
    'athlete'::text, 'guardian'::text, 'coach_organizer'::text, 'venue_owner'::text, 'sponsor_brand'::text
  ]));

alter table public.profiles
  drop constraint if exists profiles_onboarding_goal_check;
alter table public.profiles
  add constraint profiles_onboarding_goal_check
  check (onboarding_goal is null or onboarding_goal = any (array[
    'player_card'::text, 'find_competitions'::text, 'follow_athlete'::text,
    'discover_talent'::text, 'manage_venue'::text, 'support_athletes'::text
  ]));

create table if not exists public.sponsor_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  brand_name text not null check (char_length(btrim(brand_name)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 1200),
  website_url text not null default '' check (char_length(website_url) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsorship_opportunities (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsor_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 4 and 160),
  description text not null check (char_length(description) between 20 and 2400),
  sport text not null default 'football' check (sport in ('football', 'futsal')),
  province text not null default '' check (char_length(province) <= 100),
  age_note text not null default '' check (char_length(age_note) <= 140),
  benefit_note text not null default '' check (char_length(benefit_note) <= 600),
  deadline_at timestamptz,
  status text not null default 'open' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sponsorship_opportunities_public_idx
  on public.sponsorship_opportunities (status, created_at desc) where status = 'open';
create index if not exists sponsorship_opportunities_sponsor_idx
  on public.sponsorship_opportunities (sponsor_id, created_at desc);

create table if not exists public.sponsorship_interests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.sponsorship_opportunities(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  message text not null default '' check (char_length(message) <= 600),
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'not_selected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id, athlete_id)
);
create index if not exists sponsorship_interests_opportunity_idx
  on public.sponsorship_interests (opportunity_id, created_at desc);
create index if not exists sponsorship_interests_athlete_idx
  on public.sponsorship_interests (athlete_id, created_at desc);

alter table public.sponsor_profiles enable row level security;
alter table public.sponsorship_opportunities enable row level security;
alter table public.sponsorship_interests enable row level security;

-- This contains public brand information only: it deliberately has no contact-person,
-- email or phone column. Keeping this non-recursive permits public opportunity joins.
drop policy if exists sponsor_profiles_owner_or_public_opportunity_select on public.sponsor_profiles;
create policy sponsor_profiles_owner_or_public_opportunity_select on public.sponsor_profiles
for select to authenticated, anon using (true);

drop policy if exists sponsorship_opportunities_open_or_owner_select on public.sponsorship_opportunities;
create policy sponsorship_opportunities_open_or_owner_select on public.sponsorship_opportunities
for select to authenticated, anon using (
  status = 'open' or (select public.is_admin()) or exists (
    select 1 from public.sponsor_profiles s where s.id = sponsorship_opportunities.sponsor_id and s.owner_id = (select auth.uid())
  )
);

drop policy if exists sponsorship_interests_participant_select on public.sponsorship_interests;
create policy sponsorship_interests_participant_select on public.sponsorship_interests
for select to authenticated using (
  athlete_id = (select auth.uid()) or (select public.is_admin()) or exists (
    select 1 from public.sponsorship_opportunities o join public.sponsor_profiles s on s.id = o.sponsor_id
    where o.id = sponsorship_interests.opportunity_id and s.owner_id = (select auth.uid())
  )
);

create or replace function public.create_sponsor_profile_safely(p_brand_name text, p_description text default '', p_website_url text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.sponsor_profiles(owner_id, brand_name, description, website_url)
  values (auth.uid(), btrim(p_brand_name), left(coalesce(p_description, ''), 1200), left(coalesce(p_website_url, ''), 300))
  on conflict(owner_id) do update set brand_name = excluded.brand_name, description = excluded.description, website_url = excluded.website_url, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_sponsorship_opportunity_safely(
  p_title text, p_description text, p_sport text default 'football', p_province text default '',
  p_age_note text default '', p_benefit_note text default '', p_deadline_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sponsor_id uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select id into v_sponsor_id from public.sponsor_profiles where owner_id = auth.uid();
  if v_sponsor_id is null then raise exception 'SPONSOR_PROFILE_REQUIRED' using errcode = '22023'; end if;
  if p_sport not in ('football', 'futsal') then raise exception 'INVALID_SPORT' using errcode = '22023'; end if;
  insert into public.sponsorship_opportunities(sponsor_id,title,description,sport,province,age_note,benefit_note,deadline_at,status)
  values(v_sponsor_id,btrim(p_title),left(p_description,2400),p_sport,left(btrim(coalesce(p_province,'')),100),left(coalesce(p_age_note,''),140),left(coalesce(p_benefit_note,''),600),p_deadline_at,'open')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.express_sponsorship_interest_safely(p_opportunity_id uuid, p_message text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.athlete_profiles where user_id = auth.uid() and is_public) then
    raise exception 'PUBLIC_ATHLETE_PROFILE_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sponsorship_opportunities where id = p_opportunity_id and status = 'open' and (deadline_at is null or deadline_at > now())) then
    raise exception 'OPPORTUNITY_NOT_OPEN' using errcode = '22023';
  end if;
  insert into public.sponsorship_interests(opportunity_id,athlete_id,message)
  values(p_opportunity_id,auth.uid(),left(coalesce(p_message,''),600))
  on conflict(opportunity_id,athlete_id) do update set message = excluded.message, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_sponsor_profile_safely(text,text,text) from public;
revoke all on function public.create_sponsorship_opportunity_safely(text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.express_sponsorship_interest_safely(uuid,text) from public;
grant execute on function public.create_sponsor_profile_safely(text,text,text) to authenticated;
grant execute on function public.create_sponsorship_opportunity_safely(text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.express_sponsorship_interest_safely(uuid,text) to authenticated;

commit;
