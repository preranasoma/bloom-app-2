"""
Data endpoints — replaces all `supabase.from(...)` and `supabase.rpc(...)`
calls in the React frontend.

Every endpoint requires a valid JWT (via @require_auth) and operates on the
authenticated user attached to request.user_id. Multi-step writes wrap their
operations in a single SQLAlchemy session so they commit or roll back
atomically (the equivalent of the original Postgres SECURITY DEFINER RPCs).
"""

import json
from datetime import date, datetime
from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_

from extensions import db
from models import (
    User, Plant, Inventory, Quest, QuestProgress, ClaimedQuest,
    GardenLike, Transaction,
)
from auth import require_auth


bp = Blueprint('api', __name__, url_prefix='/api')


def _today() -> str:
    """ISO date string for today, used as the day-bucket key."""
    return date.today().isoformat()


def _log_txn(user_id, source, kind, coin_delta, meta=None):
    """Append a row to the transactions audit log."""
    db.session.add(Transaction(
        user_id=user_id,
        source=source,
        kind=kind,
        coin_delta=coin_delta,
        meta=json.dumps(meta) if meta is not None else None,
    ))


def _bump_quest_progress(user_id, track, amount=1):
    """Increment today's progress for a track (creates the row if absent)."""
    today = _today()
    row = QuestProgress.query.filter_by(
        user_id=user_id, date=today, track=track
    ).first()
    if row:
        row.value += amount
    else:
        db.session.add(QuestProgress(
            user_id=user_id, date=today, track=track, value=amount,
        ))


# ─── STATE: full snapshot used on app load ───────────────────────────

@bp.route('/state', methods=['GET'])
@require_auth
def get_state():
    """
    Returns the shape that the React frontend's loadGameState() expected:
        { userId, username, coins, plants, inventory, quests }
    Also registers today's daily-login quest (idempotent).
    """
    uid = request.user_id
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'error': 'user not found'}), 404

    today = _today()

    # Register daily login (no-op if already done today)
    login_row = QuestProgress.query.filter_by(
        user_id=uid, date=today, track='login'
    ).first()
    if not login_row:
        db.session.add(QuestProgress(
            user_id=uid, date=today, track='login', value=1,
        ))
        db.session.commit()

    plants    = Plant.query.filter_by(user_id=uid).order_by(Plant.planted_at).all()
    inventory = Inventory.query.filter_by(user_id=uid).all()
    progress  = QuestProgress.query.filter_by(user_id=uid, date=today).all()
    claimed   = ClaimedQuest.query.filter_by(user_id=uid, date=today).all()

    # Build the progress map (default zeros) and patch in live plant count.
    progress_map = {'login': 0, 'water': 0, 'fertilize': 0, 'shop': 0, 'plants': 0}
    for p in progress:
        progress_map[p.track] = p.value
    if not progress_map['login']:
        progress_map['login'] = 1   # reflect the insert we just did
    progress_map['plants'] = len(plants)

    like_count = GardenLike.query.filter_by(owner_id=uid).count()

    return jsonify({
        'userId':    uid,
        'username':  user.username,
        'coins':     user.coins,
        'likeCount': like_count,
        'plants':    [p.to_ui() for p in plants],
        'inventory': {row.item_id: row.count for row in inventory},
        'quests': {
            'date':     today,
            'progress': progress_map,
            'claimed':  [c.quest_id for c in claimed],
        },
    })


# ─── PLANTS ──────────────────────────────────────────────────────────

def _get_owned_plant(plant_id, user_id):
    """Fetch a plant, returning None if it doesn't exist or isn't this user's."""
    plant = db.session.get(Plant, plant_id)
    if not plant or plant.user_id != user_id:
        return None
    return plant


@bp.route('/plants/<plant_id>/water', methods=['POST'])
@require_auth
def water_plant(plant_id):
    uid = request.user_id
    plant = _get_owned_plant(plant_id, uid)
    if not plant:
        return jsonify({'error': 'plant not found'}), 404

    water_inv = Inventory.query.filter_by(user_id=uid, item_id='water').first()
    if not water_inv or water_inv.count < 1:
        return jsonify({'error': 'no water in inventory'}), 400

    plant.water_level = min(100, plant.water_level + 35)
    plant.growth      = min(100, plant.growth + 8)
    plant.last_watered = datetime.utcnow()
    water_inv.count -= 1
    _bump_quest_progress(uid, 'water', 1)
    db.session.commit()

    return jsonify({
        'plant': plant.to_ui(),
        'inventory_water': water_inv.count,
    })


@bp.route('/plants/<plant_id>/fertilize', methods=['POST'])
@require_auth
def fertilize_plant(plant_id):
    uid = request.user_id
    plant = _get_owned_plant(plant_id, uid)
    if not plant:
        return jsonify({'error': 'plant not found'}), 404

    fert_inv = Inventory.query.filter_by(user_id=uid, item_id='fertilizer').first()
    if not fert_inv or fert_inv.count < 1:
        return jsonify({'error': 'no fertilizer in inventory'}), 400

    plant.growth = min(100, plant.growth + 25)
    fert_inv.count -= 1
    _bump_quest_progress(uid, 'fertilize', 1)
    db.session.commit()

    return jsonify({
        'plant': plant.to_ui(),
        'inventory_fertilizer': fert_inv.count,
    })


@bp.route('/plants/<plant_id>', methods=['PATCH'])
@require_auth
def update_plant(plant_id):
    """Rename, repot, etc. Only certain fields are user-editable."""
    uid = request.user_id
    plant = _get_owned_plant(plant_id, uid)
    if not plant:
        return jsonify({'error': 'plant not found'}), 404

    data = request.get_json(silent=True) or {}
    if 'nickname' in data:
        nickname = (data['nickname'] or '').strip()[:64]
        if nickname:
            plant.nickname = nickname
    if 'pot' in data:
        plant.pot = data['pot']

    db.session.commit()
    return jsonify({'plant': plant.to_ui()})


# ─── QUESTS ──────────────────────────────────────────────────────────

@bp.route('/quests/bump', methods=['POST'])
@require_auth
def bump_quest():
    """Increment a quest track's progress (used by games on win)."""
    data = request.get_json(silent=True) or {}
    track  = data.get('track')
    amount = int(data.get('amount', 1))
    if not track:
        return jsonify({'error': 'track required'}), 400
    _bump_quest_progress(request.user_id, track, amount)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/quests/<quest_id>/claim', methods=['POST'])
@require_auth
def claim_quest(quest_id):
    """Atomic claim: validate progress, award coins, log transaction."""
    uid   = request.user_id
    today = _today()

    quest = db.session.get(Quest, quest_id)
    if not quest:
        return jsonify({'error': 'quest not found'}), 404

    already = ClaimedQuest.query.filter_by(
        user_id=uid, date=today, quest_id=quest_id
    ).first()
    if already:
        return jsonify({'error': 'already claimed'}), 409

    # The 'plants' track reads the live plant count; others read quest_progress.
    if quest.track == 'plants':
        progress = Plant.query.filter_by(user_id=uid).count()
    else:
        row = QuestProgress.query.filter_by(
            user_id=uid, date=today, track=quest.track
        ).first()
        progress = row.value if row else 0

    if progress < quest.goal:
        return jsonify({'error': 'goal not met'}), 400

    db.session.add(ClaimedQuest(user_id=uid, date=today, quest_id=quest_id))
    user = db.session.get(User, uid)
    user.coins += quest.reward
    _log_txn(uid, 'plant_game', 'reward', quest.reward, {'quest_id': quest_id})
    db.session.commit()

    return jsonify({'coins': user.coins})


# ─── SHOP / PURCHASE ─────────────────────────────────────────────────

# Mirrors PLANT_TYPES in App.jsx so the server is the source of truth for
# starting nicknames; we accept an optional `nickname` from the client too.
def _seed_plant_for(user_id, payload):
    plant = Plant(
        user_id=user_id,
        type=payload.get('plant') or 'sprout',
        nickname=payload.get('nickname') or 'New Sprout',
        water_level=60, growth=5,
        pot=payload.get('pot') or 'pink',
    )
    db.session.add(plant)
    db.session.flush()
    return plant.id


def _inc_inventory(user_id, item_id, delta=1):
    row = Inventory.query.filter_by(user_id=user_id, item_id=item_id).first()
    if row:
        row.count += delta
    else:
        db.session.add(Inventory(user_id=user_id, item_id=item_id, count=delta))


@bp.route('/shop/purchase', methods=['POST'])
@require_auth
def purchase_item():
    """
    Atomic purchase. Mirrors the public.purchase_item RPC:
      - validate coins
      - deduct coins
      - apply effect based on category
      - bump shop quest progress
      - log transaction
    """
    uid  = request.user_id
    data = request.get_json(silent=True) or {}

    category = data.get('category')
    item_id  = data.get('item_id')
    price    = int(data.get('price', -1))
    payload  = data.get('payload') or {}

    if not category or not item_id:
        return jsonify({'error': 'category and item_id required'}), 400
    if price < 0:
        return jsonify({'error': 'invalid price'}), 400

    user = db.session.get(User, uid)
    if user.coins < price:
        return jsonify({'error': 'insufficient coins'}), 400

    user.coins -= price
    plant_id = None

    if category == 'Supplies':
        if item_id == 'rain_cloud':
            # Special effect: water ALL plants to full, +5 growth.
            for plant in Plant.query.filter_by(user_id=uid).all():
                plant.water_level = 100
                plant.growth = min(100, plant.growth + 5)
        else:
            _inc_inventory(uid, item_id, 1)
    elif category == 'Pots':
        color = payload.get('color', 'pink')
        _inc_inventory(uid, f'pot_{color}', 1)
    elif category == 'Seeds':
        plant_id = _seed_plant_for(uid, payload)
    else:
        return jsonify({'error': f'unknown category: {category}'}), 400

    _bump_quest_progress(uid, 'shop', 1)
    _log_txn(uid, 'plant_game', 'purchase', -price,
             {'category': category, 'item_id': item_id})
    db.session.commit()

    return jsonify({'coins': user.coins, 'plant_id': plant_id})


# ─── LEADERBOARD ─────────────────────────────────────────────────────

@bp.route('/leaderboard', methods=['GET'])
def leaderboard():
    """Top 10 users by plant count. Public — no auth required."""
    q = (
        db.session.query(
            User.id,
            User.username,
            User.coins,
            func.count(Plant.id).label('plant_count'),
        )
        .outerjoin(Plant, Plant.user_id == User.id)
        .group_by(User.id, User.username, User.coins)
        .order_by(func.count(Plant.id).desc(), User.username.asc())
        .limit(10)
    )
    rows = [
        {'id': r.id, 'username': r.username, 'coins': r.coins, 'plant_count': r.plant_count}
        for r in q.all()
    ]
    return jsonify(rows)


# ─── USERS / FRIENDS ─────────────────────────────────────────────────

@bp.route('/users/search', methods=['GET'])
@require_auth
def search_users():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify([])

    rows = (
        User.query
        .filter(User.username.ilike(f'%{q}%'))
        .filter(User.id != request.user_id)
        .limit(10)
        .all()
    )
    return jsonify([
        {'id': u.id, 'username': u.username, 'coins': u.coins}
        for u in rows
    ])


@bp.route('/users/<user_id>/garden', methods=['GET'])
@require_auth
def get_garden(user_id):
    """Plants for another user + like info from the viewer's perspective."""
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'error': 'user not found'}), 404

    plants     = Plant.query.filter_by(user_id=user_id).order_by(Plant.planted_at).all()
    like_count = GardenLike.query.filter_by(owner_id=user_id).count()
    liked      = GardenLike.query.filter_by(
        owner_id=user_id, liker_id=request.user_id
    ).first() is not None

    return jsonify({
        'user':       {'id': target.id, 'username': target.username, 'coins': target.coins},
        'plants':     [p.to_ui() for p in plants],
        'like_count': like_count,
        'liked_by_me': liked,
    })


# ─── GARDEN LIKES ────────────────────────────────────────────────────

@bp.route('/users/<owner_id>/like', methods=['POST'])
@require_auth
def like_garden(owner_id):
    if owner_id == request.user_id:
        return jsonify({'error': "can't like your own garden"}), 400
    existing = GardenLike.query.filter_by(
        owner_id=owner_id, liker_id=request.user_id
    ).first()
    if existing:
        return jsonify({'ok': True, 'liked': True})  # idempotent
    db.session.add(GardenLike(owner_id=owner_id, liker_id=request.user_id))
    db.session.commit()
    count = GardenLike.query.filter_by(owner_id=owner_id).count()
    return jsonify({'ok': True, 'liked': True, 'like_count': count})


@bp.route('/users/<owner_id>/like', methods=['DELETE'])
@require_auth
def unlike_garden(owner_id):
    existing = GardenLike.query.filter_by(
        owner_id=owner_id, liker_id=request.user_id
    ).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    count = GardenLike.query.filter_by(owner_id=owner_id).count()
    return jsonify({'ok': True, 'liked': False, 'like_count': count})


# ─── GIFTS ───────────────────────────────────────────────────────────

@bp.route('/users/<to_user_id>/gift', methods=['POST'])
@require_auth
def send_gift(to_user_id):
    """Transfer one of an item from the sender's inventory to the recipient's."""
    uid  = request.user_id
    data = request.get_json(silent=True) or {}
    item_id = data.get('item_id')
    if not item_id:
        return jsonify({'error': 'item_id required'}), 400
    if to_user_id == uid:
        return jsonify({'error': "can't gift to yourself"}), 400

    recipient = db.session.get(User, to_user_id)
    if not recipient:
        return jsonify({'error': 'recipient not found'}), 404

    sender_inv = Inventory.query.filter_by(user_id=uid, item_id=item_id).first()
    if not sender_inv or sender_inv.count < 1:
        return jsonify({'error': f'you do not have {item_id}'}), 400

    sender_inv.count -= 1
    _inc_inventory(to_user_id, item_id, 1)
    _log_txn(uid,          'plant_game', 'trade',    0, {'gift_to':   to_user_id, 'item_id': item_id})
    _log_txn(to_user_id,   'plant_game', 'delivery', 0, {'gift_from': uid,        'item_id': item_id})
    db.session.commit()

    return jsonify({'ok': True})
