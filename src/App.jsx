import { useState, useEffect } from 'react';
import {
  Coins, Sprout, Trophy, ShoppingBag, Map, Droplets, Sparkles,
  Check, Leaf, Plus, LogOut, Crown
} from 'lucide-react';
import { supabase, loadGameState } from './supabase.js';
import MemoryGame from './games/MemoryGame.jsx';
import SlidePuzzle from './games/SlidePuzzle.jsx';
import WordleFlowers from './games/WordleFlowers.jsx';

const PLANT_TYPES = {
  sprout:    { name: 'Lil Sprout',     stages: ['🌱','🌿','🌳'], hue: 'mint'     },
  sunflower: { name: 'Sunflower',      stages: ['🌱','🌿','🌻'], hue: 'lemon'    },
  rose:      { name: 'Rose',           stages: ['🌱','🌿','🌹'], hue: 'pink'     },
  tulip:     { name: 'Tulip',          stages: ['🌱','🌿','🌷'], hue: 'pink'     },
  cactus:    { name: 'Cactus',         stages: ['🌱','🌿','🌵'], hue: 'mint'     },
  hibiscus:  { name: 'Hibiscus',       stages: ['🌱','🌿','🌺'], hue: 'peach'    },
  cherry:    { name: 'Cherry Blossom', stages: ['🌱','🌿','🌸'], hue: 'pink'     },
  bonsai:    { name: 'Bonsai',         stages: ['🌱','🌿','🪴'], hue: 'lavender' },
};

const SHOP = {
  Supplies: [
    { id: 'water',      name: 'Watering Can', price: 10,  icon: '💧', desc: 'Adds 1 use'        },
    { id: 'fertilizer', name: 'Fertilizer',   price: 25,  icon: '✨', desc: 'Adds 1 use'        },
    { id: 'rain_cloud', name: 'Rain Cloud',   price: 30,  icon: '☁️', desc: 'Waters all plants' },
  ],
  Seeds: [
    { id: 'sunflower', name: 'Sunflower Seed', price: 50,  icon: '🌻', plant: 'sunflower' },
    { id: 'cactus',    name: 'Cactus Cutting', price: 60,  icon: '🌵', plant: 'cactus'    },
    { id: 'tulip',     name: 'Tulip Bulb',     price: 70,  icon: '🌷', plant: 'tulip'     },
    { id: 'rose',      name: 'Rose Cutting',   price: 80,  icon: '🌹', plant: 'rose'      },
    { id: 'hibiscus',  name: 'Hibiscus Seed',  price: 100, icon: '🌺', plant: 'hibiscus'  },
    { id: 'cherry',    name: 'Cherry Sapling', price: 120, icon: '🌸', plant: 'cherry'    },
    { id: 'bonsai',    name: 'Bonsai Starter', price: 200, icon: '🪴', plant: 'bonsai'    },
  ],
  Pots: [
    { id: 'pot_pink',     name: 'Pink Pot', price: 40, icon: '🌷', color: 'pink'     },
    { id: 'pot_lavender', name: 'Lilac Pot',     price: 40, icon: '🪻', color: 'lavender' },
    { id: 'pot_lemon',    name: 'Lemon Pot',     price: 40, icon: '🍋', color: 'lemon'    },
    { id: 'pot_mint',     name: 'Mint Pot',      price: 40, icon: '🌿', color: 'mint'     },
  ],
};

// Quests with optional `game` field — when present, the quest shows a Play button
// and `game` matches a key in the GAMES registry below
const QUEST_TEMPLATE = [
  {
    id: 'login',
    name: 'Daily Visitor',
    desc: 'Visit your garden today',
    goal: 1,
    reward: 20,
    track: 'login',
  },

  {
    id: 'memory_match',
    name: 'Memory Match',
    desc: "Solve today's memory puzzle",
    goal: 1,
    reward: 75,
    track: 'puzzle',
    game: 'memory',
  },

  {
    id: 'flower_wordle',
    name: 'Flower Wordle',
    desc: "Guess today's flower word",
    goal: 1,
    reward: 90,
    track: 'wordle',
    game: 'wordle',
  },

  {
    id: 'slide_puzzle',
    name: 'Slide Puzzle',
    desc: 'Slide tiles into the right order',
    goal: 1,
    reward: 85,
    track: 'slide',
    game: 'slide',
  },

  {
    id: 'water_3',
    name: 'Hydration Hero',
    desc: 'Water 3 plants',
    goal: 3,
    reward: 50,
    track: 'water',
  },

  {
    id: 'fert_1',
    name: 'Growth Spurt',
    desc: 'Use fertilizer once',
    goal: 1,
    reward: 30,
    track: 'fertilize',
  },

  {
    id: 'shop_1',
    name: 'Garden Shopper',
    desc: 'Buy something',
    goal: 1,
    reward: 25,
    track: 'shop',
  },

  {
    id: 'plants_5',
    name: 'Green Thumb',
    desc: 'Have 5 plants total',
    goal: 5,
    reward: 100,
    track: 'plants',
  },
];

// Game registry — to add a new game, drop a row here and import the component
// {key: { component, track, icon}}. `track` must match a quest's `track` value.
const GAMES = {
  memory: {
    component: MemoryGame,
    track: 'puzzle',
    icon: '🧠',
  },

  wordle: {
    component: WordleFlowers,
    track: 'wordle',
    icon: '🌸',
  },

  slide: {
    component: SlidePuzzle,
    track: 'slide',
    icon: '🧩',
  },
};

const HUE_BG = {
  pink: 'bg-[#FFE0EA]', lemon: 'bg-[#FFF4C2]', mint: 'bg-[#D6F3E2]',
  peach: 'bg-[#FFE2CE]', lavender: 'bg-[#E5DBF7]',
};

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <Splash text="loading…" />;
  if (!session) return <AuthScreen />;
  return <PlantTracker session={session} />;
}

function Splash({ text }) {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #FFF4F8 0%, #F5F0FF 100%)' }}>
      <div className="text-3xl float" style={{ fontFamily: 'Caveat, cursive', color: '#7a5a8a' }}>
        🌷 {text}
      </div>
      <FloatStyles />
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: username || email.split('@')[0] } },
        });
        if (error) throw error;
        setInfo('account created! check your email to confirm (or just sign in if confirmation is off).');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #FFF4F8 0%, #F5F0FF 100%)' }}>
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(#FFCDDC 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />
      <div className="absolute top-10 left-1/4 text-5xl float">🌸</div>
      <div className="absolute bottom-20 right-1/4 text-5xl float" style={{ animationDelay: '1s' }}>🌿</div>

      <form onSubmit={submit}
        className="relative z-10 w-full max-w-sm bg-white/80 backdrop-blur rounded-3xl p-7 border-2 border-white shadow-[0_8px_30px_-12px_rgba(255,154,191,0.5)]">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">🌷</div>
          <h1 style={{ fontFamily: 'Caveat, cursive', fontSize: '2.6rem', lineHeight: 1, color: '#5D3F6A' }}>bloom</h1>
          <p className="text-sm text-[#9b86a8] mt-1" style={{ fontFamily: 'Nunito' }}>
            {mode === 'signin' ? 'welcome back, gardener' : 'plant your first sprout ✿'}
          </p>
        </div>

        {mode === 'signup' && (
          <Field label="username" value={username} setValue={setUsername} placeholder="mochi_lover" />
        )}
        <Field label="email" type="email" value={email} setValue={setEmail} placeholder="you@garden.io" required />
        <Field label="password" type="password" value={password} setValue={setPassword} placeholder="••••••••" required minLength={6} />

        {error && <p className="text-sm text-[#c44b6b] mt-2 text-center" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>{error}</p>}
        {info && <p className="text-sm text-[#7a8a5a] mt-2 text-center" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>{info}</p>}

        <button type="submit" disabled={busy}
          className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-[#FF9CB8] to-[#FF6B9D] text-white shadow-[0_3px_0_#D54C7E] hover:translate-y-[-1px] disabled:opacity-50 transition"
          style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>
          {busy ? '...' : mode === 'signin' ? 'sign in' : 'create account'}
        </button>

        <button type="button" onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); }}
          className="w-full mt-3 text-sm text-[#9b86a8] hover:text-[#5D3F6A]"
          style={{ fontFamily: 'Nunito', fontWeight: 600 }}>
          {mode === 'signin' ? "new here? plant a seed →" : '← already have an account?'}
        </button>
      </form>
      <FloatStyles />
    </div>
  );
}

function Field({ label, value, setValue, ...rest }) {
  return (
    <label className="block mb-2.5">
      <span className="text-xs ml-1 text-[#9b86a8]" style={{ fontFamily: 'Nunito', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
      <input value={value} onChange={e => setValue(e.target.value)}
        className="w-full mt-1 px-4 py-2.5 rounded-2xl bg-[#FFF4F8] border-2 border-[#F0DDE8] focus:border-[#FF9CB8] outline-none transition"
        style={{ fontFamily: 'Nunito', fontWeight: 600, color: '#5D3F6A' }}
        {...rest} />
    </label>
  );
}

function PlantTracker({ session }) {
  const userId = session.user.id;
  const [tab, setTab] = useState('garden');
  const [state, setState] = useState(null);
  const [toast, setToast] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [openGame, setOpenGame] = useState(null); // null | 'memory' | 'slide' | ...

  useEffect(() => {
    loadGameState(userId).then(setState).catch(err => {
      console.error(err);
      setToast({ msg: 'failed to load garden', kind: 'warn' });
    });
  }, [userId]);

  useEffect(() => {
    if (!state) return;
    const ch = supabase
      .channel('profile-' + userId)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => setState(s => s && ({ ...s, coins: payload.new.coins }))
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new.source === 'map_game') {
            const delta = payload.new.coin_delta;
            showToast(`${delta > 0 ? '+' : ''}${delta} from map game! 🚂`);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, state?.userId]);

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 1800);
  };
  const popConfetti = () => { setConfetti(true); setTimeout(() => setConfetti(false), 1400); };

  const waterPlant = async (plantId) => {
    if (!state.inventory.water) { showToast('no water! visit the shop 💧', 'warn'); return; }
    const plant = state.plants.find(p => p.id === plantId);
    const newWater = Math.min(100, plant.waterLevel + 35);
    const newGrowth = Math.min(100, plant.growth + 8);

    setState(s => ({
      ...s,
      inventory: { ...s.inventory, water: s.inventory.water - 1 },
      plants: s.plants.map(p => p.id === plantId ? { ...p, waterLevel: newWater, growth: newGrowth } : p),
      quests: { ...s.quests, progress: { ...s.quests.progress, water: (s.quests.progress.water || 0) + 1 } },
    }));

    try {
      await Promise.all([
        supabase.from('plants').update({
          water_level: newWater, growth: newGrowth, last_watered: new Date().toISOString()
        }).eq('id', plantId),
        supabase.from('inventory').update({ count: state.inventory.water - 1 })
          .eq('user_id', userId).eq('item_id', 'water'),
        supabase.rpc('bump_quest', { p_track: 'water', p_amount: 1 }),
      ]);
      showToast('watered! 💦');
    } catch (e) { console.error(e); showToast('save failed', 'warn'); }
  };

  const fertilizePlant = async (plantId) => {
    if (!state.inventory.fertilizer) { showToast('no fertilizer! visit the shop ✨', 'warn'); return; }
    const plant = state.plants.find(p => p.id === plantId);
    const newGrowth = Math.min(100, plant.growth + 25);

    setState(s => ({
      ...s,
      inventory: { ...s.inventory, fertilizer: s.inventory.fertilizer - 1 },
      plants: s.plants.map(p => p.id === plantId ? { ...p, growth: newGrowth } : p),
      quests: { ...s.quests, progress: { ...s.quests.progress, fertilize: (s.quests.progress.fertilize || 0) + 1 } },
    }));

    try {
      await Promise.all([
        supabase.from('plants').update({ growth: newGrowth }).eq('id', plantId),
        supabase.from('inventory').update({ count: state.inventory.fertilizer - 1 })
          .eq('user_id', userId).eq('item_id', 'fertilizer'),
        supabase.rpc('bump_quest', { p_track: 'fertilize', p_amount: 1 }),
      ]);
      showToast('sparkly growth! ✨');
    } catch (e) { console.error(e); showToast('save failed', 'warn'); }
  };

  const changePot = async (plantId) => {
    const plant = state.plants.find(p => p.id === plantId);
    const owned = Object.entries(state.inventory)
      .filter(([k, v]) => k.startsWith('pot_') && v > 0)
      .map(([k]) => k.replace('pot_', ''));
    if (!owned.includes(plant.pot)) owned.unshift(plant.pot);
    if (owned.length < 2) { showToast('buy more pots to swap! 🪴', 'warn'); return; }
    const idx = owned.indexOf(plant.pot);
    const nextPot = owned[(idx + 1) % owned.length];
    setState(s => ({
      ...s,
      plants: s.plants.map(p => p.id === plantId ? { ...p, pot: nextPot } : p),
    }));
    await supabase.from('plants').update({ pot: nextPot }).eq('id', plantId);
    showToast(`switched to ${nextPot} pot 🌷`);
  };

  const buyItem = async (cat, item) => {
    if (state.coins < item.price) { showToast('not enough coins 🥲', 'warn'); return; }
    const payload = cat === 'Pots' ? { color: item.color }
      : cat === 'Seeds' ? { plant: item.plant, nickname: PLANT_TYPES[item.plant].name }
      : {};

    try {
      const { error } = await supabase.rpc('purchase_item', {
        p_category: cat, p_item_id: item.id, p_price: item.price, p_payload: payload,
      });
      if (error) throw error;
      const fresh = await loadGameState(userId);
      setState(fresh);
      showToast(`got ${item.name}! ${item.icon}`);
    } catch (e) {
      console.error(e);
      showToast(e.message || 'purchase failed', 'warn');
    }
  };

  const claimQuest = async (q) => {
    try {
      const { data, error } = await supabase.rpc('claim_quest', { p_quest_id: q.id });
      if (error) throw error;
      setState(s => ({
        ...s,
        coins: data,
        quests: { ...s.quests, claimed: [...s.quests.claimed, q.id] },
      }));
      popConfetti();
      showToast(`+${q.reward} coins! 🎉`);
    } catch (e) {
      console.error(e);
      showToast(e.message || 'claim failed', 'warn');
    }
  };

  // Generic game-win handler — looks up the track from the GAMES registry
  const handleGameWin = async (gameKey, moves) => {
    setOpenGame(null);
    const game = GAMES[gameKey];
    if (!game) return;
    setState(s => ({
      ...s,
      quests: { ...s.quests, progress: { ...s.quests.progress, [game.track]: 1 } },
    }));
    try {
      await supabase.rpc('bump_quest', { p_track: game.track, p_amount: 1 });
      popConfetti();
      showToast(`solved in ${moves} moves! ${game.icon}`);
    } catch (e) {
      console.error(e);
      showToast('save failed', 'warn');
    }
  };

  const signOut = () => supabase.auth.signOut();

  if (!state) return <Splash text="loading your garden…" />;

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #FFF4F8 0%, #F5F0FF 100%)' }}>
      <FloatStyles />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="drift-cloud absolute top-10 text-5xl opacity-50">☁️</div>
        <div className="drift-cloud absolute top-32 text-4xl opacity-40" style={{ animationDelay: '-25s' }}>☁️</div>
        <div className="drift-cloud absolute top-56 text-6xl opacity-30" style={{ animationDelay: '-45s' }}>☁️</div>
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: 'radial-gradient(#FFCDDC 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <header className="relative z-10 max-w-5xl mx-auto px-5 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-4xl float">🌷</div>
          <div>
            <h1 style={{ fontFamily: 'Caveat, cursive', fontSize: '2.4rem', lineHeight: 1, color: '#5D3F6A' }}>bloom</h1>
            <div style={{ fontFamily: 'Nunito', fontSize: '0.78rem', color: '#9b86a8', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              hi, {state.username}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CoinPill coins={state.coins} />
          <button onClick={signOut} title="sign out"
            className="px-3 py-2 rounded-full bg-white/60 hover:bg-white text-[#9b86a8] border border-[#F0DDE8] transition">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <nav className="relative z-10 max-w-5xl mx-auto px-5 mb-6">
        <div className="bg-white/70 backdrop-blur rounded-3xl p-1.5 flex gap-1 shadow-[0_4px_20px_-8px_rgba(255,154,191,0.4)] border border-white">
          <TabBtn id="garden" active={tab} setTab={setTab} icon={<Sprout size={18} />} label="Garden" />
          <TabBtn id="quests" active={tab} setTab={setTab} icon={<Trophy size={18} />} label="Quests"
            badge={QUEST_TEMPLATE.filter(q => {
              const prog = q.track === 'plants' ? state.plants.length : (state.quests.progress[q.track] || 0);
              return prog >= q.goal && !state.quests.claimed.includes(q.id);
            }).length} />
          <TabBtn id="shop" active={tab} setTab={setTab} icon={<ShoppingBag size={18} />} label="Shop" />
          <TabBtn id="map" active={tab} setTab={setTab} icon={<Map size={18} />} label="Map" />
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-5">
        {tab === 'garden' && <GardenTab state={state} onWater={waterPlant} onFertilize={fertilizePlant} onChangePot={changePot} setTab={setTab} />}
        {tab === 'quests' && <QuestsTab state={state} onClaim={claimQuest} onPlayGame={(g) => setOpenGame(g)} />}
        {tab === 'shop' && <ShopTab state={state} onBuy={buyItem} />}
        {tab === 'map' && <MapTab />}
      </main>

      {/* Render every registered game modal — only the one matching openGame is open */}
      {Object.entries(GAMES).map(([key, game]) => {
        const Component = game.component;
        const alreadySolved = (state.quests.progress[game.track] || 0) >= 1;
        return (
          <Component
            key={key}
            open={openGame === key}
            alreadySolved={alreadySolved}
            onClose={() => setOpenGame(null)}
            onWin={(moves) => handleGameWin(key, moves)}
          />
        );
      })}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pop-in">
          <div className={`px-5 py-3 rounded-full shadow-lg border-2 ${
            toast.kind === 'warn' ? 'bg-[#FFE2CE] border-[#FFB088] text-[#a8552c]' : 'bg-white border-[#FFCDDC] text-[#5D3F6A]'
          }`} style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
            {toast.msg}
          </div>
        </div>
      )}

      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-[55]">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="absolute text-2xl"
              style={{
                left: `${Math.random() * 100}%`, top: '-20px',
                animation: `confettiFall ${1 + Math.random()}s ease-in forwards`,
                animationDelay: `${Math.random() * 0.3}s`,
              }}>
              {['🌸','✨','💖','🌷','💐'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoinPill({ coins }) {
  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-[#FFF0B5] to-[#FFE2CE] px-4 py-2 rounded-full shadow-[0_3px_0_#E8C988] border-2 border-white">
      <Coins size={18} className="text-[#C99A38]" />
      <span style={{ fontFamily: 'Fredoka', fontWeight: 700, color: '#A8741D', fontSize: '1.05rem' }}>{coins}</span>
    </div>
  );
}

function TabBtn({ id, active, setTab, icon, label, badge }) {
  const isActive = active === id;
  return (
    <button onClick={() => setTab(id)}
      className={`relative flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-2xl transition-all ${
        isActive ? 'bg-gradient-to-b from-[#FFCDDC] to-[#FFB5C5] text-[#5D3F6A] shadow-[0_3px_0_#F09BB5]' : 'text-[#9b86a8] hover:bg-white/50'
      }`}
      style={{ fontFamily: 'Fredoka', fontWeight: 600 }}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-[#FF6B9D] text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white"
          style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>{badge}</span>
      )}
    </button>
  );
}

function SectionHeader({ title, subtitle, accent }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h2 style={{ fontFamily: 'Caveat', fontSize: '2.2rem', color: '#5D3F6A', lineHeight: 1 }}>
        {accent} {title}
      </h2>
      <p className="text-sm text-[#9b86a8]" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>{subtitle}</p>
    </div>
  );
}

function GardenTab({ state, onWater, onFertilize, onChangePot, setTab }) {
  return (
    <div className="pop-in">
      <SectionHeader title="My Garden"
        subtitle={`${state.plants.length} ${state.plants.length === 1 ? 'plant' : 'plants'} blooming`}
        accent="🪴" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.plants.map(p => (
          <PlantCard key={p.id} plant={p} onWater={onWater} onFertilize={onFertilize} onChangePot={onChangePot} />
        ))}

        <button onClick={() => setTab('shop')}
          className="rounded-3xl border-2 border-dashed border-[#F0C8DD] bg-white/40 hover:bg-white/70 hover:border-[#FF9CB8] transition p-8 flex flex-col items-center justify-center gap-2 min-h-[260px] text-[#a48ab8] hover:text-[#5D3F6A]">
          <Plus size={32} />
          <span style={{ fontFamily: 'Caveat', fontSize: '1.5rem' }}>plant something new</span>
          <span className="text-xs" style={{ fontFamily: 'Nunito' }}>visit the shop ✿</span>
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/70 backdrop-blur rounded-3xl p-5 border border-white shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)]">
          <h3 className="mb-3" style={{ fontFamily: 'Fredoka', fontWeight: 600, color: '#5D3F6A', fontSize: '1.1rem' }}>Tool Shed</h3>
          <div className="flex gap-2 flex-wrap">
            <InvChip icon="💧" label="Water" count={state.inventory.water} />
            <InvChip icon="✨" label="Fertilizer" count={state.inventory.fertilizer} />
            {Object.keys(state.inventory).filter(k => k.startsWith('pot_')).map(k => (
              <InvChip key={k} icon="🪴" label={k.replace('pot_','') + ' pot'} count={state.inventory[k]} />
            ))}
          </div>
          <p className="text-xs text-[#9b86a8] mt-3" style={{ fontFamily: 'Nunito' }}>
            tip: tap a plant's pot to swap colors
          </p>
        </div>

        <Leaderboard userId={state.userId} />
      </div>
    </div>
  );
}

function Leaderboard({ userId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('leaderboard_by_plants');
      if (error) {
        console.error('leaderboard error:', error);
        if (mounted) setRows([]);
        return;
      }
      if (mounted) setRows(data || []);
    };
    load();

    const ch = supabase.channel('lb')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="bg-white/70 backdrop-blur rounded-3xl p-5 border border-white shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)]">
      <h3 className="mb-3 flex items-center gap-2" style={{ fontFamily: 'Fredoka', fontWeight: 600, color: '#5D3F6A', fontSize: '1.1rem' }}>
        <Crown size={16} className="text-[#C99A38]" /> Top Gardeners
      </h3>

      {!rows ? (
        <p className="text-sm text-[#9b86a8]" style={{ fontFamily: 'Nunito' }}>loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#9b86a8]" style={{ fontFamily: 'Nunito' }}>no gardeners yet — be the first!</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.id}
              className={`flex items-center justify-between px-3 py-1.5 rounded-xl ${r.id === userId ? 'bg-[#FFE0EA]' : ''}`}
              style={{ fontFamily: 'Nunito', fontWeight: 600, color: '#5D3F6A' }}>
              <span className="flex items-center gap-2">
                <span className="text-xs w-5 text-[#9b86a8]">{i + 1}</span>
                {i < 3 && <span>{['🥇','🥈','🥉'][i]}</span>}
                <span>{r.username}</span>
              </span>
              <span className="flex items-center gap-1 text-[#6FAF7A]" style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>
                <Sprout size={12} /> {r.plant_count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PlantCard({ plant, onWater, onFertilize, onChangePot }) {
  const type = PLANT_TYPES[plant.type] || PLANT_TYPES.sprout;
  const stageIdx = plant.growth < 34 ? 0 : plant.growth < 67 ? 1 : 2;
  const emoji = type.stages[stageIdx];
  const stageLabel = ['Sprouting','Growing','Bloomed'][stageIdx];
  const thirsty = plant.waterLevel < 30;

  return (
    <div className={`relative rounded-3xl p-5 border-2 border-white shadow-[0_6px_24px_-12px_rgba(255,154,191,0.5)] ${HUE_BG[type.hue]} overflow-hidden`}>
      {thirsty && (
        <div className="absolute top-3 right-3 text-xs px-2 py-1 bg-white/80 rounded-full text-[#3A6BB5]"
          style={{ fontFamily: 'Nunito', fontWeight: 700 }}>thirsty 💧</div>
      )}

      <div className="flex flex-col items-center mb-3 relative">
        <div className="text-7xl wiggle cursor-pointer select-none" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.08))' }}>
          {emoji}
        </div>
        <div className={`mt-1 w-24 h-12 rounded-b-[40%] rounded-t-md ${HUE_BG[plant.pot]} border-2 border-white relative cursor-pointer hover:scale-105 active:scale-95 transition`}
          style={{ marginTop: '-8px' }}
          onClick={() => onChangePot(plant.id)}
          title="click to swap pot">
          <div className="absolute -top-1 left-0 right-0 h-2 bg-white/40 rounded-full" />
        </div>
      </div>

      <div className="text-center mb-3">
        <div style={{ fontFamily: 'Caveat', fontSize: '1.6rem', color: '#5D3F6A', lineHeight: 1 }}>{plant.nickname}</div>
        <div className="text-xs text-[#9b86a8]" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>{type.name} · {stageLabel}</div>
      </div>

      <Bar icon={<Droplets size={11} />} label="water" value={plant.waterLevel} from="#A0D8F0" to="#7AC0E0" />
      <Bar icon={<Leaf size={11} />} label="growth" value={plant.growth} from="#B8E8D0" to="#7DD3A8" />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button onClick={() => onWater(plant.id)}
          className="bg-white/80 hover:bg-white text-[#3A6BB5] py-2 rounded-2xl text-sm transition flex items-center justify-center gap-1 shadow-[0_2px_0_#C5DCEE] hover:translate-y-[-1px]"
          style={{ fontFamily: 'Fredoka', fontWeight: 600 }}>
          <Droplets size={14} /> Water
        </button>
        <button onClick={() => onFertilize(plant.id)}
          className="bg-white/80 hover:bg-white text-[#9b6bb5] py-2 rounded-2xl text-sm transition flex items-center justify-center gap-1 shadow-[0_2px_0_#D9CCEE] hover:translate-y-[-1px]"
          style={{ fontFamily: 'Fredoka', fontWeight: 600 }}>
          <Sparkles size={14} /> Fertilize
        </button>
      </div>
    </div>
  );
}

function Bar({ icon, label, value, from, to }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[11px] mb-1" style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#5D3F6A' }}>
        <span className="flex items-center gap-1">{icon} {label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 bg-white/60 rounded-full overflow-hidden">
        <div className="water-fill h-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${from}, ${to})` }} />
      </div>
    </div>
  );
}

function InvChip({ icon, label, count }) {
  return (
    <div className="flex items-center gap-2 bg-[#FFF4F8] px-3 py-2 rounded-full border border-[#F0DDE8]">
      <span className="text-lg">{icon}</span>
      <span className="text-sm capitalize" style={{ fontFamily: 'Nunito', fontWeight: 600, color: '#5D3F6A' }}>{label}</span>
      <span className="bg-white px-2 rounded-full text-xs" style={{ fontFamily: 'Fredoka', fontWeight: 700, color: '#5D3F6A' }}>×{count || 0}</span>
    </div>
  );
}

function QuestsTab({ state, onClaim, onPlayGame }) {
  return (
    <div className="pop-in">
      <SectionHeader title="Daily Quests" subtitle="resets at midnight · earn coins to grow your garden" accent="🌟" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUEST_TEMPLATE.map(q => {
          const raw = q.track === 'plants' ? state.plants.length : (state.quests.progress[q.track] || 0);
          const progress = Math.min(raw, q.goal);
          const claimed = state.quests.claimed.includes(q.id);
          const ready = progress >= q.goal && !claimed;
          const isGame = !!q.game;
          const playable = isGame && progress < q.goal && !claimed;
          const gameMeta = isGame ? GAMES[q.game] : null;

          return (
            <div key={q.id}
              className={`rounded-3xl p-5 border-2 transition relative ${
                claimed ? 'bg-[#E8E0F0] border-white opacity-60'
                : ready ? 'bg-gradient-to-br from-[#FFF4C2] to-[#FFE2CE] border-[#FFD79C] shadow-[0_4px_20px_-8px_rgba(255,180,90,0.5)]'
                : isGame ? 'bg-gradient-to-br from-[#E5DBF7] to-[#F0E5FF] border-[#D4C5F0] shadow-[0_4px_20px_-8px_rgba(159,141,255,0.4)]'
                : 'bg-white/80 border-white shadow-[0_4px_20px_-12px_rgba(0,0,0,0.08)]'
              }`}>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                  claimed ? 'bg-white/60' : ready ? 'bg-white' : isGame ? 'bg-white/80' : 'bg-[#FFF4F8]'
                }`}>{questIcon(q.track)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 style={{ fontFamily: 'Fredoka', fontWeight: 600, color: '#5D3F6A', fontSize: '1.05rem' }}>{q.name}</h4>
                    <div className="flex items-center gap-1 text-[#A8741D] shrink-0" style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>
                      <Coins size={14} /> {q.reward}
                    </div>
                  </div>
                  <p className="text-sm text-[#9b86a8] mb-3" style={{ fontFamily: 'Nunito' }}>{q.desc}</p>
                  {!isGame && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-[#F0DDE8]">
                        <div className="water-fill h-full bg-gradient-to-r from-[#FFCDDC] to-[#FF9CB8]"
                          style={{ width: `${(progress / q.goal) * 100}%` }} />
                      </div>
                      <span className="text-xs shrink-0" style={{ fontFamily: 'Fredoka', fontWeight: 600, color: '#5D3F6A' }}>
                        {progress}/{q.goal}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {playable && (
                <button onClick={() => onPlayGame(q.game)}
                  className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-r from-[#9F8DFF] to-[#7E68F0] text-white shadow-[0_3px_0_#5C46C5] hover:translate-y-[-1px] transition flex items-center justify-center gap-2"
                  style={{ fontFamily: 'Fredoka', fontWeight: 700, fontSize: '1rem' }}>
                  {gameMeta?.icon} Play
                </button>
              )}
              {ready && (
                <button onClick={() => onClaim(q)}
                  className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF9CB8] to-[#FF6B9D] text-white shadow-[0_3px_0_#D54C7E] hover:translate-y-[-1px] transition flex items-center justify-center gap-2"
                  style={{ fontFamily: 'Fredoka', fontWeight: 700, fontSize: '1rem' }}>
                  <Sparkles size={16} /> Claim reward
                </button>
              )}
              {claimed && (
                <div className="mt-4 flex items-center justify-center gap-2 text-[#7a5a8a]" style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
                  <Check size={16} /> Claimed!
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function questIcon(track) {
  return {
    login: '☀️',
    water: '💧',
    fertilize: '✨',
    shop: '🛍️',
    plants: '🌱',
    puzzle: '🧠',
    wordle: '🌸',
    slide: '🧩',
  }[track] || '⭐';
}

function ShopTab({ state, onBuy }) {
  return (
    <div className="pop-in">
      <SectionHeader title="Garden Shop" subtitle="spend coins on cute things ♡" accent="🛍️" />

      {Object.entries(SHOP).map(([category, items]) => (
        <div key={category} className="mb-7">
          <h3 className="mb-3 px-1" style={{ fontFamily: 'Caveat', fontSize: '1.6rem', color: '#5D3F6A' }}>{category}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map(item => {
              const can = state.coins >= item.price;
              return (
                <div key={item.id}
                  className="bg-white/80 backdrop-blur rounded-3xl p-4 border-2 border-white shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)] flex flex-col items-center text-center hover:translate-y-[-2px] transition">
                  <div className="text-5xl mb-2 float">{item.icon}</div>
                  <div style={{ fontFamily: 'Fredoka', fontWeight: 600, color: '#5D3F6A', fontSize: '0.95rem' }}>{item.name}</div>
                  {item.desc && (
                    <div className="text-[11px] text-[#9b86a8] mt-0.5" style={{ fontFamily: 'Nunito' }}>{item.desc}</div>
                  )}
                  <button onClick={() => onBuy(category, item)} disabled={!can}
                    className={`mt-3 w-full py-2 rounded-2xl flex items-center justify-center gap-1 transition ${
                      can ? 'bg-gradient-to-r from-[#FFF0B5] to-[#FFE2CE] text-[#A8741D] shadow-[0_2px_0_#E8C988] hover:translate-y-[-1px]'
                        : 'bg-[#F0E8F0] text-[#b9aac4] cursor-not-allowed'
                    }`}
                    style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>
                    <Coins size={14} /> {item.price}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MapTab() {
  return (
    <div className="pop-in">
      <SectionHeader title="Map Adventure" subtitle="coming soon ✿" accent="🗺️" />
      <div className="bg-white/70 backdrop-blur rounded-3xl border-2 border-dashed border-[#D4C5F0] p-12 text-center min-h-[400px] flex flex-col items-center justify-center gap-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(#C7CEEA 2px, transparent 2px)', backgroundSize: '32px 32px',
        }} />
        <div className="text-7xl float relative z-10">🗺️</div>
        <h3 style={{ fontFamily: 'Caveat', fontSize: '2.4rem', color: '#5D3F6A', lineHeight: 1 }} className="relative z-10">
          map coming soon!
        </h3>
        <p className="text-[#9b86a8] max-w-md relative z-10" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>
          your teammate's transport game lives here. they share the same database, so deliveries
          deposit coins straight into your garden 🌸
        </p>
        <div className="flex gap-2 relative z-10 mt-2">
          <span className="text-3xl">🚂</span><span className="text-3xl">📦</span><span className="text-3xl">🏞️</span>
        </div>
        <div className="absolute bottom-4 right-4 text-xs text-[#b9aac4]" style={{ fontFamily: 'Nunito' }}>
          {'<'}TeammateMapGame /{'>'}
        </div>
      </div>
    </div>
  );
}

function FloatStyles() {
  return (
    <style>{`
      @keyframes wiggle { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
      @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes drift { 0% { transform: translateX(-10px) translateY(0); } 100% { transform: translateX(110vw) translateY(-30px); } }
      @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
      .wiggle:hover { animation: wiggle 0.6s ease-in-out infinite; }
      .float { animation: float 3s ease-in-out infinite; }
      .pop-in { animation: pop 0.4s cubic-bezier(.34,1.56,.64,1); }
      .drift-cloud { animation: drift 60s linear infinite; }
      .water-fill { transition: width 0.6s cubic-bezier(.34,1.56,.64,1); }
    `}</style>
  );
}
