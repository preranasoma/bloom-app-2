import { useState, useEffect, useMemo } from 'react';
import { Sparkles, X } from 'lucide-react';

// ────────────────────────────────────────────────────────
// Daily-seeded shuffle so all players see the same puzzle today
// ────────────────────────────────────────────────────────
const PLANT_DECK = ['🌷', '🌹', '🌻', '🌸', '🌺', '🌵', '🪴', '🍄', '🌱', '🌿'];

function dailySeed(dateStr) {
  let h = 5381;
  for (let i = 0; i < dateStr.length; i++) {
    h = ((h << 5) + h) + dateStr.charCodeAt(i);
  }
  return Math.abs(h) || 1;
}

// Mulberry32 PRNG — small, fast, deterministic
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ────────────────────────────────────────────────────────
// Memory match game — modal overlay
// ────────────────────────────────────────────────────────
export default function MemoryGame({ open, onWin, onClose, alreadySolved }) {
  const today = new Date().toISOString().slice(0, 10);

  // Build the deck (deterministic per day)
  const cards = useMemo(() => {
    const seed = dailySeed(today);
    const rng = makeRng(seed);
    const picked = seededShuffle(PLANT_DECK, rng).slice(0, 6); // 6 unique plants
    const doubled = [...picked, ...picked];                    // 12 cards (6 pairs)
    return seededShuffle(doubled, rng).map((plant, i) => ({ id: i, plant }));
  }, [today]);

  const [flipped, setFlipped] = useState([]);   // currently face-up (max 2)
  const [matched, setMatched] = useState([]);   // ids permanently matched
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);  // brief lock during compare

  // Reset state when modal reopens (only if not already solved today)
  useEffect(() => {
    if (open && !alreadySolved) {
      setFlipped([]);
      setMatched([]);
      setMoves(0);
      setLocked(false);
    }
  }, [open, alreadySolved]);

  // Win detection
  useEffect(() => {
  if (!open || alreadySolved) return;
  if (matched.length > 0 && matched.length === cards.length) {
    const t = setTimeout(() => onWin?.(moves), 600);
    return () => clearTimeout(t);
  }
  }, [matched, cards.length, moves, onWin, open, alreadySolved]);

  const handleClick = (cardId) => {
    if (locked || alreadySolved) return;
    if (flipped.includes(cardId) || matched.includes(cardId)) return;
    if (flipped.length >= 2) return;

    const next = [...flipped, cardId];
    setFlipped(next);

    if (next.length === 2) {
      setLocked(true);
      setMoves(m => m + 1);
      const [a, b] = next;
      const ca = cards.find(c => c.id === a);
      const cb = cards.find(c => c.id === b);

      if (ca.plant === cb.plant) {
        // match — keep them face up
        setTimeout(() => {
          setMatched(m => [...m, a, b]);
          setFlipped([]);
          setLocked(false);
        }, 650);
      } else {
        // miss — flip back
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 1100);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm bg-[#5D3F6A]/40"
         onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .mm-overlay { animation: fadeIn 0.3s; }
        .mm-modal { animation: scaleIn 0.4s cubic-bezier(.34,1.56,.64,1); }
        .memcard { perspective: 800px; cursor: pointer; }
        .memcard:disabled { cursor: default; }
        .memcard-inner {
          transition: transform 0.5s cubic-bezier(.4,0,.2,1);
          transform-style: preserve-3d;
          position: relative; width: 100%; height: 100%;
        }
        .memcard.flipped .memcard-inner { transform: rotateY(180deg); }
        .memcard-face {
          position: absolute; inset: 0;
          backface-visibility: hidden; -webkit-backface-visibility: hidden;
          display: flex; align-items: center; justify-content: center;
          border-radius: 1rem; border: 2px solid white;
          box-shadow: 0 4px 12px -4px rgba(255,154,191,0.3);
        }
        .memcard-back { background: linear-gradient(135deg, #FFCDDC, #FF9CB8); }
        .memcard-front {
          background: white;
          transform: rotateY(180deg);
          font-size: 2.5rem;
        }
        .memcard.matched .memcard-front {
          background: linear-gradient(135deg, #D6F3E2, #A8E0BC);
          animation: matchPulse 0.5s ease;
        }
        @keyframes matchPulse {
          0%,100% { transform: rotateY(180deg) scale(1); }
          50% { transform: rotateY(180deg) scale(1.12); }
        }
      `}</style>

      <div className="mm-modal relative w-full max-w-md bg-gradient-to-b from-[#FFF4F8] to-[#F5F0FF] rounded-3xl p-6 border-2 border-white shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#9b86a8] transition">
          <X size={18} />
        </button>

        <div className="text-center mb-5">
          <div className="text-5xl mb-1" style={{ animation: 'matchPulse 2s ease-in-out infinite', transform: 'rotateY(180deg)' }}>🧠</div>
          <h2 style={{ fontFamily: 'Caveat, cursive', fontSize: '2.4rem', color: '#5D3F6A', lineHeight: 1 }}>
            memory match
          </h2>
          <p className="text-sm text-[#9b86a8] mt-1" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>
            {alreadySolved
              ? 'come back tomorrow 🌟'
              : matched.length === cards.length
                ? `solved in ${moves} moves! 🎉`
                : `find all 6 pairs · ${moves} ${moves === 1 ? 'move' : 'moves'}`}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          {cards.map(card => {
            const isFlipped = flipped.includes(card.id) || matched.includes(card.id);
            const isMatched = matched.includes(card.id);
            return (
              <button key={card.id}
                onClick={() => handleClick(card.id)}
                disabled={isFlipped || locked || alreadySolved}
                className={`memcard aspect-square ${isFlipped ? 'flipped' : ''} ${isMatched ? 'matched' : ''}`}>
                <div className="memcard-inner">
                  <div className="memcard-face memcard-back">
                    <span className="text-2xl opacity-50">✿</span>
                  </div>
                  <div className="memcard-face memcard-front">
                    {card.plant}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {alreadySolved && (
          <div className="mt-5 text-center">
            <div className="inline-flex items-center gap-2 bg-white/80 px-4 py-2 rounded-full text-[#5D3F6A]"
                 style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
              <Sparkles size={16} className="text-[#FFB088]" /> already solved today
            </div>
          </div>
        )}
      </div>
    </div>
  );
}