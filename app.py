from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
import os
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

# ---------------- DATABASE ---------------- #

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("DATABASE_URL not set")

db_pool = ConnectionPool(conninfo=DATABASE_URL)

def get_db():
    return db_pool.getconn()

def return_db(conn):
    db_pool.putconn(conn)

def init_db():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as c:

            c.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                id SERIAL PRIMARY KEY,
                callsign VARCHAR(50) NOT NULL,
                avatar VARCHAR(10) DEFAULT '🚀',
                score INTEGER DEFAULT 0,
                wave INTEGER DEFAULT 1,
                kills INTEGER DEFAULT 0,
                combo INTEGER DEFAULT 0,
                coins INTEGER DEFAULT 0,
                ship VARCHAR(50) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            c.execute("CREATE INDEX IF NOT EXISTS idx_callsign ON scores(callsign);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_score ON scores(score DESC);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON scores(created_at);")

        conn.commit()
        logging.info("DB Ready")

    except Exception as e:
        logging.error(f"DB init error: {e}")
    finally:
        if conn:
            return_db(conn)

# Init DB on first request (safe for Render)
@app.before_request
def before_request():
    if not hasattr(app, "db_initialized"):
        init_db()
        app.db_initialized = True

# ---------------- ROUTES ---------------- #

@app.route('/')
def home():
    return render_template('index.html')


@app.route('/api/ping')
def ping():
    return jsonify({"ok": True})


@app.route('/api/run', methods=['POST'])
def save_run():
    conn = None
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

        with conn.cursor() as c:
            c.execute("SELECT MAX(score) FROM scores WHERE callsign=%s", (callsign,))
            prev_best = c.fetchone()[0] or 0

            new_best = score > prev_best

            c.execute("""
                INSERT INTO scores (callsign, avatar, score, wave, kills, combo, coins, ship)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """, (callsign, avatar, score, wave, kills, combo, coins, ship))

        conn.commit()

        return jsonify({"status": "ok", "new_best": new_best})

    except Exception as e:
        logging.error(f"save_run error: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        if conn:
            return_db(conn)


@app.route('/api/player/<callsign>')
def get_player(callsign):
    conn = None
    try:
        conn = get_db()

        with conn.cursor(row_factory=dict_row) as c:
            c.execute("""
                SELECT callsign, avatar,
                       MAX(score) as best_score,
                       MAX(wave) as best_wave,
                       SUM(kills) as total_kills,
                       COUNT(*) as games_played
                FROM scores
                WHERE callsign=%s
                GROUP BY callsign
            """, (callsign,))

            row = c.fetchone()

        if not row:
            return jsonify({"player": None})

        return jsonify({"player": row})

    except Exception as e:
        logging.error(e)
        return jsonify({"player": None}), 500
    finally:
        if conn:
            return_db(conn)


@app.route('/api/leaderboard')
def leaderboard():
    conn = None
    try:
        limit = int(request.args.get("limit", 10))
        limit = max(1, min(100, limit))

        conn = get_db()

        with conn.cursor(row_factory=dict_row) as c:
            c.execute("""
                SELECT callsign, avatar,
                       MAX(score) as best_score
                FROM scores
                GROUP BY callsign
                ORDER BY best_score DESC
                LIMIT %s
            """, (limit,))

            rows = c.fetchall()

        board = []
        for i, r in enumerate(rows, 1):
            board.append({
                "rank": i,
                "callsign": r["callsign"],
                "avatar": r["avatar"],
                "best_score": r["best_score"]
            })

        return jsonify({"board": board})

    except Exception as e:
        logging.error(e)
        return jsonify({"board": []}), 500
    finally:
        if conn:
            return_db(conn)


@app.route('/api/stats')
def stats():
    conn = None
    try:
        conn = get_db()

        with conn.cursor() as c:
            c.execute("SELECT COUNT(DISTINCT callsign), COUNT(*), MAX(score) FROM scores")
            row = c.fetchone()

        return jsonify({
            "total_players": row[0] or 0,
            "total_games": row[1] or 0,
            "top_score": row[2] or 0
        })

    except Exception as e:
        logging.error(e)
        return jsonify({}), 500
    finally:
        if conn:
            return_db(conn)


# ---------------- RUN ---------------- #

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
