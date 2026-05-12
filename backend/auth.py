"""
Authentication routes.

Endpoints:
  POST /api/auth/signup   { email, password, username? } -> { token, user }
  POST /api/auth/login    { email, password }             -> { token, user }
  GET  /api/auth/me       Authorization: Bearer <token>   -> { user }
  POST /api/auth/logout                                   -> { ok: true }

Password storage:
  - Plaintext passwords are NEVER stored.
  - On signup, bcrypt.gensalt() generates a fresh random salt per user.
  - bcrypt.hashpw() runs the Blowfish-based KDF over (password + salt) with
    a configurable work factor (12 rounds = ~100ms per hash on modern
    hardware) and embeds the salt into the resulting hash string.
  - On login, bcrypt.checkpw() re-hashes the submitted password with the
    stored salt and compares hashes in constant time (timing-attack safe).

JWT auth:
  - On successful signup/login, we sign a JWT containing the user id.
  - Client stores it (e.g. in localStorage) and sends it as
    `Authorization: Bearer <token>` on subsequent requests.
  - The require_auth decorator validates the token and attaches
    request.user_id so route handlers can use it directly.
"""

import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from extensions import db
from models import User, Plant, Inventory


bp = Blueprint('auth', __name__, url_prefix='/api/auth')

JWT_SECRET   = os.environ.get('JWT_SECRET', 'dev-secret-change-me-in-production')
JWT_ALG      = 'HS256'
JWT_EXP_DAYS = 7


# ─── Password hashing ────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt (per-user random salt)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time comparison of a plaintext password against its hash."""
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# ─── JWT helpers ─────────────────────────────────────────────────────

def make_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def require_auth(fn):
    """Decorator: rejects requests without a valid Bearer token."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'missing or malformed Authorization header'}), 401
        token = auth_header.split(' ', 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'invalid or expired token'}), 401
        request.user_id = payload['sub']
        return fn(*args, **kwargs)
    return wrapper


# ─── Starter data (mirrors the Postgres on_auth_user_created trigger) ─

def create_starter_data(user_id: str):
    db.session.add(Plant(
        user_id=user_id, type='sprout', nickname='Mochi',
        water_level=70, growth=20, pot='pink',
    ))
    db.session.add(Inventory(user_id=user_id, item_id='water',      count=2))
    db.session.add(Inventory(user_id=user_id, item_id='fertilizer', count=1))


# ─── Routes ──────────────────────────────────────────────────────────

@bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json(silent=True) or {}
    email    = (data.get('email')    or '').strip().lower()
    password =  data.get('password') or ''
    username = (data.get('username') or '').strip()

    if not email or not password:
        return jsonify({'error': 'email and password required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'password must be at least 6 characters'}), 400
    if not username:
        username = 'gardener_' + uuid.uuid4().hex[:6]

    existing = User.query.filter(or_(User.email == email, User.username == username)).first()
    if existing:
        return jsonify({'error': 'email or username already taken'}), 409

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
    )
    db.session.add(user)
    db.session.flush()           # populates user.id before related rows
    create_starter_data(user.id)
    db.session.commit()

    token = make_token(user.id)
    return jsonify({'token': token, 'user': user.to_public_dict()})


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email    = (data.get('email')    or '').strip().lower()
    password =  data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'email and password required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({'error': 'invalid credentials'}), 401

    token = make_token(user.id)
    return jsonify({'token': token, 'user': user.to_public_dict()})


@bp.route('/me', methods=['GET'])
@require_auth
def me():
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({'error': 'user not found'}), 404
    return jsonify({'user': user.to_public_dict()})


@bp.route('/logout', methods=['POST'])
def logout():
    # JWTs are stateless — "logout" just means the client discards its token.
    # For server-side revocation we'd add a denylist table; not needed here.
    return jsonify({'ok': True})
