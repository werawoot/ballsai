-- Read-only precheck for SQL84, same project.
-- Expected: beta_functions 0 to 6 (Staging 18 Oct 2026: 6); dependents 0. app_remove is true
-- once SQL83 is applied, false before; SQL84 does not need it. The three still_beta values
-- only report whether sql/24 of the beta branch still owns those shared names (T03); SQL84
-- does not touch them.
-- No backslash or asterisk, so it survives copy and paste from chat.

with beta as (
  select to_regprocedure(s) as fn
  from unnest(array[
    'public.remove_team_member(uuid,text)',
    'public.request_team_membership(uuid)',
    'public.approve_team_request(uuid)',
    'public.decline_team_request(uuid)',
    'public.list_joinable_teams()',
    'public.list_my_team_labels()']) as s
), fp as (
  select p.oid::regprocedure::text as signature,
         left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8) as fingerprint
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select (select count(fn) from beta) as beta_functions,
       (select count(1) from pg_depend d join beta b on d.refobjid = b.fn
         where d.refclassid = 'pg_proc'::regclass and d.deptype = 'n') as dependents,
       to_regprocedure('public.remove_team_member(uuid,text,text)') is not null as app_remove,
       exists (select 1 from fp where fingerprint = '394cd26f' and signature like 'invite_team_member(%') as invite_still_beta,
       exists (select 1 from fp where fingerprint = 'fbe5a9bd' and signature like 'respond_team_invite(%') as respond_still_beta,
       exists (select 1 from fp where fingerprint = 'ea3619df' and signature like 'record_match_result_safely(%') as record_still_beta;
