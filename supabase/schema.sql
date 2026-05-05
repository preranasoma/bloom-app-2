-- ============================================================
-- BLOOM PLANT TRACKER — Supabase Schema
-- Paste this WHOLE file into Supabase SQL Editor and click "Run"
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────

-- Profiles extend Supabase's built-in auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  coins int not null default 80,
  created_at timestamptz default now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  nickname text not null,
  water_level int not null default 60 check (water_level between 0 and 100),
  growth int not null default 5 check (growth between 0 and 100),
  pot text not null default 'pink',
  planted_at timestamptz default now(),
  last_watered timestamptz default now()
);
create index plants_user_idx on public.plants(user_id);

-- Generic inventory — used by plant game AND map game
create table public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, item_id)
);

-- Quests catalog (server-trusted source of truth — clients can't edit goals/rewards)
create table public.quests (
  id text primary key,
  name text not null,
  description text not null,
  track text not null,
  goal int not null,
  reward int not null
);

insert into public.quests (id, name, description, track, goal, reward) values
  ('login',    'Daily Visitor',  'Visit your garden today', 'login',     1, 20),
  ('water_3',  'Hydration Hero', 'Water 3 plants',          'water',     3, 50),
  ('fert_1',   'Growth Spurt',   'Use fertilizer once',     'fertilize', 1, 30),
  ('shop_1',   'Garden Shopper', 'Buy something',           'shop',      1, 25),
  ('plants_5', 'Green Thumb',    'Have 5 plants total',     'plants',    5, 100);

-- Daily quest progress
create table public.quest_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  track text not null,
  value int not null default 0,
  primary key (user_id, date, track)
);

-- Claimed (so users can't double-claim)
create table public.claimed_quests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  quest_id text not null references public.quests(id),
  primary key (user_id, date, quest_id)
);

-- Trades for social features
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  plant_id uuid references public.plants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now()
);
create index trades_inbox_idx on public.trades(to_user) where status = 'pending';

-- Cross-game audit log (also useful for "you got X from your teammate's map game!" toasts)
create table public.transactions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,        -- 'plant_game' | 'map_game'
  kind text not null,          -- 'reward' | 'purchase' | 'trade' | 'delivery'
  coin_delta int not null default 0,
  meta jsonb,
  created_at timestamptz default now()
);
create index transactions_user_idx on public.transactions(user_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 2. AUTO-CREATE PROFILE + STARTER GIFTS ON SIGNUP
-- ────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, coins)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'gardener_' || substr(new.id::text, 1, 6)),
    80
  );
  insert into public.plants (user_id, type, nickname, water_level, growth, pot)
    values (new.id, 'sprout', 'Mochi', 70, 20, 'pink');
  insert into public.inventory (user_id, item_id, count) values
    (new.id, 'water', 2),
    (new.id, 'fertilizer', 1);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 3. RPCs (server-validated game actions)
-- ────────────────────────────────────────────────────────────

-- Register daily login (no-op if already done today)
create or replace function public.register_daily_login()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.quest_progress (user_id, date, track, value)
    values (v_uid, current_date, 'login', 1)
    on conflict (user_id, date, track) do nothing;
end; $$;

-- Bump a quest counter (water, fertilize, shop)
create or replace function public.bump_quest(p_track text, p_amount int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.quest_progress (user_id, date, track, value)
    values (v_uid, current_date, p_track, p_amount)
    on conflict (user_id, date, track)
    do update set value = quest_progress.value + p_amount;
end; $$;

-- Atomic claim: validates progress + awards coins + logs txn
create or replace function public.claim_quest(p_quest_id text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_quest record;
  v_progress int;
  v_new_coins int;
  v_plant_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_quest from public.quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;

  if exists (select 1 from public.claimed_quests
             where user_id = v_uid and date = v_today and quest_id = p_quest_id) then
    raise exception 'already claimed';
  end if;

  -- "plants" quest reads live count, others read quest_progress
  if v_quest.track = 'plants' then
    select count(*) into v_plant_count from public.plants where user_id = v_uid;
    v_progress := v_plant_count;
  else
    select coalesce(value, 0) into v_progress
      from public.quest_progress
      where user_id = v_uid and date = v_today and track = v_quest.track;
    v_progress := coalesce(v_progress, 0);
  end if;

  if v_progress < v_quest.goal then raise exception 'goal not met'; end if;

  insert into public.claimed_quests (user_id, date, quest_id)
    values (v_uid, v_today, p_quest_id);

  update public.profiles set coins = coins + v_quest.reward
    where id = v_uid returning coins into v_new_coins;

  insert into public.transactions (user_id, source, kind, coin_delta, meta)
    values (v_uid, 'plant_game', 'reward', v_quest.reward,
            jsonb_build_object('quest_id', p_quest_id));

  return v_new_coins;
end; $$;

-- Atomic purchase: validates coins + applies effect + logs txn
-- Returns { coins, plant_id? } so client can update UI
create or replace function public.purchase_item(
  p_category text,
  p_item_id text,
  p_price int,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_coins int;
  v_new_coins int;
  v_plant_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_price < 0 then raise exception 'invalid price'; end if;

  select coins into v_coins from public.profiles where id = v_uid for update;
  if v_coins < p_price then raise exception 'insufficient coins'; end if;

  update public.profiles set coins = coins - p_price
    where id = v_uid returning coins into v_new_coins;

  if p_category = 'Supplies' then
    if p_item_id = 'rain_cloud' then
      update public.plants set water_level = 100,
        growth = least(100, growth + 5)
        where user_id = v_uid;
    else
      insert into public.inventory (user_id, item_id, count)
        values (v_uid, p_item_id, 1)
        on conflict (user_id, item_id)
        do update set count = inventory.count + 1;
    end if;
  elsif p_category = 'Pots' then
    insert into public.inventory (user_id, item_id, count)
      values (v_uid, 'pot_' || coalesce(p_payload->>'color', 'pink'), 1)
      on conflict (user_id, item_id)
      do update set count = inventory.count + 1;
  elsif p_category = 'Seeds' then
    insert into public.plants (user_id, type, nickname, water_level, growth, pot)
      values (
        v_uid,
        coalesce(p_payload->>'plant', p_item_id),
        coalesce(p_payload->>'nickname', initcap(coalesce(p_payload->>'plant', p_item_id))),
        60, 5,
        coalesce(p_payload->>'pot', 'pink')
      )
      returning id into v_plant_id;
  end if;

  insert into public.quest_progress (user_id, date, track, value)
    values (v_uid, current_date, 'shop', 1)
    on conflict (user_id, date, track)
    do update set value = quest_progress.value + 1;

  insert into public.transactions (user_id, source, kind, coin_delta, meta)
    values (v_uid, 'plant_game', 'purchase', -p_price,
            jsonb_build_object('category', p_category, 'item_id', p_item_id));

  return jsonb_build_object('coins', v_new_coins, 'plant_id', v_plant_id);
end; $$;

-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
create policy "profiles read"        on public.profiles for select using (true);
create policy "profiles update self" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert self" on public.profiles for insert with check (auth.uid() = id);

alter table public.plants enable row level security;
create policy "plants own" on public.plants for all using (auth.uid() = user_id);

alter table public.inventory enable row level security;
create policy "inventory own" on public.inventory for all using (auth.uid() = user_id);

alter table public.quest_progress enable row level security;
create policy "qp own" on public.quest_progress for all using (auth.uid() = user_id);

alter table public.claimed_quests enable row level security;
create policy "cq own" on public.claimed_quests for all using (auth.uid() = user_id);

alter table public.quests enable row level security;
create policy "quests read" on public.quests for select using (true);

alter table public.trades enable row level security;
create policy "trades visible to parties" on public.trades for select
  using (auth.uid() = from_user or auth.uid() = to_user);
create policy "trades create as sender" on public.trades for insert
  with check (auth.uid() = from_user);
create policy "trades update as recipient" on public.trades for update
  using (auth.uid() = to_user);

alter table public.transactions enable row level security;
create policy "txn own" on public.transactions for select using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 5. REALTIME (so coin sync between games works)
-- ────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.inventory;
