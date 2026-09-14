-- BallDoenSai.com BDS Wallet V1. Internal reward credits only: no crypto,
-- blockchain, conversion, transfer, cash value, or exchange.
begin;
create table if not exists public.bds_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  total_earned integer not null default 0 check (total_earned >= 0),
  total_spent integer not null default 0 check (total_spent >= 0),
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.bds_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null, transaction_type text not null check (transaction_type in ('earn','spend','adjustment')),
  amount integer not null check (amount <> 0 and amount between -10000 and 10000),
  description text not null check (char_length(description) between 1 and 180),
  reference_type text, reference_id text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), unique(user_id, event_key)
);
create index if not exists bds_transactions_user_created_idx on public.bds_transactions(user_id, created_at desc);
alter table public.bds_wallets enable row level security; alter table public.bds_transactions enable row level security;
create policy "bds_wallet_owner_or_admin" on public.bds_wallets for select to authenticated using (user_id=(select auth.uid()) or public.is_admin());
create policy "bds_transaction_owner_or_admin" on public.bds_transactions for select to authenticated using (user_id=(select auth.uid()) or public.is_admin());
revoke all on public.bds_wallets, public.bds_transactions from anon, authenticated;
grant select on public.bds_wallets, public.bds_transactions to authenticated;
create or replace function public.award_bds_points_safely(p_user_id uuid,p_event_key text,p_amount integer,p_description text,p_reference_type text default null,p_reference_id text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_amount <= 0 or p_amount > 10000 or char_length(trim(coalesce(p_event_key,''))) not between 3 and 120 or char_length(trim(coalesce(p_description,''))) not between 1 and 180 then raise exception 'INVALID_BDS_AWARD' using errcode='22023'; end if;
 insert into public.bds_wallets(user_id) values(p_user_id) on conflict do nothing;
 insert into public.bds_transactions(user_id,event_key,transaction_type,amount,description,reference_type,reference_id,created_by) values(p_user_id,trim(p_event_key),'earn',p_amount,trim(p_description),nullif(trim(p_reference_type),''),nullif(trim(p_reference_id),''),auth.uid()) on conflict(user_id,event_key) do nothing;
 if found then update public.bds_wallets set balance=balance+p_amount,total_earned=total_earned+p_amount,updated_at=now() where user_id=p_user_id; end if;
end; $$;
revoke all on function public.award_bds_points_safely(uuid,text,integer,text,text,text) from public;
grant execute on function public.award_bds_points_safely(uuid,text,integer,text,text,text) to authenticated;
commit;
