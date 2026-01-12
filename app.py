import os
import sqlite3
from flask import Flask, jsonify

app = Flask(__name__)

# Render compatible DB
DB_PATH = "/tmp/test.db" if "RENDER" in os.environ else "test.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT
        )
    """)
    conn.commit()
    conn.close()

init_db()

@app.route("/")
def home():
    return "🚀 Exomnia Super App (Simple Version Running)"

@app.route("/visit")
def visit():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO visits DEFAULT VALUES")
    conn.commit()

    c.execute("SELECT COUNT(*) FROM visits")
    count = c.fetchone()[0]
    conn.close()

    return jsonify({
        "status": "ok",
        "total_visits": count
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
