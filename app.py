import os
import sqlite3
import secrets
from flask import Flask, render_template_string, request, jsonify
from datetime import datetime
from flask_socketio import SocketIO
import re
import threading
import time
from functools import wraps
import logging
from collections import defaultdict

# ----------------- BASIC SETUP -----------------
logging.basicConfig(level=logging.WARNING)

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(32)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ----------------- SOCKET.IO (RENDER SAFE) -----------------
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)

DB_NAME = "chat.db"

# ----------------- DB CONNECTION POOL -----------------
class ConnectionPool:
    def __init__(self, max_connections=10):
        self.connections = []
        self.lock = threading.Lock()

    def get_connection(self):
        with self.lock:
            if self.connections:
                return self.connections.pop()
            return sqlite3.connect(DB_NAME, timeout=20, check_same_thread=False)

    def return_connection(self, conn):
        with self.lock:
            self.connections.append(conn)

pool = ConnectionPool()

def get_db_connection():
    return pool.get_connection()

def return_db_connection(conn):
    pool.return_connection(conn)

# ----------------- RATE LIMIT -----------------
rate_limits = defaultdict(list)

def rate_limit(limit=10, window=60):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            now = time.time()
            ip = request.remote_addr
            rate_limits[ip] = [t for t in rate_limits[ip] if now - t < window]
            if len(rate_limits[ip]) >= limit:
                return jsonify({"error": "Rate limit exceeded"}), 429
            rate_limits[ip].append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator

# ----------------- PHONE VALIDATION -----------------
def validate_phone(phone):
    return re.match(r'^\+\d{7,15}$', phone) is not None

# ----------------- DB INIT -----------------
def init_db():
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            phone TEXT PRIMARY KEY,
            last_online TEXT
        )
        """)
        conn.commit()
    finally:
        return_db_connection(conn)

# ----------------- HTML TEMPLATES -----------------
signin_html = """<!DOCTYPE html>
<html>
<head>
<title>EXOMNIA - Sign In</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:Arial;background:#A8D0CF;display:flex;justify-content:center;align-items:center;height:100vh}
.box{background:white;padding:25px;border-radius:12px;width:100%;max-width:400px}
button{width:100%;padding:12px;background:#0E4950;color:white;border:none;border-radius:8px}
.error{color:red;margin-bottom:10px}
</style>
</head>
<body>
<div class="box">
<h2>EXOMNIA Login</h2>
{% if error %}<div class="error">{{ error }}</div>{% endif %}
<form method="POST">
<select name="country_code">
<option value="+880">Bangladesh</option>
<option value="+91">India</option>
<option value="+1">USA</option>
</select>
<input name="phone_number" placeholder="Phone number" required>
<button type="submit">Sign In</button>
</form>
</div>
</body>
</html>
"""

main_app_html = """<!DOCTYPE html>
<html>
<head>
<title>Exomnia Super App</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="background:#A8D0CF;font-family:Arial">
<h2>Welcome to EXOMNIA</h2>
<p id="phone"></p>
<script>
const phone = localStorage.getItem("exomnia_user_phone");
document.getElementById("phone").innerText = "Logged in as: " + phone;
</script>
</body>
</html>
"""

# ----------------- ROUTES -----------------
@app.route("/", methods=["GET", "POST"])
@rate_limit()
def signin():
    if request.method == "POST":
        cc = request.form.get("country_code")
        num = request.form.get("phone_number")
        phone = f"{cc}{num}"

        if not validate_phone(phone):
            return render_template_string(signin_html, error="Invalid phone number")

        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute(
                "INSERT OR IGNORE INTO users(phone,last_online) VALUES (?,?)",
                (phone, datetime.now().isoformat())
            )
            c.execute(
                "UPDATE users SET last_online=? WHERE phone=?",
                (datetime.now().isoformat(), phone)
            )
            conn.commit()
        finally:
            return_db_connection(conn)

        return f"""
        <script>
        localStorage.setItem("exomnia_user_phone","{phone}");
        window.location.href="/main";
        </script>
        """

    return render_template_string(signin_html)

@app.route("/main")
def main():
    return render_template_string(main_app_html)

# ----------------- RUN -----------------
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)
