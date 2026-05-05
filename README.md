# 🌷 bloom — plant tracker

A gamified plant collection game with daily quests, a shop, a leaderboard, and a placeholder tab for your teammate's map game. Built with **React + Vite + Supabase + Tailwind**, deployable to **Vercel** in about 30 minutes.

---

## What you're getting

```
bloom-app/
├── README.md                ← you are here
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .env.example             ← copy to .env.local
├── .gitignore
├── supabase/
│   └── schema.sql           ← paste into Supabase SQL editor
└── src/
    ├── main.jsx             ← Vite entry point
    ├── App.jsx              ← the entire app (auth + game)
    ├── supabase.js          ← Supabase client + helpers
    └── index.css            ← Tailwind + Google Fonts
```

---

## Step 1 — Create the Supabase project (~5 min)

1. Go to **supabase.com** and create a free account / log in.
2. Click **New project**. Pick a name, set a strong DB password (save it), choose the region closest to you, and click **Create new project**. Wait ~2 min for it to provision.
3. Once it's ready, in the left sidebar click **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` in this repo, **copy the entire file**, paste it into the SQL editor, and click **Run**. You should see "Success. No rows returned." That just created 8 tables, 4 stored procedures, RLS policies, a signup trigger, and turned on realtime.
5. Go to **Authentication → Providers** and make sure **Email** is enabled. For a hackathon, also turn off **Confirm email** under Email settings — otherwise users have to click an email link before they can play. (For production, leave it on.)
6. Go to **Settings → API**. Copy two values:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public** key (a long `eyJ...` JWT)

You'll paste these in step 2.

---

## Step 2 — Run it locally (~5 min)

```bash
cd bloom-app
npm install
cp .env.example .env.local
# open .env.local and paste the URL + anon key from step 1.6
npm run dev
```

Open `http://localhost:5173`. You should see the login screen. Hit "new here? plant a seed →", create an account, and your starter plant Mochi should appear in the garden.

If you see "Missing VITE_SUPABASE_URL" in the console, your `.env.local` isn't being read — make sure you restarted `npm run dev` after editing it.

---

## Step 3 — Deploy to Vercel (~10 min)

1. **Push to GitHub.** Create a new GitHub repo and push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/bloom.git
   git push -u origin main
   ```
2. Go to **vercel.com** → **Add New → Project** → import your GitHub repo. Vercel auto-detects Vite; just click **Deploy**.
3. The first build will fail because there are no env vars. Go to **Project → Settings → Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon public key
4. Hit **Redeploy**. ~1 min later you'll have a live URL like `bloom-xyz.vercel.app`.
5. Last thing: in Supabase **Authentication → URL Configuration**, add your Vercel URL to the **Site URL** field so auth redirects work in production.

Done. That's a live, multiplayer plant tracker.

---

## How the game logic works

**Auth gate.** `App.jsx` watches `supabase.auth` for sessions. No session → `<AuthScreen />`. Session → `<PlantTracker />`. Sign-up triggers a Postgres function that auto-creates a profile, a starter plant (Mochi 🌱), and starter inventory (2 water + 1 fertilizer).

**State loading.** On mount, `loadGameState(userId)` makes 5 parallel queries (profile, plants, inventory, today's quest progress, claimed quests) and reshapes them into a single React state object. Quest progress for "plants" is computed live from `plants.length`, not stored.

**Optimistic updates.** Watering a plant updates React state immediately, then fires the DB writes in the background. If a write fails, you get a "save failed" toast — for a hackathon, that's good enough; full rollback is overkill.

**Anti-cheat.** Coin-spending and coin-earning go through Postgres functions (`claim_quest`, `purchase_item`), not direct table updates. The client says "I want to claim quest X"; the server validates progress, checks for double-claims, deducts/awards atomically, and logs to `transactions`. Even if a user opens devtools and tries `supabase.from('profiles').update({ coins: 9999 })`, RLS will let it through *for their own row* — but the leaderboard would be obviously fake. If you care about that for judging, you can add a `before update` trigger on `profiles` that rejects coin changes not coming from the trusted RPCs. Skip for hackathon.

**Realtime.** Two subscriptions in `PlantTracker`:
- `profiles` UPDATE filtered to the current user → keeps the coin pill in sync when the map game adds coins.
- `transactions` INSERT filtered to the current user → fires a "+30 from map game! 🚂" toast when something arrives from the other game.

The leaderboard component has its own subscription that reloads the top 10 whenever any profile updates.

---

## How your teammate's map game fits in

Both games share **one Supabase project**. Your teammate adds the Supabase JS client to their app with the *same* `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and they're already authenticated against the same user table. No duplicate logins.

**To deposit coins into the plant game** when a delivery completes, they call:

```js
// In the map game
await supabase.rpc('grant_coins_from_map', {
  p_amount: 30,
  p_meta: { delivery_id: '...' }
});
```

You'll need to add that RPC. Quick template — paste into Supabase SQL editor:

```sql
create or replace function public.grant_coins_from_map(p_amount int, p_meta jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_new int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'invalid amount'; end if;
  update public.profiles set coins = coins + p_amount where id = v_uid returning coins into v_new;
  insert into public.transactions (user_id, source, kind, coin_delta, meta)
    values (v_uid, 'map_game', 'delivery', p_amount, p_meta);
  return v_new;
end; $$;
```

The plant game's realtime subscription will pick up the profile update and the transaction insert automatically — the coin pill ticks up, a toast pops, no refresh needed.

**To deposit items into the shared inventory** (e.g., a rare seed earned from a delivery):

```js
await supabase.from('inventory').upsert({
  user_id: userId,
  item_id: 'rare_cherry_seed',
  count: 1,
}, { onConflict: 'user_id,item_id' });
```

**Where to drop the map game UI.** In `App.jsx` find `<MapTab />` (the very last component) and replace its body with your teammate's component. Or have them export a `<MapGame />` from their own file and just import it.

**Things to coordinate before either of you writes code:**
1. **Item naming convention.** Pick a prefix scheme (e.g., `seed_*`, `pot_*`, `cargo_*`) so the two games don't collide on `item_id`.
2. **Whether map game has its own currency.** If yes, add a `gems` column to `profiles`. If no (probably the simpler path for a hackathon), share `coins`.
3. **What earns coins in each game.** If both games print money freely, the leaderboard becomes meaningless. Maybe the map game's "earnings" cap per day, or maybe the map game spends coins to buy cargo and earns more on delivery.

---

## What's next (post-hackathon ideas)

- **Trading UI** — the `trades` table and RLS are already set up. Just needs a "send trade" form and an inbox.
- **Plant decay** — a cron job (Supabase has scheduled functions) that decreases `water_level` daily. Adds urgency.
- **Friend system** — a `friendships` table with mutual confirmation; filter the leaderboard to friends only.
- **Achievements** — a separate `achievements` table for permanent unlocks (vs. daily quests).
- **Stripe** — sell premium pots or cosmetic-only plants. Supabase has a Stripe integration.
