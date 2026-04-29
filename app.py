from flask import Flask, send_file, request, jsonify
import sqlite3
import os

app = Flask(__name__)

# ---------- DATABASE ----------
def init_db():
    conn = sqlite3.connect("game.db")
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

init_db()

def get_db():
    conn = sqlite3.connect("game.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

# ---------- ROUTES ----------
@app.route('/')
def home():
    return send_file('templates/index.html')  

# ── Ping ──
@app.route('/api/ping')
def ping():
    return jsonify({"ok": True})

# ── Save run ──
@app.route('/api/run', methods=['POST'])
def save_run():
    data = request.json or {}

    callsign = data.get("callsign", "PILOT")
    avatar   = data.get("avatar", "🚀")
    score    = int(data.get("score", 0))
    wave     = int(data.get("wave", 1))
    kills    = int(data.get("kills", 0))
    combo    = int(data.get("combo", 0))
    coins    = int(data.get("coins", 0))
    ship     = data.get("ship", "")

    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT MAX(score) as best FROM scores WHERE callsign = ?", (callsign,))
    row = c.fetchone()
    prev_best = row["best"] if row["best"] else 0
    new_best = score > prev_best

    c.execute("""
        INSERT INTO scores (callsign, avatar, score, wave, kills, combo, coins, ship)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (callsign, avatar, score, wave, kills, combo, coins, ship))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok", "new_best": new_best})

# ── Legacy save ──
@app.route('/save_score', methods=['POST'])
def save_score():
    data = request.json or {}
    player = data.get("player", "player1")
    score  = int(data.get("score", 0))

    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO scores (callsign, score) VALUES (?, ?)", (player, score))
    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})

# ── Player profile ──
@app.route('/api/player/<callsign>')
def get_player(callsign):
    conn = get_db()
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
    conn.close()

    if not row:
        return jsonify({"player": None})

    # rank calc
    conn2 = get_db()
    c2 = conn2.cursor()
    c2.execute("""
        SELECT COUNT(*) + 1 as rnk FROM (
            SELECT callsign, MAX(score) as best
            FROM scores GROUP BY callsign
        ) WHERE best > (
            SELECT MAX(score) FROM scores WHERE callsign = ?
        )
    """, (callsign,))
    rank_row = c2.fetchone()
    conn2.close()

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

# ── Leaderboard (FIXED) ──
@app.route('/api/leaderboard')
def leaderboard():
    limit = int(request.args.get("limit", 10))

    conn = get_db()
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
    conn.close()

    board = []
    rank = 1
    for r in rows:
        board.append({
            "rank": rank,
            "callsign": r["callsign"],
            "avatar": r["avatar"] or "🚀",
            "best_score": r["best_score"] or 0,
            "best_wave": r["best_wave"] or 1,
            "total_kills": r["total_kills"] or 0,
            "games_played": r["games_played"] or 0,
        })
        rank += 1

    return jsonify({"board": board})

# ── Stats ──
@app.route('/api/stats')
def stats():
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT COUNT(DISTINCT callsign), COUNT(*), MAX(score) FROM scores")
    row = c.fetchone()
    conn.close()

    return jsonify({
        "total_players": row[0] or 0,
        "total_games": row[1] or 0,
        "top_score": row[2] or 0,
    })

# ---------- RUN ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
