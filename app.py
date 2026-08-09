from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room as sio_join_room, leave_room as sio_leave_room
import psycopg
from psycopg.rows import dict_row
import os
import time
import random
import string
import logging
import traceback

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise Exception("DATABASE_URL not set")

# ── In-memory co-op room state (fine for small-scale, single-instance hosting) ──
# rooms[code] = {
#   "host_sid": str,
#   "players": { sid: {"name": str, "ship": int, "x": float, "y": float, "hp": int, "alive": bool} },
#   "created_at": float,
# }
ROOMS = {}
MAX_PLAYERS_PER_ROOM = 4
ROOM_CODE_CHARS = string.ascii_uppercase + string.digits
ROOM_TTL_SECONDS = 3 * 3600  # rooms older than this with no host get swept


def gen_room_code():
    for _ in range(20):
        code = "".join(random.choices(ROOM_CODE_CHARS, k=5))
        if code not in ROOMS:
            return code
    return "".join(random.choices(ROOM_CODE_CHARS, k=6))


def sweep_stale_rooms():
    now = time.time()
    dead = [c for c, r in ROOMS.items() if now - r["created_at"] > ROOM_TTL_SECONDS]
    for c in dead:
        ROOMS.pop(c, None)


def find_room_for_sid(sid):
    for code, room in ROOMS.items():
        if sid in room["players"]:
            return code, room
    return None, None

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
    return render_template('privacy_policy.html')

@app.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy_policy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/how-to-play')
def how_to_play():
    return render_template('how_to_play.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/sw.js')
def service_worker():
    resp = send_file(os.path.join(app.static_folder, 'sw.js'))
    resp.headers['Content-Type'] = 'application/javascript'
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp

@app.route('/ads.txt')
def ads():
    return "google.com, pub-5744401524883457, DIRECT, f08c47fec0942fa0", 200, {'Content-Type': 'text/plain'}

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


# ═══════════════════════════════════════════════════════════════
#  CO-OP MULTIPLAYER — SocketIO room system (2–4 players)
# ═══════════════════════════════════════════════════════════════

@socketio.on('connect')
def on_connect():
    logging.info(f"[MP] connect {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    code, room = find_room_for_sid(sid)
    if not room:
        return
    was_host = (room["host_sid"] == sid)
    room["players"].pop(sid, None)
    sio_leave_room(code)
    if not room["players"]:
        ROOMS.pop(code, None)
        logging.info(f"[MP] room {code} closed (empty)")
        return
    if was_host:
        # promote the next player to host
        new_host_sid = next(iter(room["players"]))
        room["host_sid"] = new_host_sid
        emit('host_changed', {"hostSid": new_host_sid}, to=code)
    emit('player_left', {"sid": sid}, to=code)

@socketio.on('create_room')
def on_create_room(data):
    sweep_stale_rooms()
    sid = request.sid
    name = str((data or {}).get("name", "PILOT"))[:20]
    ship = int((data or {}).get("ship", 0))
    code = gen_room_code()
    ROOMS[code] = {
        "host_sid": sid,
        "players": {
            sid: {"name": name, "ship": ship, "x": 0, "y": 0, "hp": 100, "alive": True}
        },
        "created_at": time.time(),
    }
    sio_join_room(code)
    emit('room_created', {"code": code, "hostSid": sid, "you": sid})
    logging.info(f"[MP] room {code} created by {sid}")

@socketio.on('join_room_req')
def on_join_room(data):
    sid = request.sid
    code = str((data or {}).get("code", "")).strip().upper()
    name = str((data or {}).get("name", "PILOT"))[:20]
    ship = int((data or {}).get("ship", 0))
    room = ROOMS.get(code)
    if not room:
        emit('join_error', {"reason": "ROOM NOT FOUND"})
        return
    if len(room["players"]) >= MAX_PLAYERS_PER_ROOM:
        emit('join_error', {"reason": "ROOM FULL"})
        return
    room["players"][sid] = {"name": name, "ship": ship, "x": 0, "y": 0, "hp": 100, "alive": True}
    sio_join_room(code)
    # tell the newcomer about everyone already in the room
    emit('room_joined', {
        "code": code,
        "hostSid": room["host_sid"],
        "you": sid,
        "players": {s: p for s, p in room["players"].items()},
    })
    # tell everyone else about the newcomer
    emit('player_joined', {"sid": sid, "name": name, "ship": ship}, to=code, include_self=False)
    logging.info(f"[MP] {sid} joined room {code} ({len(room['players'])}/{MAX_PLAYERS_PER_ROOM})")

@socketio.on('leave_room_req')
def on_leave_room_req():
    on_disconnect()

@socketio.on('player_state')
def on_player_state(data):
    sid = request.sid
    code, room = find_room_for_sid(sid)
    if not room:
        return
    p = room["players"].get(sid)
    if not p:
        return
    p["x"] = (data or {}).get("x", p["x"])
    p["y"] = (data or {}).get("y", p["y"])
    p["hp"] = (data or {}).get("hp", p["hp"])
    p["alive"] = (data or {}).get("alive", p["alive"])
    emit('player_update', {
        "sid": sid, "x": p["x"], "y": p["y"], "hp": p["hp"], "alive": p["alive"],
    }, to=code, include_self=False)

# Host-authoritative gameplay events: only the host's browser spawns enemies
# and decides wave progression; it broadcasts those decisions to everyone else.
@socketio.on('host_event')
def on_host_event(data):
    sid = request.sid
    code, room = find_room_for_sid(sid)
    if not room or room["host_sid"] != sid:
        return  # only the host may broadcast authoritative game events
    emit('game_event', data or {}, to=code, include_self=False)

# Any player can report a kill/hit they landed; broadcast so all clients stay in sync.
@socketio.on('combat_event')
def on_combat_event(data):
    sid = request.sid
    code, room = find_room_for_sid(sid)
    if not room:
        return
    payload = dict(data or {})
    payload["fromSid"] = sid
    emit('combat_update', payload, to=code, include_self=False)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
