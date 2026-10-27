-- Read-only precheck for SQL94, same project.
-- Expected: deps true; fn_exists false; rank_types shows pts integer-like and season text
-- (if season is not text the main file stops at create function and changes nothing);
-- public_profiles and rated as they are today.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.public_athlete_directory') is not null
       and to_regclass('public.player_ranks_player_sport_season_idx') is not null
       and to_regclass('public.player_ranks_public_ranking_idx') is not null
       and to_regclass('public.athlete_profiles_directory_page_idx') is not null as deps,
       to_regprocedure('public.public_scout_athletes(text,text,text,text,text,integer,integer,integer)') is not null as fn_exists,
       (select string_agg(column_name || ':' || data_type, ', ' order by column_name)
          from information_schema.columns
         where table_schema = 'public' and table_name = 'player_ranks'
           and column_name in ('pts', 'season', 'sport', 'player_id')) as rank_types,
       (select count(1) from public.athlete_profiles where is_public) as public_profiles,
       (select count(1) from public.player_ranks where player_id is not null) as rated;
