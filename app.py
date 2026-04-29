from flask import Flask, send_file, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.ERROR)

DB_PATH = os.environ.get("DB_PATH", "game.db")

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            callsign    TEXT,
            avatar      TEXT DEFAULT '🚀',
            score       INTEGER DEFAULT 0,
            wave        INTEGER DEFAULT 1,
            kills       INTEGER DEFAULT 0,
            combo       INTEGER DEFAULT 0,
            coins       INTEGER DEFAULT 0,
            ship        TEXT DEFAULT '',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        logging.error(f"DB init error: {e}")

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def home():
    return send_file('templates/index.html')

@app.route('/api/ping')
def ping():
    return jsonify({"ok": True})

@app.route('/api/run', methods=['POST'])
def save_run():
    try:
        data = request.json or {}
        
        callsign = str(data.get("callsign", "PILOT"))[:50]
        avatar = str(data.get("avatar", "🚀"))[:10]
        score = max(0, int(data.get("score", 0)))
        wave = max(1, int(data.get("wave", 1)))
        kills = max(0, int(data.get("kills", 0)))
        combo = max(0, int(data.get("combo", 0)))
        coins = max(0, int(data.get("coins", 0)))
        ship = str(data.get("ship", ""))[:50]

        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("SELECT MAX(score) as best FROM scores WHERE callsign = ?", (callsign,))
            row = c.fetchone()
            prev_best = row["best"] if row and row["best"] else 0
            new_best = score > prev_best

            c.execute("""
                INSERT INTO scores (callsign, avatar, score, wave, kills, combo, coins, ship)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (callsign, avatar, score, wave, kills, combo, coins, ship))
            conn.commit()
            return jsonify({"status": "ok", "new_best": new_best})
        finally:
            conn.close()
    except ValueError:
        return jsonify({"status": "error"}), 400
    except Exception as e:
        logging.error(f"save_run error: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/api/player/<callsign>')
def get_player(callsign):
    try:
        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT
                    callsign,
                    avatar,
                    MAX(score)  as best_score,
                    MAX(wave)   as best_wave,
                    SUM(kills)  as total_kills,
                    COUNT(*)    as games_played
                FROM scores
                WHERE callsign = ?
                GROUP BY callsign
            """, (callsign,))

            row = c.fetchone()
            
            if not row:
                return jsonify({"player": None})

            c.execute("""
                SELECT COUNT(DISTINCT callsign) + 1 as rnk
                FROM (
                    SELECT callsign, MAX(score) as best_score
                    FROM scores
                    GROUP BY callsign
                ) t
                WHERE best_score > (
                    SELECT MAX(score) FROM scores WHERE callsign = ?
                )
            """, (callsign,))
            rank_row = c.fetchone()

            return jsonify({
                "player": {
                    "callsign": row["callsign"],
                    "avatar": row["avatar"] or "🚀",
                    "best_score": row["best_score"] or 0,
                    "best_wave": row["best_wave"] or 1,
                    "total_kills": row["total_kills"] or 0,
                    "games_played": row["games_played"] or 0,
                    "rank": rank_row["rnk"] if rank_row else None,
                }
            })
        finally:
            conn.close()
    except Exception as e:
        logging.error(f"get_player error: {e}")
        return jsonify({"player": None}), 500

@app.route('/api/leaderboard')
def leaderboard():
    try:
        try:
            limit = max(1, min(100, int(request.args.get("limit", 10))))
        except ValueError:
            limit = 10

        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT
                    callsign,
                    avatar,
                    MAX(score)  as best_score,
                    MAX(wave)   as best_wave,
                    SUM(kills)  as total_kills,
                    COUNT(*)    as games_played
                FROM scores
                GROUP BY callsign
                ORDER BY best_score DESC
                LIMIT ?
            """, (limit,))

            rows = c.fetchall()

            board = [
                {
                    "rank": rank,
                    "callsign": r["callsign"],
                    "avatar": r["avatar"] or "🚀",
                    "best_score": r["best_score"] or 0,
                    "best_wave": r["best_wave"] or 1,
                    "total_kills": r["total_kills"] or 0,
                    "games_played": r["games_played"] or 0,
                }
                for rank, r in enumerate(rows, 1)
            ]

            return jsonify({"board": board})
        finally:
            conn.close()
    except Exception as e:
        logging.error(f"leaderboard error: {e}")
        return jsonify({"board": []}), 500

@app.route('/api/stats')
def stats():
    try:
        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("SELECT COUNT(DISTINCT callsign), COUNT(*), MAX(score) FROM scores")
            row = c.fetchone()

            return jsonify({
                "total_players": row[0] or 0,
                "total_games": row[1] or 0,
                "top_score": row[2] or 0,
            })
        finally:
            conn.close()
    except Exception as e:
        logging.error(f"stats error: {e}")
        return jsonify({"total_players": 0, "total_games": 0, "top_score": 0}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
