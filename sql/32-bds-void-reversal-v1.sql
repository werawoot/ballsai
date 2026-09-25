-- BallDoenSai.com BDS void reversal V1
-- Apply only after SQL29, SQL30 and SQL31. This preserves a non-negative wallet
-- while recording any unrecovered balance as an admin-visible hold.

begin;

alter table public.bds_transactions
  add column if not exists source_rating_event_id uuid references public.rating_events(id) on delete set null,
  add column if not exists reverses_transaction_id uuid references public.bds_transactions(id) on delete restrict;

create unique index if not exists bds_transactions_one_reversal_idx
  on public.bds_transactions(reverses_transaction_id)
  where reverses_transaction_id is not null;
create index if not exists bds_transactions_source_rating_event_idx
  on public.bds_transactions(source_rating_event_id)
  where source_rating_event_id is not null;

create table if not exists public.bds_reversal_holds (
  id uuid primary key default gen_random_uuid(),
  source_transaction_id uuid not null unique references public.bds_transactions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_due integer not null check (amount_due > 0 and amount_due <= 10000),
  reason text not null check (char_length(trim(reason)) between 3 and 180),
  status text not null default 'open' check (status in ('open', 'resolved', 'waived')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bds_reversal_holds_queue_idx on public.bds_reversal_holds(status, created_at desc);
create index if not exists bds_reversal_holds_user_idx on public.bds_reversal_holds(user_id, created_at desc);
alter table public.bds_reversal_holds enable row level security;
drop policy if exists bds_reversal_hold_owner_or_admin on public.bds_reversal_holds;
create policy bds_reversal_hold_owner_or_admin on public.bds_reversal_holds for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.bds_reversal_holds from anon, authenticated;
grant select on public.bds_reversal_holds to authenticated;

create or replace function public.reverse_bds_for_deleted_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.bds_transactions%rowtype;
  v_wallet public.bds_wallets%rowtype;
  v_recoverable integer;
  v_remaining integer;
  v_rows integer;
begin
  for v_tx in
    select * from public.bds_transactions
    where transaction_type = 'earn'
      and (source_rating_event_id = old.id or (reference_type = 'rating_event' and reference_id = old.id::text))
  loop
    if exists (select 1 from public.bds_transactions where reverses_transaction_id = v_tx.id) then continue; end if;
    insert into public.bds_wallets(user_id) values(v_tx.user_id) on conflict do nothing;
    select * into v_wallet from public.bds_wallets where user_id = v_tx.user_id for update;
    v_recoverable := least(v_wallet.balance, v_tx.amount);
    v_remaining := v_tx.amount - v_recoverable;
    if v_recoverable > 0 then
      insert into public.bds_transactions(user_id, event_key, transaction_type, amount, description, reference_type, reference_id, created_by, reverses_transaction_id)
      values(v_tx.user_id, 'reversal:' || v_tx.id::text, 'adjustment', -v_recoverable,
        'BDS reversal for voided match result', 'rating_event_reversal', old.id::text, auth.uid(), v_tx.id)
      on conflict(user_id, event_key) do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 1 then
      update public.bds_wallets set balance = balance - v_recoverable, updated_at = now() where user_id = v_tx.user_id;
      end if;
    end if;
    if v_remaining > 0 then
      insert into public.bds_reversal_holds(source_transaction_id, user_id, amount_due, reason)
      values(v_tx.id, v_tx.user_id, v_remaining, 'Voided match reward exceeded available BDS balance')
      on conflict(source_transaction_id) do nothing;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists rating_event_bds_void_reversal on public.rating_events;
create trigger rating_event_bds_void_reversal
before delete on public.rating_events
for each row execute function public.reverse_bds_for_deleted_rating_event();

commit;
