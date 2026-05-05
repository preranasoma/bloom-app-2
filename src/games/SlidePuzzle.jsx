import { useState, useEffect, useMemo } from 'react';
import { Sparkles, X, Check } from 'lucide-react';

// ────────────────────────────────────────────────────────
// 8 unique plant tiles + 1 blank space (3x3 grid)
// ────────────────────────────────────────────────────────
const TILES = ['🌷', '🌻', '🌹', '🌸', '🌺', '🌵', '🪴', '🍄'];

function dailySeed(dateStr) {
  let h = 5381;
  for (let i = 0; i < dateStr.length; i++) {
    h = ((h << 5) + h) + dateStr.charCodeAt(i);
  }
  return Math.abs(h) || 1;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3x3 grid neighbors of position idx (0..8)
function neighbors(idx) {
  const row = Math.floor(idx / 3);
  const col = idx % 3;
  const out = [];
  if (row > 0) out.push(idx - 3);
  if (row < 2) out.push(idx + 3);
  if (col > 0) out.push(idx - 1);
  if (col < 2) out.push(idx + 1);
  return out;
}

// Generate a guaranteed-solvable scramble by doing N random valid moves from solved.
// (Random permutations of 8-puzzle tiles are unsolvable 50% of the time.)
function scramble(solved, rng, moveCount = 60) {
  const board = [...solved];
  let blank = board.indexOf(null);
  let prevBlank = -1;
  for (let i = 0; i < moveCount; i++) {
    const candidates = neighbors(blank).filter(n => n !== prevBlank);
    const pick = candidates[Math.floor(rng() * candidates.length)];
    [board[blank], board[pick]] = [board[pick], board[blank]];
    prevBlank = blank;
    blank = pick;
  }
  return board;
}

// ────────────────────────────────────────────────────────
// Slide puzzle modal
// ────────────────────────────────────────────────────────
export default function SlidePuzzle({ open, onWin, onClose, alreadySolved }) {
  const today = new Date().toISOString().slice(0, 10);
  const solvedArr = useMemo(() => [...TILES, null], []);

  const initialBoard = useMemo(() => {
    const seed = dailySeed(today + '_slide');
    const rng = makeRng(seed);
    return scramble(solvedArr, rng);
  }, [today, solvedArr]);

  const [board, setBoard] = useState(initialBoard);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);

  // Reset when modal reopens
  useEffect(() => {
    if (!open) return;
    if (alreadySolved) {
      setBoard(solvedArr);
      setMoves(0);
      setWon(true);
    } else {
      setBoard(initialBoard);
      setMoves(0);
      setWon(false);
    }
  }, [open, alreadySolved, initialBoard, solvedArr]);

  // Win detection
  useEffect(() => {
    if (won || alreadySolved || !open) return;
    if (moves === 0) return;
    const isSolved = board.every((t, i) => t === solvedArr[i]);
    if (isSolved) {
      setWon(true);
      const t = setTimeout(() => onWin?.(moves), 800);
      return () => clearTimeout(t);
    }
  }, [board, moves, won, alreadySolved, open, solvedArr, onWin]);

  const handleClick = (idx) => {
    if (won || alreadySolved) return;
    const blank = board.indexOf(null);
    if (!neighbors(blank).includes(idx)) return;
    const next = [...board];
    [next[blank], next[idx]] = [next[idx], next[blank]];
    setBoard(next);
    setMoves(m => m + 1);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm bg-[#5D3F6A]/40"
         onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <style>{`
        @keyframes sp_fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sp_scaleIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes sp_winPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .sp-overlay { animation: sp_fadeIn 0.3s; }
        .sp-modal { animation: sp_scaleIn 0.4s cubic-bezier(.34,1.56,.64,1); }
        .sp-tile {
          position: absolute;
          width: calc(100%/3);
          height: calc(100%/3);
          padding: 4px;
          transition: transform 0.25s cubic-bezier(.4,0,.2,1);
          cursor: pointer;
        }
        .sp-tile-inner {
          width: 100%;
          height: 100%;
          border-radius: 1rem;
          background: white;
          border: 2px solid white;
          box-shadow: 0 4px 12px -4px rgba(255,154,191,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          transition: background 0.3s, transform 0.15s;
        }
        .sp-tile:hover .sp-tile-inner { background: #FFF4F8; transform: scale(0.96); }
        .sp-board.won .sp-tile-inner {
          background: linear-gradient(135deg, #D6F3E2, #A8E0BC);
          animation: sp_winPulse 1.2s ease-in-out infinite;
        }
        .sp-target-cell {
          font-size: 1rem;
          width: 1.4rem; height: 1.4rem;
          display: flex; align-items: center; justify-content: center;
          background: white; border-radius: 0.4rem;
          border: 1px solid #F0DDE8;
        }
      `}</style>

      <div className="sp-modal relative w-full max-w-md bg-gradient-to-b from-[#FFF4F8] to-[#F5F0FF] rounded-3xl p-6 border-2 border-white shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#9b86a8] transition">
          <X size={18} />
        </button>

        <div className="text-center mb-3">
          <div className="text-5xl mb-1 float">🧩</div>
          <h2 style={{ fontFamily: 'Caveat, cursive', fontSize: '2.4rem', color: '#5D3F6A', lineHeight: 1 }}>
            slide puzzle
          </h2>
          <p className="text-sm text-[#9b86a8] mt-1" style={{ fontFamily: 'Nunito', fontWeight: 600 }}>
            {alreadySolved
              ? 'come back tomorrow 🌟'
              : won
                ? `solved in ${moves} moves! 🎉`
                : `slide tiles to match the target · ${moves} ${moves === 1 ? 'move' : 'moves'}`}
          </p>
        </div>

        {/* Target reference */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-xs text-[#9b86a8]" style={{ fontFamily: 'Nunito', fontWeight: 700, letterSpacing: '0.05em' }}>TARGET</span>
          <div className="grid grid-cols-3 gap-0.5 p-1 bg-[#F5F0FF] rounded-lg border border-[#E5DBF7]">
            {solvedArr.map((tile, i) => (
              <div key={i} className="sp-target-cell" style={{ visibility: tile ? 'visible' : 'hidden' }}>
                {tile}
              </div>
            ))}
          </div>
        </div>

        {/* The board — tiles positioned absolutely, keyed by content so they animate when they move */}
        <div className={`sp-board relative w-full aspect-square bg-[#F5F0FF] rounded-2xl border-2 border-[#E5DBF7] ${won ? 'won' : ''}`}>
          {board.map((tile, idx) => {
            if (tile === null) return null;
            const row = Math.floor(idx / 3);
            const col = idx % 3;
            return (
              <div key={tile}
                onClick={() => handleClick(idx)}
                className="sp-tile"
                style={{
                  transform: `translate(${col * 100}%, ${row * 100}%)`,
                  pointerEvents: (won || alreadySolved) ? 'none' : 'auto',
                }}>
                <div className="sp-tile-inner">
                  {tile}
                </div>
              </div>
            );
          })}
        </div>

        {alreadySolved && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 bg-white/80 px-4 py-2 rounded-full text-[#5D3F6A]"
                 style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
              <Check size={16} className="text-[#7DD3A8]" /> already solved today
            </div>
          </div>
        )}

        {won && !alreadySolved && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#FFF4C2] to-[#FFE2CE] px-4 py-2 rounded-full text-[#A8741D]"
                 style={{ fontFamily: 'Fredoka', fontWeight: 700 }}>
              <Sparkles size={16} /> solved! claim your reward
            </div>
          </div>
        )}
      </div>
    </div>
  );
}