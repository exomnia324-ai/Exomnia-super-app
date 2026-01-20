import os
import sqlite3
import secrets
from flask import Flask, render_template_string, request, redirect, url_for, jsonify, session, send_from_directory
from datetime import datetime
from flask_socketio import SocketIO, emit, join_room, leave_room
import re
import base64
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import hashlib
import uuid
from werkzeug.utils import secure_filename
import threading
import time
from functools import wraps
import logging

# Performance optimization
logging.basicConfig(level=logging.WARNING)

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(32)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create upload directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Performance optimizations for SocketIO
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=16 * 1024 * 1024,  # 16MB
    logger=True,
    engineio_logger=True
)

DB_NAME = "chat.db"

# Connection pool for database
class ConnectionPool:
    def __init__(self, max_connections=20):
        self.max_connections = max_connections
        self.connections = []
        self.lock = threading.Lock()
    
    def get_connection(self):
        with self.lock:
            if self.connections:
                return self.connections.pop()
            else:
                return sqlite3.connect(DB_NAME, timeout=20, check_same_thread=False)
    
    def return_connection(self, conn):
        with self.lock:
            if len(self.connections) < self.max_connections:
                self.connections.append(conn)
            else:
                conn.close()

connection_pool = ConnectionPool()

def get_db_connection():
    return connection_pool.get_connection()

def return_db_connection(conn):
    connection_pool.return_connection(conn)

# Rate limiting
from collections import defaultdict

rate_limits = defaultdict(list)

def rate_limit(limit=10, window=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            now = time.time()
            user_id = request.remote_addr
            rate_limits[user_id] = [t for t in rate_limits[user_id] if now - t < window]
            if len(rate_limits[user_id]) >= limit:
                return jsonify({'error': 'Rate limit exceeded'}), 429
            rate_limits[user_id].append(now)
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def validate_phone(phone):
    pattern = r'^\+\d{1,4}\d{6,14}$'
    return re.match(pattern, phone) is not None

# ----------------- Database Setup -----------------
def init_db():
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("""
            CREATE TABLE users (
                phone TEXT PRIMARY KEY,
                last_online TEXT,
                public_key TEXT,
                encryption_version INTEGER DEFAULT 1
            )
        """)
        c.execute("""
            CREATE TABLE contacts (
                user_phone TEXT,
                contact_phone TEXT,
                contact_name TEXT,
                last_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_phone, contact_phone)
            )
        """)
        c.execute("""
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT,
                receiver TEXT,
                message TEXT,
                encrypted_message TEXT,
                status TEXT DEFAULT 'sent',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                encryption_version INTEGER DEFAULT 1,
                deleted_for_sender BOOLEAN DEFAULT 0,
                deleted_for_receiver BOOLEAN DEFAULT 0,
                deleted_for_everyone BOOLEAN DEFAULT 0,
                message_type TEXT DEFAULT 'text',
                file_path TEXT,
                file_name TEXT,
                file_size INTEGER,
                thumbnail_path TEXT
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender, receiver)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)")
        
        conn.commit()
    finally:
        return_db_connection(conn)

# ----------------- Main Super App Template -----------------
main_app_html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Exomnia Super App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {margin: 0; padding: 0; box-sizing: border-box;}
    body {
      font-family: Arial, sans-serif;
      background: #A8D0CF;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    #main-content {
      flex: 1;
      background: #A8D0CF;
      padding: 15px;
      overflow-y: auto;
      padding-bottom: 70px;
    }

    .bottom-nav {
      display: flex;
      justify-content: space-around;
      background: #fff;
      padding: 10px 0;
      position: fixed;
      bottom: 0;
      width: 100%;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
    }

    .tab {
      text-align: center;
      flex: 1;
      cursor: pointer;
      padding: 8px;
      color: #0E4950;
      font-weight: bold;
    }

    .tab.active {
      background: #0E4950;
      color: #fff;
      border-radius: 10px;
    }

    .placeholder-content {
      background: white;
      padding: 20px;
      border-radius: 15px;
      margin-top: 10px;
      text-align: center;
    }
  </style>
</head>
<body>

  <div id="main-content">
    <!-- Content will be loaded here -->
  </div>

  <div class="bottom-nav">
    <div class="tab active" onclick="openTab('chat', this)">💬 Chat</div>
    <div class="tab" onclick="openTab('social', this)">👥 Social</div>
    <div class="tab" onclick="openTab('video', this)">🎬 VideoStream</div>
    <div class="tab" onclick="openTab('market', this)">🛒 Market</div>
  </div>

  <script>
    function openTab(tabName, element) {
      console.log('Opening tab:', tabName);
      
      // Remove active class from all tabs
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

      // Add active class to clicked tab
      if (element) {
        element.classList.add('active');
      }

      let content = document.getElementById('main-content');
      const isLoggedIn = localStorage.getItem('exomnia_user_phone');
      console.log('Is logged in?', isLoggedIn);

      if (tabName === 'chat') {
        if (isLoggedIn) {
          content.innerHTML = `
            <h2 style="color: #0E4950; margin-bottom: 15px;">💬 Chat</h2>
            <div class="placeholder-content">
              <p>Welcome! Your phone: ${isLoggedIn}</p>
              <button onclick="loadContacts()" style="background: #0E4950; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-top: 10px;">
                Load Contacts
              </button>
            </div>
          `;
        } else {
          content.innerHTML = `
            <h2>💬 Chat</h2>
            <div class="placeholder-content">
              <p>Please login to access the chat feature</p>
              <button onclick="openChatLogin()" style="background: #0E4950; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-top: 10px;">
                Login to Chat
              </button>
            </div>
          `;
        }
      }
      else if (tabName === 'social') {
        content.innerHTML = `
          <h2>👥 Social</h2>
          <div class="placeholder-content">
            <p>Social feed coming soon</p>
          </div>
        `;
      }
      else if (tabName === 'video') {
        content.innerHTML = `
          <h2>🎬 VideoStream</h2>
          <div class="placeholder-content">
            <p>Video streaming coming soon</p>
          </div>
        `;
      }
      else if (tabName === 'market') {
        content.innerHTML = `
          <h2>🛒 Market</h2>
          <div class="placeholder-content">
            <p>Marketplace coming soon</p>
          </div>
        `;
      }
    }

    function openChatLogin() {
      window.location.href = '/';
    }
    
    function loadContacts() {
      const phone = localStorage.getItem('exomnia_user_phone');
      alert('Loading contacts for: ' + phone);
    }

    // On page load
    window.addEventListener('load', function() {
      console.log('Page loaded');
      
      // Check if we have phone in localStorage
      const savedPhone = localStorage.getItem('exomnia_user_phone');
      console.log('Saved phone:', savedPhone);
      
      if (savedPhone) {
        console.log('User is logged in, opening chat tab');
        document.querySelector('.tab[onclick*="chat"]').click();
      } else {
        console.log('User not logged in');
        openTab('chat');
      }
    });
  </script>

</body>
</html>"""

signin_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EXOMNIA - Sign In</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #A8D0CF;
            padding: 20px;
        }

        .login-container {
            width: 100%;
            max-width: 400px;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
        }

        .login-header {
            background: #0E4950;
            color: white;
            padding: 30px 25px;
            text-align: center;
        }

        .login-header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }

        .login-body {
            padding: 30px;
        }

        .input-group {
            margin-bottom: 20px;
        }

        input, select {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 10px;
        }

        button {
            width: 100%;
            padding: 14px;
            background: #0E4950;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }

        button:hover {
            background: #0a363b;
        }

        .error {
            color: red;
            background: #ffe6e6;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>EXOMNIA</h1>
            <p>Sign in to continue</p>
        </div>

        <div class="login-body">
            <div class="error" id="errorMessage"></div>

            <form method="POST" id="loginForm">
                <div class="input-group">
                    <input type="text" name="username" placeholder="Username or email" required>
                    
                    <select name="country_code" required>
                        <option value="+880">🇧🇩 Bangladesh (+880)</option>
                        <option value="+91">🇮🇳 India (+91)</option>
                        <option value="+1">🇺🇸 USA (+1)</option>
                    </select>
                    
                    <input type="tel" name="phone_number" placeholder="Phone number" required>
                    
                    <input type="hidden" name="phone" id="full_number">
                </div>

                <button type="submit">Sign In</button>
            </form>
        </div>
    </div>

    <script>
        const loginForm = document.getElementById('loginForm');
        const phoneNumberInput = document.querySelector('input[name="phone_number"]');
        const countryCodeSelect = document.querySelector('select[name="country_code"]');
        const fullNumberInput = document.getElementById('full_number');
        const errorMessage = document.getElementById('errorMessage');

        {% if error %}
            errorMessage.textContent = "{{ error }}";
            errorMessage.style.display = 'block';
        {% endif %}

        // Only allow numbers in phone field
        phoneNumberInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '');
        });

        // Combine country code and phone number
        function updateFullPhoneNumber() {
            const countryCode = countryCodeSelect.value;
            const phoneNumber = phoneNumberInput.value;
            fullNumberInput.value = countryCode + phoneNumber;
        }

        countryCodeSelect.addEventListener('change', updateFullPhoneNumber);
        phoneNumberInput.addEventListener('input', updateFullPhoneNumber);

        // Handle form submission
        loginForm.addEventListener('submit', function(e) {
            const phoneNumber = phoneNumberInput.value.trim();

            if (!phoneNumber) {
                e.preventDefault();
                errorMessage.textContent = "Please enter your phone number";
                errorMessage.style.display = 'block';
                return;
            }

            updateFullPhoneNumber();
        });
    </script>
</body>
</html>"""

# ----------------- Routes -----------------
@app.route("/", methods=["GET","POST"])
def signin():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        country_code = request.form.get("country_code", "").strip()
        phone_number = request.form.get("phone_number", "").strip()
        phone = request.form.get("phone", "").strip()

        # If phone is not directly provided, combine country code and phone number
        if not phone and country_code and phone_number:
            phone = country_code + phone_number

        print(f"🔑 Signin attempt - Phone: {phone}")

        if not phone:
            return render_template_string(signin_html, error="Please enter your phone number")

        if not validate_phone(phone):
            return render_template_string(signin_html, error="Please use correct phone number format with country code")

        try:
            now_iso = datetime.now().isoformat()
            conn = get_db_connection()
            try:
                c = conn.cursor()
                c.execute("INSERT OR IGNORE INTO users(phone,last_online) VALUES(?,?)",(phone, now_iso))
                c.execute("UPDATE users SET last_online=? WHERE phone=?",(now_iso, phone))
                conn.commit()
                print(f"✅ User saved to DB: {phone}")
            finally:
                return_db_connection(conn)
            
            # সরাসরি main_app_html রেন্ডার করুন phone localStorage এ save করার জন্য
            return f"""
            <html>
            <head>
                <script>
                    localStorage.setItem('exomnia_user_phone', '{phone}');
                    window.location.href = '/main';
                </script>
            </head>
            <body>
                <p>Redirecting to main app...</p>
            </body>
            </html>
            """
            
        except Exception as e:
            print(f"❌ Error in signin: {e}")
            return render_template_string(signin_html, error="An error occurred. Please try again.")

    return render_template_string(signin_html)

@app.route("/main")
def main_app():
    # সরাসরি main_app_html রেন্ডার করুন
    return render_template_string(main_app_html)

# ----------------- Run -----------------
if __name__=="__main__":
    init_db()
    print("=" * 80)
    print("🚀 EXOMNIA - Simple Test App")
    print("=" * 80)
    print("📱 Open: http://localhost:5000/")
    print("=" * 80)

    app.run(host="0.0.0.0", port=5000, debug=True)
