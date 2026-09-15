-- BDS rewards from verified rating events only. Apply after 29-bds-wallet-v1.sql.
begin;
create or replace function public.award_bds_from_rating_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_total integer;
begin
 select player_id into v_user from public.player_ratings where id=new.player_rating_id;
 if v_user is null then return new; end if;
 insert into public.bds_wallets(user_id) values(v_user) on conflict do nothing;
 with awards(event_key, amount, description) as (
   values ('match:'||new.id::text,10,'รางวัลลงแข่งขัน'),
          ('win:'||new.id::text,case when new.result='win' then 20 else 0 end,'รางวัลชนะการแข่งขัน'),
          ('goals:'||new.id::text,greatest(0,new.goals)*5,'รางวัลทำประตู'),
          ('assists:'||new.id::text,greatest(0,new.assists)*3,'รางวัลแอสซิสต์'),
          ('clean-sheet:'||new.id::text,case when new.clean_sheet then 10 else 0 end,'รางวัลคลีนชีต'),
          ('mvp:'||new.id::text,case when new.mvp then 50 else 0 end,'รางวัล MVP')
 ), inserted as (
   insert into public.bds_transactions(user_id,event_key,transaction_type,amount,description,reference_type,reference_id)
   select v_user,event_key,'earn',amount,description,'rating_event',new.id::text from awards where amount>0
   on conflict(user_id,event_key) do nothing returning amount
 ) select coalesce(sum(amount),0)::integer into v_total from inserted;
 if v_total>0 then update public.bds_wallets set balance=balance+v_total,total_earned=total_earned+v_total,updated_at=now() where user_id=v_user; end if;
 return new;
end; $$;
drop trigger if exists rating_event_award_bds on public.rating_events;
create trigger rating_event_award_bds after insert on public.rating_events for each row execute function public.award_bds_from_rating_event();
revoke all on function public.award_bds_from_rating_event() from public;
commit;
