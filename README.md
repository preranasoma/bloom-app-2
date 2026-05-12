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
