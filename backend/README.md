# Bloom Backend (Flask + SQLAlchemy)

## Local setup

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit JWT_SECRET
python app.py
```

Server runs at <http://localhost:5001>. `bloom.db` is created on first run.

Quick smoke test:

```bash
curl http://localhost:5001/api/health
# → {"ok": true, "service": "bloom-backend"}
```

## Auth endpoints

| Method | Path | Body / Headers | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password, username? }` | `{ token, user }` |
| POST | `/api/auth/login`  | `{ email, password }` | `{ token, user }` |
| GET  | `/api/auth/me`     | `Authorization: Bearer <token>` | `{ user }` |
| POST | `/api/auth/logout` | — | `{ ok: true }` |

## How passwords are stored

Plaintext passwords are **never** stored. The flow:

1. **Signup**: `bcrypt.gensalt(rounds=12)` generates a fresh 16-byte random
   salt. `bcrypt.hashpw(password + salt)` runs the Blowfish-based key
   derivation function with 2¹² = 4,096 iterations (~100ms on modern
   hardware, intentionally slow to resist brute-force attacks). The
   resulting 60-char hash string (which contains the salt) is stored in
   `users.password_hash`.

2. **Login**: `bcrypt.checkpw(submitted_password, stored_hash)` extracts
   the salt from the stored hash, re-runs bcrypt over the submitted
   password with that salt, and compares the result to the stored hash
   in **constant time** (resistant to timing attacks).

3. **Salt uniqueness**: every user gets a different salt, so even users
   who chose the same password have different stored hashes — a leaked
   database can't be cracked with rainbow tables.

See `auth.py:hash_password()` and `auth.py:verify_password()`.

## File layout

```
backend/
├── app.py            # Flask app factory, DB init, blueprint registration
├── extensions.py     # SQLAlchemy db instance (separate to avoid circular imports)
├── models.py         # User, Plant, Inventory, Quest, …
├── auth.py           # /api/auth/* routes + bcrypt + JWT helpers
├── requirements.txt
├── .env.example
└── README.md
```

## Deploying to Render

1. Push to GitHub.
2. New → Web Service → connect repo, set Root Directory to `backend/`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`
5. Add env vars: `JWT_SECRET`, `CORS_ORIGINS` (your Vercel URL).
6. Add a Postgres database (free tier) and link it — Render will inject
   `DATABASE_URL` automatically.
