
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import psycopg
from psycopg.rows import dict_row
import os
import logging
import traceback

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise Exception("DATABASE_URL not set")

def get_db():
    return psycopg.connect(DATABASE_URL)

def init_db():
    try:
        with get_db() as conn:
            with conn.cursor() as c:
                c.execute("""
                CREATE TABLE IF NOT EXISTS scores (
                    id SERIAL PRIMARY KEY,
                    callsign VARCHAR(50) NOT NULL,
                    avatar VARCHAR(20) DEFAULT '🚀',
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
            conn.commit()
        logging.info("DB Ready")
    except Exception as e:
        logging.error(f"DB init error: {e}")

@app.before_request
def before_request():
    if not hasattr(app, "db_initialized"):
        init_db()
        app.db_initialized = True

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route('/ads.txt')
def ads():
    return send_file('ads.txt')


@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/api/ping')
def ping():
    return jsonify({"ok": True})

@app.route('/api/debug')
def debug():
    try:
        with get_db() as conn:
            with conn.cursor() as c:
                c.execute("SELECT id, callsign, score, wave, kills FROM scores ORDER BY score DESC LIMIT 10")
                rows = c.fetchall()
        return jsonify({"rows": [{"id":r[0],"callsign":r[1],"score":r[2],"wave":r[3],"kills":r[4]} for r in rows]})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/run', methods=['POST'])
def save_run():
    try:
        data = request.json or {}
        callsign = str(data.get("callsign", "PILOT"))[:50]
        avatar   = str(data.get("avatar", "🚀"))[:20]
        score    = max(0, int(data.get("score", 0)))
        wave     = max(1, int(data.get("wave", 1)))
        kills    = max(0, int(data.get("kills", 0)))
        combo    = max(0, int(data.get("combo", 0)))
        coins    = max(0, int(data.get("coins", 0)))
        ship     = str(data.get("ship", ""))[:50]
        with get_db() as conn:
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
        logging.error(f"save_run error: {e}\n{traceback.format_exc()}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/player/<callsign>')
def get_player(callsign):
    try:
        with get_db() as conn:
            with conn.cursor(row_factory=dict_row) as c:
                c.execute("""
                    SELECT callsign, avatar,
                           MAX(score) as best_score,
                           MAX(wave)  as best_wave,
                           SUM(kills) as total_kills,
                           COUNT(*)   as games_played
                    FROM scores
                    WHERE callsign=%s
                    GROUP BY callsign, avatar
                """, (callsign,))
                row = c.fetchone()
                if not row:
                    return jsonify({"player": None})
                c.execute("""
                    SELECT COUNT(*) as cnt FROM (
                        SELECT callsign, MAX(score) as best_score
                        FROM scores GROUP BY callsign
                    ) ranked WHERE best_score > %s
                """, (row["best_score"],))
                rank_row = c.fetchone()
                rank = (rank_row["cnt"] + 1) if rank_row else 1
        player = dict(row)
        player["rank"] = rank
        return jsonify({"player": player})
    except Exception as e:
        logging.error(f"get_player error: {e}\n{traceback.format_exc()}")
        return jsonify({"player": None, "error": str(e)}), 500

@app.route('/api/leaderboard')
def leaderboard():
    try:
        limit = int(request.args.get("limit", 10))
        limit = max(1, min(100, limit))
        with get_db() as conn:
            with conn.cursor(row_factory=dict_row) as c:
                c.execute("""
                    SELECT callsign, avatar,
                           MAX(score) as best_score,
                           MAX(wave)  as best_wave,
                           SUM(kills) as total_kills,
                           COUNT(*)   as games_played
                    FROM scores
                    GROUP BY callsign, avatar
                    ORDER BY best_score DESC
                    LIMIT %s
                """, (limit,))
                rows = c.fetchall()
        board = []
        for i, r in enumerate(rows, 1):
            board.append({
                "rank":         i,
                "callsign":     r["callsign"],
                "avatar":       r["avatar"],
                "best_score":   r["best_score"],
                "best_wave":    r["best_wave"],
                "total_kills":  r["total_kills"],
                "games_played": r["games_played"],
            })
        return jsonify({"board": board})
    except Exception as e:
        logging.error(f"leaderboard error: {e}\n{traceback.format_exc()}")
        return jsonify({"board": [], "error": str(e)}), 500

@app.route('/api/stats')
def stats():
    try:
        with get_db() as conn:
            with conn.cursor() as c:
                c.execute("SELECT COUNT(DISTINCT callsign), COUNT(*), MAX(score) FROM scores")
                row = c.fetchone()
        return jsonify({
            "total_players": row[0] or 0,
            "total_games":   row[1] or 0,
            "top_score":     row[2] or 0,
        })
    except Exception as e:
        logging.error(e)
        return jsonify({}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)