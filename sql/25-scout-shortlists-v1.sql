-- 25-scout-shortlists-v1.sql
-- Scout v1: a private, consent-respecting talent shortlist.
-- Apply after 24-venue-owner-onboarding-v1.sql to project hivedzrwrrcnjrlirhtv only.

begin;

create table if not exists public.scout_shortlists (
  id uuid primary key default gen_random_uuid(),
  scout_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  note text not null default '' check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scout_id, athlete_id)
);

create index if not exists scout_shortlists_scout_created_idx
  on public.scout_shortlists(scout_id, created_at desc);
create index if not exists scout_shortlists_athlete_idx
  on public.scout_shortlists(athlete_id);

alter table public.scout_shortlists enable row level security;

drop policy if exists scout_shortlists_owner_select on public.scout_shortlists;
create policy scout_shortlists_owner_select on public.scout_shortlists
for select to authenticated using (scout_id = (select auth.uid()));

create or replace function public.add_scout_shortlist_safely(p_athlete_id uuid, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.athlete_profiles where user_id = p_athlete_id and is_public) then
    raise exception 'ATHLETE_NOT_DISCOVERABLE' using errcode = '22023';
  end if;
  insert into public.scout_shortlists (scout_id, athlete_id, note)
  values (auth.uid(), p_athlete_id, left(coalesce(p_note, ''), 800))
  on conflict (scout_id, athlete_id) do update set note = excluded.note, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_scout_shortlist_safely(p_athlete_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.scout_shortlists where scout_id = auth.uid() and athlete_id = p_athlete_id;
end;
$$;

revoke all on function public.add_scout_shortlist_safely(uuid, text) from public;
revoke all on function public.remove_scout_shortlist_safely(uuid) from public;
grant execute on function public.add_scout_shortlist_safely(uuid, text) to authenticated;
grant execute on function public.remove_scout_shortlist_safely(uuid) to authenticated;

commit;
