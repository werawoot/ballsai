-- Postcheck for SQL107, the project you are on. It calls my_profile_home as a signed-in user with no
-- rows inside a transaction it rolls back: nothing is written. Expected on both: the notice
-- "my_profile_home ok"; then profile_home_fp the same on Staging and Production, profile_home_definer
-- false, callable_signed_out false, callable_by_users true.
-- No backslash or asterisk, so it survives copy and paste from chat.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform public.my_profile_home('football', '2026'); raise notice 'my_profile_home ok'; end $$;
rollback;
select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.my_profile_home(text,text)')) as profile_home_fp,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.my_profile_home(text,text)')) as profile_home_definer,
       has_function_privilege('anon', 'public.my_profile_home(text, text)', 'execute') as callable_signed_out,
       has_function_privilege('authenticated', 'public.my_profile_home(text, text)', 'execute') as callable_by_users;
