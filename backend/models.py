"""
SQLAlchemy models — translated from the original Postgres/Supabase schema.

Each model corresponds to one table. UUIDs are stored as 36-char strings
so the same models work for both SQLite (dev) and Postgres (prod).
"""

import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, Index

from extensions import db


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(db.Model):
    """Replaces Supabase's auth.users + public.profiles, combined."""
    __tablename__ = 'users'

    id            = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    username      = db.Column(db.String(64),  unique=True, nullable=False)
    email         = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(60),  nullable=False)  # bcrypt hashes are 60 chars
    coins         = db.Column(db.Integer,     nullable=False, default=80)
    created_at    = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow)

    plants    = db.relationship('Plant',     backref='user', cascade='all, delete-orphan')
    inventory = db.relationship('Inventory', backref='user', cascade='all, delete-orphan')

    def to_public_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'coins': self.coins,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Plant(db.Model):
    __tablename__ = 'plants'
    __table_args__ = (
        CheckConstraint('water_level >= 0 AND water_level <= 100', name='plants_water_range'),
        CheckConstraint('growth >= 0 AND growth <= 100',           name='plants_growth_range'),
        Index('plants_user_idx', 'user_id'),
    )

    id           = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id      = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type         = db.Column(db.String(64),  nullable=False)
    nickname     = db.Column(db.String(64),  nullable=False)
    water_level  = db.Column(db.Integer, nullable=False, default=60)
    growth       = db.Column(db.Integer, nullable=False, default=5)
    pot          = db.Column(db.String(32),  nullable=False, default='pink')
    planted_at   = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_watered = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_ui(self):
        """Reshape into the camelCase shape the React frontend expects."""
        return {
            'id': self.id,
            'type': self.type,
            'nickname': self.nickname,
            'waterLevel': self.water_level,
            'growth': self.growth,
            'pot': self.pot,
            'planted': self.planted_at.isoformat() if self.planted_at else None,
        }


class Inventory(db.Model):
    __tablename__ = 'inventory'
    __table_args__ = (
        CheckConstraint('count >= 0', name='inventory_count_non_negative'),
    )

    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    item_id = db.Column(db.String(64), primary_key=True)
    count   = db.Column(db.Integer, nullable=False, default=0)


class Quest(db.Model):
    """Static catalog of quests — seeded at startup."""
    __tablename__ = 'quests'

    id          = db.Column(db.String(64),  primary_key=True)
    name        = db.Column(db.String(128), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    track       = db.Column(db.String(32),  nullable=False)
    goal        = db.Column(db.Integer, nullable=False)
    reward      = db.Column(db.Integer, nullable=False)


class QuestProgress(db.Model):
    __tablename__ = 'quest_progress'

    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    date    = db.Column(db.String(10), primary_key=True)  # ISO date 'YYYY-MM-DD'
    track   = db.Column(db.String(32), primary_key=True)
    value   = db.Column(db.Integer, nullable=False, default=0)


class ClaimedQuest(db.Model):
    __tablename__ = 'claimed_quests'

    user_id  = db.Column(db.String(36), db.ForeignKey('users.id',  ondelete='CASCADE'), primary_key=True)
    date     = db.Column(db.String(10), primary_key=True)
    quest_id = db.Column(db.String(64), db.ForeignKey('quests.id'), primary_key=True)


class Trade(db.Model):
    __tablename__ = 'trades'
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name='trade_status_valid'),
        Index('trades_inbox_idx', 'to_user'),
    )

    id         = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    from_user  = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    to_user    = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    plant_id   = db.Column(db.String(36), db.ForeignKey('plants.id', ondelete='CASCADE'))
    status     = db.Column(db.String(16),  nullable=False, default='pending')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class GardenLike(db.Model):
    """A user 'liked' another user's garden. (owner_id, liker_id) is the natural key."""
    __tablename__ = 'garden_likes'

    owner_id   = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    liker_id   = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Transaction(db.Model):
    """Audit log of coin/inventory changes."""
    __tablename__ = 'transactions'
    __table_args__ = (
        Index('transactions_user_idx', 'user_id', 'created_at'),
    )

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id    = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    source     = db.Column(db.String(32), nullable=False)   # 'plant_game' | 'map_game'
    kind       = db.Column(db.String(32), nullable=False)   # 'reward' | 'purchase' | 'trade' | 'delivery'
    coin_delta = db.Column(db.Integer, nullable=False, default=0)
    meta       = db.Column(db.Text)                          # JSON-encoded
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
