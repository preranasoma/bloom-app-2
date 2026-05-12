# bloom — frontend + Flask backend

This app now uses a React frontend and a Flask backend instead of the previous direct Supabase integration.

## Frontend

```bash
npm install
cp .env.example .env.local
# edit VITE_API_URL if needed
npm run dev
```

The frontend expects the backend at `http://localhost:5001` by default.

## Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Backend health check:

```bash
curl http://localhost:5001/api/health
```

## What changed

- Auth now uses `/api/auth/signup`, `/api/auth/login`, and local JWT storage.
- Garden state loads from `/api/state`.
- Plant updates, purchases, quest claims, leaderboard, friend search, likes, and gifts now go through Flask endpoints.
- The old Supabase client file was replaced by `src/api.js`, which acts as the frontend API layer.

## Important note

Realtime Supabase subscriptions were removed in this integration pass. The app now refreshes from explicit API calls after actions instead of live database subscriptions.

## Sprout Express (mini-game)

The `Sprout_Express/` folder contains the standalone Phaser game. `src/games/SproutExpress.jsx` embeds it as a React component inside the Bloom app.

### Latest updates

- **Sound effect** — a bing plays on successful delivery (`public/assets/Audio/bing_1.wav`).
- **Collision system** — player can no longer walk through trees, houses, or into the water; the physics body is trimmed to the character's feet for natural movement.
- **Camera zoom** — increased from 2× to 3× for a closer view.
- **New assets** — `public/assets/Audio/` folder added; `pixelFont-7-8x14-sproutLands.ttf` added to tilesets.

### Controls

| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move |
| Q | Switch between hoe & watering can |
| E | Use current tool on nearby crop |
| Space / Enter | Deliver crop when near a house |
| R (game over screen) | Restart |
