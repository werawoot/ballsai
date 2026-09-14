-- 26-organizations-v1.sql
-- Academy / Club v1. Separate from tournament-scoped teams.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 140),
  kind text not null check (kind in ('academy', 'club', 'school')),
  province text not null check (char_length(btrim(province)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 1200),
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'coach', 'athlete')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id, status);
create index if not exists organization_members_org_idx on public.organization_members(organization_id, status);

create table if not exists public.organization_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  age_group text not null default '' check (char_length(age_group) <= 30),
  sport text not null default 'football' check (sport in ('football', 'futsal')),
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index if not exists organization_teams_org_idx on public.organization_teams(organization_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_teams enable row level security;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = p_organization_id and user_id = auth.uid() and status = 'accepted');
$$;
revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;

drop policy if exists organizations_members_select on public.organizations;
create policy organizations_members_select on public.organizations for select to authenticated using (public.is_organization_member(id) or public.is_admin());
drop policy if exists organization_members_participants_select on public.organization_members;
create policy organization_members_participants_select on public.organization_members for select to authenticated using (user_id = auth.uid() or public.is_organization_member(organization_id) or public.is_admin());
drop policy if exists organization_teams_members_select on public.organization_teams;
create policy organization_teams_members_select on public.organization_teams for select to authenticated using (public.is_organization_member(organization_id) or public.is_admin());

create or replace function public.create_organization_safely(p_name text, p_kind text, p_province text, p_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.organizations(owner_id,name,kind,province,description) values(auth.uid(),btrim(p_name),p_kind,btrim(p_province),left(coalesce(p_description,''),1200)) returning id into v_id;
  insert into public.organization_members(organization_id,user_id,role,status,invited_by,responded_at) values(v_id,auth.uid(),'owner','accepted',auth.uid(),now());
  return v_id;
end;
$$;

create or replace function public.invite_organization_member_safely(p_organization_id uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_id uuid;
begin
  if p_role not in ('admin','coach','athlete') then raise exception 'INVALID_MEMBER_ROLE' using errcode = '22023'; end if;
  if not exists (select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin') and status='accepted') and not public.is_admin() then raise exception 'ORG_ADMIN_REQUIRED' using errcode='42501'; end if;
  select id into v_user_id from public.profiles where lower(email)=lower(btrim(p_email));
  if v_user_id is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023'; end if;
  insert into public.organization_members(organization_id,user_id,role,status,invited_by) values(p_organization_id,v_user_id,p_role,'pending',auth.uid()) on conflict(organization_id,user_id) do update set role=excluded.role,status='pending',invited_by=auth.uid(),invited_at=now(),responded_at=null returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_organization_invite_safely(p_member_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('accepted','declined') then raise exception 'INVALID_INVITE_STATUS' using errcode='22023'; end if;
  update public.organization_members set status=p_status,responded_at=now() where id=p_member_id and user_id=auth.uid() and status='pending';
  if not found then raise exception 'INVITE_NOT_PENDING' using errcode='22023'; end if;
end;
$$;

create or replace function public.create_organization_team_safely(p_organization_id uuid,p_name text,p_age_group text default '',p_sport text default 'football')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','coach') and status='accepted') and not public.is_admin() then raise exception 'ORG_TEAM_MANAGER_REQUIRED' using errcode='42501'; end if;
  insert into public.organization_teams(organization_id,name,age_group,sport) values(p_organization_id,btrim(p_name),left(coalesce(p_age_group,''),30),p_sport) returning id into v_id; return v_id;
end;
$$;

revoke all on function public.create_organization_safely(text,text,text,text) from public;
revoke all on function public.invite_organization_member_safely(uuid,text,text) from public;
revoke all on function public.respond_organization_invite_safely(uuid,text) from public;
revoke all on function public.create_organization_team_safely(uuid,text,text,text) from public;
grant execute on function public.create_organization_safely(text,text,text,text) to authenticated;
grant execute on function public.invite_organization_member_safely(uuid,text,text) to authenticated;
grant execute on function public.respond_organization_invite_safely(uuid,text) to authenticated;
grant execute on function public.create_organization_team_safely(uuid,text,text,text) to authenticated;

commit;
