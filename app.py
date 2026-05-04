from flask import Flask, send_file, request, jsonify, render_template
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import os
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.DEBUG) 

# PostgreSQL Connection Configuration
DB_CONFIG = {
    'host': os.environ.get("DB_HOST", "localhost"),
    'port': int(os.environ.get("DB_PORT", 5432)),
    'database': os.environ.get("DB_NAME", "game_db"),
    'user': os.environ.get("DB_USER", "postgres"),
    'password': os.environ.get("DB_PASSWORD", "password")
}

# Connection Pool for better performance
db_pool = None

def init_connection_pool():
    global db_pool
    try:
        db_pool = psycopg2.pool.SimpleConnectionPool(
            1, 20,
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            database=DB_CONFIG['database'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password']
        )
        logging.info("Database connection pool created successfully")
    except Exception as e:
        logging.error(f"Failed to create connection pool: {e}")
        raise

def init_db():
    """Initialize database tables if they don't exist"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        c = conn.cursor()
        
        # Create table with PostgreSQL specific types
        c.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id              SERIAL PRIMARY KEY,
            callsign        VARCHAR(50) NOT NULL,
            avatar          VARCHAR(10) DEFAULT '🚀',
            score           INTEGER DEFAULT 0,
            wave            INTEGER DEFAULT 1,
            kills           INTEGER DEFAULT 0,
            combo           INTEGER DEFAULT 0,
            coins           INTEGER DEFAULT 0,
            ship            VARCHAR(50) DEFAULT '',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Create indexes for better query performance
        c.execute("""
        CREATE INDEX IF NOT EXISTS idx_callsign ON scores(callsign);
        """)
        c.execute("""
        CREATE INDEX IF NOT EXISTS idx_score DESC ON scores(score DESC);
        """)
        c.execute("""
        CREATE INDEX IF NOT EXISTS idx_created_at ON scores(created_at);
        """)
        
        conn.commit()
        conn.close()
        logging.info("Database initialized successfully")
    except Exception as e:
        logging.error(f"DB init error: {e}")
        raise

def get_db():
    """Get database connection from pool"""
    try:
        if db_pool is None:
            init_connection_pool()
        conn = db_pool.getconn()
        return conn
    except Exception as e:
        logging.error(f"Database connection error: {e}")
        raise

def return_db(conn):
    """Return connection back to pool"""
    try:
        if db_pool and conn:
            db_pool.putconn(conn)
    except Exception as e:
        logging.error(f"Error returning connection: {e}")

# Initialize connection pool on startup
try:
    init_connection_pool()
    init_db()
except Exception as e:
    logging.error(f"Failed to initialize database: {e}")

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
        
        try:
            score = max(0, int(data.get("score", 0)))
        except (ValueError, TypeError):
            score = 0
        
        try:
            wave = max(1, int(data.get("wave", 1)))
        except (ValueError, TypeError):
            wave = 1
        
        try:
            kills = max(0, int(data.get("kills", 0)))
        except (ValueError, TypeError):
            kills = 0
        
        try:
            combo = max(0, int(data.get("combo", 0)))
        except (ValueError, TypeError):
            combo = 0
        
        try:
            coins = max(0, int(data.get("coins", 0)))
        except (ValueError, TypeError):
            coins = 0
        
        ship = str(data.get("ship", ""))[:50]

        conn = get_db()
        c = conn.cursor()
        
        # Check previous best score
        c.execute("SELECT MAX(score) as best FROM scores WHERE callsign = %s", (callsign,))
        row = c.fetchone()
        prev_best = row[0] if row and row[0] else 0
        new_best = score > prev_best

        # Insert new score
        c.execute("""
            INSERT INTO scores (callsign, avatar, score, wave, kills, combo, coins, ship)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (callsign, avatar, score, wave, kills, combo, coins, ship))
        
        conn.commit()
        return jsonify({"status": "ok", "new_best": new_best})
        
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid data format"}), 400
    except Exception as e:
        logging.error(f"save_run error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn:
            return_db(conn)

@app.route('/api/player/<callsign>')
def get_player(callsign):
    conn = None
    try:
        conn = get_db()
        c = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get player stats
        c.execute("""
            SELECT
                callsign,
                avatar,
                MAX(score)  as best_score,
                MAX(wave)   as best_wave,
                SUM(kills)  as total_kills,
                COUNT(*)    as games_played
            FROM scores
            WHERE callsign = %s
            GROUP BY callsign
        """, (callsign,))

        row = c.fetchone()
        
        if not row:
            return jsonify({"player": None})

        # Get player rank
        c.execute("""
            SELECT COUNT(DISTINCT callsign) + 1 as rnk
            FROM (
                SELECT callsign, MAX(score) as best_score
                FROM scores
                GROUP BY callsign
            ) t
            WHERE t.best_score > (
                SELECT MAX(score) FROM scores WHERE callsign = %s
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
    except Exception as e:
        logging.error(f"get_player error: {e}")
        return jsonify({"player": None, "error": str(e)}), 500
    finally:
        if conn:
            return_db(conn)

@app.route('/api/leaderboard')
def leaderboard():
    conn = None
    try:
        try:
            limit = max(1, min(100, int(request.args.get("limit", 10))))
        except ValueError:
            limit = 10

        conn = get_db()
        c = conn.cursor(cursor_factory=RealDictCursor)
        
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
            LIMIT %s
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
    except Exception as e:
        logging.error(f"leaderboard error: {e}")
        return jsonify({"board": [], "error": str(e)}), 500
    finally:
        if conn:
            return_db(conn)

@app.route('/api/stats')
def stats():
    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        
        c.execute("SELECT COUNT(DISTINCT callsign), COUNT(*), MAX(score) FROM scores")
        row = c.fetchone()

        return jsonify({
            "total_players": row[0] or 0,
            "total_games": row[1] or 0,
            "top_score": row[2] or 0,
        })
    except Exception as e:
        logging.error(f"stats error: {e}")
        return jsonify({
            "total_players": 0,
            "total_games": 0,
            "top_score": 0,
            "error": str(e)
        }), 500
    finally:
        if conn:
            return_db(conn)

@app.teardown_appcontext
def shutdown_session(exception=None):
    """Clean up pool on app shutdown"""
    if db_pool:
        db_pool.closeall()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    debug_mode = os.environ.get("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
