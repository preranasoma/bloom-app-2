import { useMemo, useState } from 'react';

const WORDS = ['TULIP', 'ROSES', 'LILAC', 'DAISY', 'BLOOM', 'FERNS'];

// hello
//hello
export default function WordleFlowers({ open, alreadySolved, onClose, onWin }) {
  const answer = useMemo(() => {
    const today = new Date();
    return WORDS[today.getDate() % WORDS.length];
  }, []);

  const [guesses, setGuesses] = useState([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');

  if (!open) return null;

  const submitGuess = () => {
    const guess = text.toUpperCase();

    if (alreadySolved) {
      setMessage('already solved today ✨');
      return;
    }

    if (guess.length !== 5) {
      setMessage('enter a 5-letter flower word 🌸');
      return;
    }

    const nextGuesses = [...guesses, guess];
    setGuesses(nextGuesses);
    setText('');

    if (guess === answer) {
      setMessage('you got it! 🌷');
      setTimeout(() => onWin(nextGuesses.length), 700);
      return;
    }

    if (nextGuesses.length >= 6) {
      setMessage(`answer was ${answer}`);
    } else {
      setMessage('try again!');
    }
  };

  const tileClass = (letter, index) => {
    if (!letter) return 'bg-[#FFF4F8]';
    if (answer[index] === letter) return 'bg-[#B8E8D0]';
    if (answer.includes(letter)) return 'bg-[#FFF4C2]';
    return 'bg-[#E8E0F0]';
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-md border-4 border-[#F0DDE8] shadow-xl pop-in">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'Caveat', fontSize: '2rem', color: '#5D3F6A', lineHeight: 1 }}>
            🌸 Flower Wordle
          </h2>

          <button
            onClick={onClose}
            className="text-[#9b86a8] hover:text-[#5D3F6A] text-2xl"
            type="button"
          >
            ×
          </button>
        </div>

        <p className="text-center text-sm text-[#9b86a8] mb-4" style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
          Guess today&apos;s 5-letter plant word in 6 tries.
        </p>

        <div className="space-y-2 mb-4">
          {Array.from({ length: 6 }).map((_, row) => {
            const guess = guesses[row] || '';

            return (
              <div key={row} className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, index) => {
                  const letter = guess[index] || '';

                  return (
                    <div
                      key={index}
                      className={`h-12 rounded-xl flex items-center justify-center border-2 border-[#F0DDE8] ${tileClass(letter, index)}`}
                      style={{ fontFamily: 'Fredoka', fontWeight: 700, color: '#5D3F6A', fontSize: '1.1rem' }}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {!alreadySolved && guesses.length < 6 && (
          <>
            <input
              value={text}
              maxLength={5}
              onChange={(e) => setText(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitGuess();
              }}
              placeholder="TULIP"
              className="w-full px-4 py-3 rounded-2xl bg-[#FFF4F8] border-2 border-[#F0DDE8] outline-none mb-3 text-center"
              style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#5D3F6A' }}
            />

            <button
              onClick={submitGuess}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF9CB8] to-[#FF6B9D] text-white shadow-[0_3px_0_#D54C7E] hover:translate-y-[-1px] transition"
              style={{ fontFamily: 'Fredoka', fontWeight: 700 }}
              type="button"
            >
              Guess 🌷
            </button>
          </>
        )}

        {alreadySolved && (
          <p className="text-center text-[#7a8a5a]" style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
            already solved today ✨
          </p>
        )}

        {message && (
          <p className="text-center mt-3 text-[#9b6bb5]" style={{ fontFamily: 'Nunito', fontWeight: 700 }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}