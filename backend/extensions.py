"""
Shared SQLAlchemy instance.

Kept in its own module so models.py and auth.py can both import it
without creating a circular import with app.py.
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
