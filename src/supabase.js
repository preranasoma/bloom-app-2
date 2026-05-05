import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, key);

// Helpers ----------------------------------------------------

export const today = () => new Date().toISOString().slice(0, 10);

// Reshape DB rows into the React state shape
export function dbPlantToUi(p) {
  return {
    id: p.id,
    type: p.type,
    nickname: p.nickname,
    waterLevel: p.water_level,
    growth: p.growth,
    pot: p.pot,
    planted: p.planted_at,
  };
}

export function rowsToInventory(rows) {
  return Object.fromEntries((rows || []).map(r => [r.item_id, r.count]));
}

export function rowsToProgress(rows) {
  const out = { login: 0, water: 0, fertilize: 0, shop: 0, plants: 0 };
  for (const r of rows || []) out[r.track] = r.value;
  return out;
}

// Load complete game state for a user
export async function loadGameState(userId) {
  const t = today();
  const [profile, plants, inv, qp, claimed] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('plants').select('*').eq('user_id', userId).order('planted_at'),
    supabase.from('inventory').select('*').eq('user_id', userId),
    supabase.from('quest_progress').select('*').eq('user_id', userId).eq('date', t),
    supabase.from('claimed_quests').select('*').eq('user_id', userId).eq('date', t),
  ]);

  if (profile.error) throw profile.error;

  // Register the visit (idempotent)
  try { await supabase.rpc('register_daily_login'); } catch {}

  const progress = rowsToProgress(qp.data);
  if (!progress.login) progress.login = 1; // reflect register_daily_login locally
  progress.plants = (plants.data || []).length;

  return {
    userId,
    username: profile.data.username,
    coins: profile.data.coins,
    plants: (plants.data || []).map(dbPlantToUi),
    inventory: rowsToInventory(inv.data),
    quests: {
      date: t,
      progress,
      claimed: (claimed.data || []).map(c => c.quest_id),
    },
  };
}
