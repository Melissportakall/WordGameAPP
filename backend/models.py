# Veritabanı Tabloları
import enum
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


def init_db(app):
    with app.app_context():
        db.create_all()


class GameMode(enum.Enum):
    TWO_MIN = "TWO_MIN"
    FIVE_MIN = "FIVE_MIN"
    TWELVE_HOUR = "TWELVE_HOUR"
    TWENTYFOUR_HOUR = "TWENTYFOUR_HOUR"


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(80), nullable=False)
    total_points = db.Column(db.Integer, nullable=False)


class Game(db.Model):
    __tablename__ = 'game'
    id = db.Column(db.Integer, primary_key=True)
    user1 = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user2 = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reward_punishment_board = db.Column(db.JSON, nullable=False)
    game_board = db.Column(db.JSON, nullable=False)
    score1 = db.Column(db.Integer, default=0)
    score2 = db.Column(db.Integer, default=0)
    turn_order = db.Column(db.Integer)
    remaining_letters = db.Column(db.JSON, nullable=False)
    gamemode = db.Column(db.Enum(GameMode), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='active')
    remaining_time = db.Column(db.DateTime, nullable=False)
    user1_letters = db.Column(db.JSON, nullable=False)
    user2_letters = db.Column(db.JSON, nullable=False)
    user1_rewards = db.Column(db.JSON, nullable=True, default=lambda: [])
    user2_rewards = db.Column(db.JSON, nullable=True, default=lambda: [])
    hidden_board = db.Column(db.JSON, nullable=False)
    winner = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    user1_pass = db.Column(db.Integer, nullable=False, default=0)
    user2_pass = db.Column(db.Integer, nullable=False, default=0)
