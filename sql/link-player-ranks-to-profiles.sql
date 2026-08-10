-- Link ranking records to real BALLSAI accounts.
-- Safe to run more than once in the Supabase SQL editor.

begin;

alter table public.player_ranks
add column if not exists player_id uuid;

-- Preserve legacy ranking rows, but clear invalid account references before
-- enforcing the foreign key. Admin can link these rows from the app later.
update public.player_ranks as ranks
set player_id = null
where ranks.player_id is not null
  and not exists (
    select 1
    from public.profiles as profiles
    where profiles.id = ranks.player_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_ranks_player_id_profiles_fkey'
      and conrelid = 'public.player_ranks'::regclass
  ) then
    alter table public.player_ranks
    add constraint player_ranks_player_id_profiles_fkey
    foreign key (player_id)
    references public.profiles(id)
    on delete set null;
  end if;
end $$;

create unique index if not exists player_ranks_player_sport_season_idx
on public.player_ranks (player_id, sport, season)
where player_id is not null;

commit;
