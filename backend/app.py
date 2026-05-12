"""
Flask app entry.

Local dev:   python app.py            (http://localhost:5001)
Production:  gunicorn app:app --bind 0.0.0.0:$PORT
"""

import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.engine import Engine

load_dotenv()  # read .env into os.environ

from extensions import db


def create_app():
    app = Flask(__name__)

    # ─── Database ────────────────────────────────────────────────
    # DATABASE_URL can be sqlite:///bloom.db (local) or postgresql://… (Render).
    db_url = os.environ.get('DATABASE_URL', 'sqlite:///bloom.db')
    # Render-style "postgres://" needs to be normalized for SQLAlchemy 2.x.
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI']        = db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    # SQLite doesn't enforce foreign keys unless you ask it to.
    if db_url.startswith('sqlite'):
        @event.listens_for(Engine, 'connect')
        def _enable_sqlite_fks(dbapi_conn, conn_record):
            cur = dbapi_conn.cursor()
            cur.execute('PRAGMA foreign_keys=ON')
            cur.close()

    # ─── CORS ────────────────────────────────────────────────────
    origins = [o.strip() for o in os.environ.get(
        'CORS_ORIGINS', 'http://localhost:5173'
    ).split(',')]
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=False)

    # ─── Blueprints ──────────────────────────────────────────────
    from auth import bp as auth_bp
    from routes import bp as api_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    @app.route('/api/health')
    def health():
        return jsonify({'ok': True, 'service': 'bloom-backend'})

    # ─── Initialize schema + seed catalog ────────────────────────
    with app.app_context():
        db.create_all()
        seed_quests()

    return app


def seed_quests():
    """Insert the static quests catalog if it's empty."""
    from models import Quest

    seed = [
        ('login',         'Daily Visitor',   'Visit your garden today', 'login',     1, 20),
        ('water_3',       'Hydration Hero',  'Water 3 plants',          'water',     3, 50),
        ('fert_1',        'Growth Spurt',    'Use fertilizer once',     'fertilize', 1, 30),
        ('shop_1',        'Garden Shopper',  'Buy something',           'shop',      1, 25),
        ('plants_5',      'Green Thumb',     'Have 5 plants total',     'plants',    5, 100),

        ('memory_match',  'Memory Match',    'Complete the memory game', 'puzzle',   1, 75),
        ('flower_wordle', 'Flower Wordle',   'Complete Flower Wordle',   'wordle',   1, 90),
        ('slide_puzzle',  'Slide Puzzle',    'Complete the slide puzzle','slide',    1, 85),
    ]

    for qid, name, desc, track, goal, reward in seed:
        if not db.session.get(Quest, qid):
            db.session.add(
                Quest(
                    id=qid,
                    name=name,
                    description=desc,
                    track=track,
                    goal=goal,
                    reward=reward,
                )
            )

    db.session.commit()


app = create_app()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
