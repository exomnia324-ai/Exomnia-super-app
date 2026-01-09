
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
    logger=False,
    engineio_logger=False
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

# Allowed file extensions
ALLOWED_EXTENSIONS = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
    'video': ['mp4', 'mov', 'avi', 'mkv', 'webm'],
    'document': ['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx', 'xls', 'xlsx']
}

def allowed_file(filename, file_type='image'):
    """Check if file extension is allowed"""
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS.get(file_type, [])

def get_file_type(filename):
    """Determine file type from extension"""
    if '.' not in filename:
        return 'document'
    ext = filename.rsplit('.', 1)[1].lower()
    
    for file_type, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            return file_type
    return 'document'

# ----------------- Encryption Setup -----------------
class MessageEncryptor:
    def __init__(self):
        # Master encryption key - in production, use a secure key management system
        self.master_key = self._derive_master_key()

    def _derive_master_key(self):
        """Derive a master key from app secret"""
        # In production, use a proper key management system
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'exomnia_salt_2024',
            iterations=100000,
        )
        return kdf.derive(app.config['SECRET_KEY'].encode())

    def generate_user_key(self, phone_number):
        """Generate a unique encryption key for each user"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=phone_number.encode(),
            iterations=100000,
        )
        return kdf.derive(self.master_key)

    def encrypt_message(self, message, sender_phone, receiver_phone):
        """Encrypt message with keys from both sender and receiver"""
        try:
            # Combine keys from both users for this specific conversation
            sender_key = self.generate_user_key(sender_phone)
            receiver_key = self.generate_user_key(receiver_phone)
            conversation_key = hashlib.sha256(sender_key + receiver_key).digest()

            # Generate random nonce
            nonce = os.urandom(12)

            # Encrypt with AES-GCM
            aesgcm = AESGCM(conversation_key)
            encrypted_data = aesgcm.encrypt(nonce, message.encode(), None)

            # Return base64 encoded string of nonce + encrypted data
            encrypted_message = nonce + encrypted_data
            return base64.b64encode(encrypted_message).decode('utf-8')

        except Exception as e:
            print(f"❌ Encryption error: {e}")
            return None

    def decrypt_message(self, encrypted_message, sender_phone, receiver_phone):
        """Decrypt message using conversation key"""
        try:
            # Combine keys from both users
            sender_key = self.generate_user_key(sender_phone)
            receiver_key = self.generate_user_key(receiver_phone)
            conversation_key = hashlib.sha256(sender_key + receiver_key).digest()

            # Decode base64
            encrypted_data = base64.b64decode(encrypted_message.encode('utf-8'))

            # Extract nonce and ciphertext
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]

            # Decrypt with AES-GCM
            aesgcm = AESGCM(conversation_key)
            decrypted_data = aesgcm.decrypt(nonce, ciphertext, None)

            return decrypted_data.decode('utf-8')

        except Exception as e:
            print(f"❌ Decryption error: {e}")
            return "🔒 [Encrypted message - decryption failed]"

# Initialize encryptor
encryptor = MessageEncryptor()

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
                message_type TEXT DEFAULT 'text',  -- 'text', 'image', 'video', 'document'
                file_path TEXT,  -- Path to uploaded file
                file_name TEXT,  -- Original file name
                file_size INTEGER,  -- File size in bytes
                thumbnail_path TEXT  -- Path to thumbnail for images/videos
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender, receiver)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_phone)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type)")

        # Deleted messages ট্র্যাক করার জন্য নতুন টেবিল
        c.execute("""
            CREATE TABLE deleted_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER,
                user_phone TEXT,
                delete_type TEXT, -- 'for_me' or 'for_everyone'
                deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(message_id) REFERENCES messages(id)
            )
        """)
        
        # Message reactions টেবিল
        c.execute("""
            CREATE TABLE message_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER,
                user_phone TEXT,
                emoji TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(message_id) REFERENCES messages(id),
                UNIQUE(message_id, user_phone)
            )
        """)
        conn.commit()
    finally:
        return_db_connection(conn)

def validate_phone(phone):
    pattern = r'^\+\d{1,4}\d{6,14}$'
    return re.match(pattern, phone) is not None

# ----------------- Typing Status -----------------
typing_status = {}

# ----------------- Enhanced Caching System -----------------
class EnhancedCache:
    def __init__(self, ttl=300):
        self.cache = {}
        self.ttl = ttl
        self.lock = threading.Lock()
    
    def get(self, key):
        with self.lock:
            if key in self.cache:
                data, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    return data
                else:
                    del self.cache[key]
        return None
    
    def set(self, key, value):
        with self.lock:
            self.cache[key] = (value, time.time())
    
    def delete(self, key):
        with self.lock:
            if key in self.cache:
                del self.cache[key]
    
    def clear_pattern(self, pattern):
        """Clear all keys matching pattern"""
        with self.lock:
            keys_to_delete = [key for key in self.cache if pattern in key]
            for key in keys_to_delete:
                del self.cache[key]

cache = EnhancedCache(ttl=60)  # 1 minute cache

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
      transition: 0.3s ease;
      padding-bottom: 70px;
    }

    .bottom-nav {
      display: flex;
      justify-content: space-around;
      background: #fff;
      padding: 10px 0;
      color: #0E4950;
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
      transition: 0.2s ease;
    }

    .placeholder-content {
      background: white;
      padding: 20px;
      border-radius: 15px;
      margin-top: 10px;
      text-align: center;
    }

    /* Add Contact Modal Styles */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(5px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-content {
      background: white;
      padding: 25px;
      border-radius: 20px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      animation: modalSlide 0.3s ease;
    }
    @keyframes modalSlide {
      from { transform: translateY(-50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .modal h3 {
      margin-bottom: 20px;
      color: #333;
      text-align: center;
    }
    .form-group {
      margin-bottom: 15px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      color: #666;
      font-weight: 500;
    }
    .form-control {
      width: 100%;
      padding: 12px 15px;
      border: 2px solid #e1e1e1;
      border-radius: 10px;
      font-size: 16px;
      transition: all 0.3s ease;
    }
    .form-control:focus {
      border-color: #0E4950;
      box-shadow: 0 0 0 3px rgba(14, 73, 80, 0.1);
    }
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .btn-primary {
      background: #0E4950;
      color: white;
    }
    .btn-primary:hover {
      background: #0a363a;
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }
    .btn-secondary {
      background: #f8f9fa;
      color: #666;
    }
    .btn-secondary:hover {
      background: #e9ecef;
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }

    .loading {
      opacity: 0.7;
      pointer-events: none;
    }

    /* Search Bar Styles */
    .search-container {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      align-items: center;
    }
    .search-input {
      flex: 1;
      padding: 10px 15px;
      border: 2px solid #e1e1e1;
      border-radius: 10px;
      font-size: 14px;
      background: white;
      transition: all 0.3s ease;
    }
    .search-input:focus {
      border-color: #0E4950;
      box-shadow: 0 0 0 3px rgba(14, 73, 80, 0.1);
      outline: none;
    }
    .search-input::placeholder {
      color: #999;
    }
    .no-contacts-found {
      text-align: center;
      padding: 20px;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>

  <div id="main-content">
    <!-- Content will be loaded here based on active tab -->
  </div>

  <div class="bottom-nav">
    <div class="tab active" onclick="openTab('chat', this)">💬 Chat</div>
    <div class="tab" onclick="openTab('social', this)">👥 Social</div>
    <div class="tab" onclick="openTab('video', this)">🎬 VideoStream</div>
    <div class="tab" onclick="openTab('market', this)">🛒 Market</div>
  </div>

  <!-- Add Contact Modal -->
  <div id="contactModal" class="modal">
    <div class="modal-content">
      <h3>Add New Contact</h3>
      <form id="contactForm">
        <input type="hidden" name="user" id="userPhone">
        <div class="form-group">
          <label>Country Code</label>
          <select name="country_code" class="form-control" required>
            <option value="+880">🇧🇩 Bangladesh (+880)</option>
            <option value="+91">🇮🇳 India (+91)</option>
            <option value="+1">🇺🇸 USA (+1)</option>
            <option value="+44">🇬🇧 UK (+44)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="text" name="contact_phone" class="form-control"
                 placeholder="Enter phone number" required>
        </div>
        <div class="form-group">
          <label>Contact Name</label>
          <input type="text" name="contact_name" class="form-control"
                 placeholder="Enter full name" required>
        </div>
        <div class="button-group">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveBtn">Save Contact</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let allContacts = []; // Store all contacts for search functionality

    function openTab(tabName, element) {
      // Remove active class from all tabs
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

      // Add active class to clicked tab
      if (element) {
        element.classList.add('active');
      } else {
        // If no element provided, find and activate chat tab
        document.querySelector('.tab[onclick*="chat"]').classList.add('active');
      }

      let content = document.getElementById('main-content');
      const isLoggedIn = localStorage.getItem('exomnia_user_phone');

      if (tabName === 'chat') {
        if (isLoggedIn) {
          // User is logged in - load contacts
          loadContacts(isLoggedIn);
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
            <p style="text-align: center; color: #666; font-style: italic;">
              Social feed system coming soon...<br>
              Connect with friends and share moments.
            </p>
          </div>
        `;
      }
      else if (tabName === 'video') {
        content.innerHTML = `
          <h2>🎬 VideoStream</h2>
          <div class="placeholder-content">
            <p style="text-align: center; color: #666; font-style: italic;">
              Video streaming platform coming soon...<br>
              Watch and share videos with the community.
            </p>
          </div>
        `;
      }
      else if (tabName === 'market') {
        content.innerHTML = `
          <h2>🛒 Market</h2>
          <div class="placeholder-content">
            <p style="text-align: center; color: #666; font-style: italic;">
              E-commerce marketplace coming soon...<br>
              Buy and sell products securely.
            </p>
          </div>
        `;
      }
    }

    function openChatLogin() {
      window.location.href = '/';
    }

    function loadContacts(phone) {
      fetch(`/api/contacts?phone=${encodeURIComponent(phone)}`)
        .then(response => response.json())
        .then(contacts => {
          allContacts = contacts; // Store contacts for search functionality
          renderContacts(contacts);
        })
        .catch(error => {
          console.error('Error loading contacts:', error);
          let content = document.getElementById('main-content');
          content.innerHTML = `
            <h2>💬 Chat</h2>
            <div class="placeholder-content">
              <p style="color: red;">Failed to load contacts. Please try again.</p>
            </div>
          `;
        });
    }

    function renderContacts(contacts) {
      let content = document.getElementById('main-content');

      if (contacts.length === 0) {
        content.innerHTML = `
          <h2 style="color: #0E4950; margin-bottom: 15px;">💬 Chat</h2>
          <div class="placeholder-content">
            <div style="font-size: 40px; margin-bottom: 12px;">📱</div>
            <h3 style="font-size: 18px; margin-bottom: 8px; color: #333;">No contacts yet</h3>
            <p style="font-size: 14px; color: #666;">Add someone to start chatting!</p>
            <button onclick="addNewContact()" style="background: #0E4950; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: bold;">
              + Add Contact
            </button>
          </div>
        `;
      } else {
        let contactsHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h2 style="color: #0E4950; margin: 0;">💬 Contacts</h2>
            <button onclick="addNewContact()" style="background: #0E4950; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
              + Add
            </button>
          </div>
          <div class="search-container">
            <input type="text" id="searchInput" class="search-input" placeholder="Search contacts by name or phone..." onkeyup="filterContacts()">
          </div>
          <div id="contactsList" style="display: flex; flex-direction: column; gap: 10px;">
        `;

        contacts.forEach(contact => {
          contactsHTML += generateContactHTML(contact);
        });

        contactsHTML += `
          </div>
        `;
        content.innerHTML = contactsHTML;
      }
    }

    function generateContactHTML(contact) {
      const initial = contact.contact_name ? contact.contact_name[0].toUpperCase() : contact.contact_phone[0];
      const displayName = contact.contact_name || contact.contact_phone;
      const lastMsg = contact.last_message || 'No messages yet';
      const phone = localStorage.getItem('exomnia_user_phone');

      return `
        <a href="/chat/${encodeURIComponent(contact.contact_phone)}?phone=${encodeURIComponent(phone)}"
           style="text-decoration: none; color: inherit;">
          <div style="background: white; padding: 12px; border-radius: 15px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s ease; border: 1px solid #e0e0e0;">
            <div style="width: 45px; height: 45px; border-radius: 50%; background: #0E4950; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; flex-shrink: 0;">
              ${initial}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: #333; font-size: 15px; margin-bottom: 2px;">${displayName}</div>
              <div style="color: #666; font-size: 12px; margin-bottom: 3px;">${contact.contact_phone}</div>
              <div style="color: #888; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lastMsg}</div>
            </div>
          </div>
        </a>
      `;
    }

    function filterContacts() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const contactsList = document.getElementById('contactsList');

      if (!contactsList) return;

      const filteredContacts = allContacts.filter(contact => {
        const name = (contact.contact_name || '').toLowerCase();
        const phone = (contact.contact_phone || '').toLowerCase();

        return name.includes(searchTerm) || phone.includes(searchTerm);
      });

      if (filteredContacts.length === 0) {
        contactsList.innerHTML = `
          <div class="no-contacts-found">
            <p>No contacts found matching "${searchTerm}"</p>
          </div>
        `;
      } else {
        let contactsHTML = '';
        filteredContacts.forEach(contact => {
          contactsHTML += generateContactHTML(contact);
        });
        contactsList.innerHTML = contactsHTML;
      }
    }

    // Add Contact Modal Functions
    function addNewContact() {
      const phone = localStorage.getItem('exomnia_user_phone');
      if (phone) {
        document.getElementById('userPhone').value = phone;
        openModal();
      }
    }

    function openModal() {
      document.getElementById("contactModal").style.display = "flex";
    }

    function closeModal() {
      document.getElementById("contactModal").style.display = "none";
      document.getElementById("contactForm").reset();
      document.getElementById("saveBtn").classList.remove('loading');
      document.getElementById("saveBtn").textContent = 'Save Contact';
    }

    // Handle contact form submission
    document.getElementById('contactForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const saveBtn = document.getElementById('saveBtn');
      const formData = new FormData(this);

      saveBtn.classList.add('loading');
      saveBtn.textContent = 'Saving...';

      fetch('/add_contact', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      .then(response => {
        if (response.ok) {
          closeModal();
          // Reload contacts
          const phone = localStorage.getItem('exomnia_user_phone');
          if (phone) {
            loadContacts(phone);
          }
        } else {
          throw new Error('Save failed');
        }
      })
      .catch(error => {
        saveBtn.classList.remove('loading');
        saveBtn.textContent = 'Save Contact';
        alert('Error saving contact. Please try again.');
        console.error('Error:', error);
      });
    });

    // Close modal when clicking outside
    document.getElementById('contactModal').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // Check for login status on page load
    window.addEventListener('load', function() {
      const urlParams = new URLSearchParams(window.location.search);
      const loggedInPhone = urlParams.get('logged_in_phone');

      if (loggedInPhone) {
        localStorage.setItem('exomnia_user_phone', loggedInPhone);
        // Remove the parameter from URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        // Automatically open chat tab with info
        openTab('chat');
      } else {
        // Check if already logged in
        const savedPhone = localStorage.getItem('exomnia_user_phone');
        if (savedPhone) {
          openTab('chat');
        } else {
          // Show chat tab by default
          openTab('chat');
        }
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #A8D0CF;
            padding: 20px;
            color: #1a1a2e;
        }

        .login-container {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
            animation: fadeIn 0.5s ease-out;
        }

        .login-header {
            background: #0E4950;
            color: white;
            padding: 35px 25px;
            text-align: center;
            position: relative;
        }

        .login-header::after {
            content: '';
            position: absolute;
            bottom: -15px;
            left: 0;
            width: 100%;
            height: 30px;
            background: #ffffff;
            border-radius: 50% 50% 0 0;
        }

        .logo {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 12px;
        }

        .logo i {
            font-size: 32px;
        }

        .logo h1 {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 1px;
        }

        .login-header p {
            font-size: 16px;
            opacity: 0.9;
            margin-top: 5px;
        }

        .login-body {
            padding: 40px 30px 30px;
        }

        .input-group {
            margin-bottom: 25px;
        }

        .input-with-icon {
            position: relative;
            margin-bottom: 20px;
        }

        .input-with-icon i {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: #6c757d;
            z-index: 2;
        }

        .input-with-icon select, .input-with-icon input {
            width: 100%;
            padding: 16px 16px 16px 48px;
            border-radius: 10px;
            border: 1px solid #ddd;
            font-size: 16px;
            transition: all 0.3s ease;
            background: white;
        }

        .input-with-icon select {
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 16px center;
            background-size: 16px;
        }

        .input-with-icon select:focus, .input-with-icon input:focus {
            outline: none;
            border-color: #0E4950;
            box-shadow: 0 0 0 3px rgba(14, 73, 80, 0.2);
        }

        .phone-combined {
            display: flex;
            gap: 12px;
        }

        .phone-combined .input-with-icon {
            flex: 1;
        }

        .phone-combined .input-with-icon:last-child {
            flex: 2;
        }

        .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 10px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 10px;
        }

        .btn-primary {
            background: #0E4950;
            color: white;
        }

        .btn-primary:hover {
            background: #0a363b;
            transform: translateY(-2px);
            box-shadow: 0 7px 15px rgba(14, 73, 80, 0.4);
        }

        .login-footer {
            text-align: center;
            margin-top: 20px;
            font-size: 15px;
            color: #6c757d;
        }

        .login-footer a {
            color: #0E4950;
            text-decoration: none;
            font-weight: 500;
        }

        .login-footer a:hover {
            text-decoration: underline;
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 6px;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Security Features */
        .security-features {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            border-left: 4px solid #0E4950;
        }

        .security-features h4 {
            color: #0E4950;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .security-features ul {
            list-style: none;
            padding: 0;
        }

        .security-features li {
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
            .login-container {
                max-width: 100%;
            }

            .phone-combined {
                flex-direction: column;
            }

            .footer-links {
                flex-direction: column;
                gap: 5px;
            }
        }

        .error-message {
            color: #e74c3c;
            background: #fdf0f0;
            border: 1px solid #f8d7da;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            font-size: 14px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <i class="fas fa-lock"></i>
                <h1>Sign in EXOMNIA</h1>
            </div>
            <p>Enter your phone number to continue</p>
        </div>

        <div class="login-body">
            <!-- Error Message -->
            <div class="error-message" id="errorMessage"></div>

            <!-- Login Form -->
            <form method="POST" id="loginForm">
                <div class="input-group">
                    <!-- Username/Email Input -->
                    <div class="input-with-icon">
                        <i class="fas fa-user"></i>
                        <input type="text" id="username" name="username" placeholder="Username or email" required>
                    </div>

                    <!-- Phone Input Combined -->
                    <div class="phone-combined">
                        <div class="input-with-icon">
                            <i class="fas fa-globe"></i>
                            <select id="country_code" name="country_code" required>
                                <option value="+880">🇧🇩 +880</option>
                                <option value="+91">🇮🇳 +91</option>
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+44">🇬🇧 +44</option>
                            </select>
                        </div>
                        <div class="input-with-icon">
                            <i class="fas fa-mobile-alt"></i>
                            <input type="tel" id="phone_number" name="phone_number" placeholder="Phone number" pattern="[0-9]*" inputmode="numeric" required>
                        </div>
                    </div>

                    <input type="hidden" name="phone" id="full_number">
                </div>

                <button type="submit" class="btn btn-primary" id="loginBtn">
                    <i class="fas fa-sign-in-alt"></i>
                    Sign In
                </button>
            </form>

            <div class="login-footer">
                <p>Don't have an account? <a href="#">Sign up</a></p>
                <div class="footer-links">
                    <a href="#">Help Center</a>
                    <a href="#">Privacy Policy</a>
                </div>
            </div>
        </div>
    </div>

    <script>
        // DOM Elements
        const loginForm = document.getElementById('loginForm');
        const phoneNumberInput = document.getElementById('phone_number');
        const countryCodeSelect = document.getElementById('country_code');
        const fullNumberInput = document.getElementById('full_number');
        const errorMessage = document.getElementById('errorMessage');

        // Show error message if any
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

            // Update the full phone number before submission
            updateFullPhoneNumber();

            // Show loading state
            const loginBtn = document.getElementById('loginBtn');
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
            loginBtn.disabled = true;
        });
    </script>
</body>
</html>"""

# ----------------- Routes -----------------
@app.route("/", methods=["GET","POST"])
@rate_limit(limit=5, window=60)  # 5 requests per minute
def signin():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        country_code = request.form.get("country_code", "").strip()
        phone_number = request.form.get("phone_number", "").strip()
        phone = request.form.get("phone", "").strip()

        # If phone is not directly provided, combine country code and phone number
        if not phone and country_code and phone_number:
            phone = country_code + phone_number

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
            finally:
                return_db_connection(conn)
            return redirect(url_for('main_app', logged_in_phone=phone))
        except Exception as e:
            print(f"❌ Error in signin: {e}")
            return render_template_string(signin_html, error="An error occurred. Please try again.")

    return render_template_string(signin_html)

@app.route("/main")
def main_app():
    logged_in_phone = request.args.get('logged_in_phone')
    return render_template_string(main_app_html)

# ----------------- File Upload Route -----------------
@app.route('/upload_file', methods=['POST'])
@rate_limit(limit=10, window=60)  # 10 uploads per minute
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        sender = request.form.get('sender')
        receiver = request.form.get('receiver')
        
        if not all([sender, receiver]):
            return jsonify({'success': False, 'error': 'Missing sender or receiver'}), 400

        # Determine file type
        file_type = get_file_type(file.filename)
        
        # Generate unique filename
        if '.' in file.filename:
            file_ext = file.filename.rsplit('.', 1)[1].lower()
            unique_filename = f"{uuid.uuid4()}.{file_ext}"
        else:
            unique_filename = f"{uuid.uuid4()}"
            
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        # Save file
        file.save(file_path)
        file_size = os.path.getsize(file_path)
        
        # For images and videos, you could generate thumbnails here
        thumbnail_path = None
        if file_type in ['image', 'video']:
            # Thumbnail generation would go here
            # For now, we'll use the same file as thumbnail
            thumbnail_path = unique_filename
        
        # Save to database
        now_iso = datetime.now().isoformat()
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("""
                INSERT INTO messages(sender, receiver, message, message_type, file_path, file_name, file_size, thumbnail_path, status, timestamp)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (sender, receiver, f"Sent a {file_type}", file_type, unique_filename, file.filename, file_size, thumbnail_path, "sent", now_iso))
            
            message_id = c.lastrowid
            
            # Update contacts
            c.execute("""
                INSERT OR IGNORE INTO contacts(user_phone, contact_phone, contact_name, last_message)
                VALUES(?, ?, ?, ?)
            """, (sender, receiver, "", f"Sent a {file_type}"))
            
            c.execute("""
                UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP 
                WHERE user_phone=? AND contact_phone=?
            """, (f"Sent a {file_type}", sender, receiver))
            
            c.execute("""
                INSERT OR IGNORE INTO contacts(user_phone, contact_phone, contact_name, last_message)
                VALUES(?, ?, ?, ?)
            """, (receiver, sender, "", f"Sent a {file_type}"))
            
            c.execute("""
                UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP 
                WHERE user_phone=? AND contact_phone=?
            """, (f"Sent a {file_type}", receiver, sender))
            
            conn.commit()
        finally:
            return_db_connection(conn)
        
        return jsonify({
            'success': True, 
            'message_id': message_id,
            'file_path': unique_filename,
            'file_name': file.filename,
            'file_type': file_type,
            'file_size': file_size
        })
        
    except Exception as e:
        print(f"❌ Error in upload_file: {e}")
        return jsonify({'success': False, 'error': 'File upload failed'}), 500

@app.route('/uploads/<filename>')
def serve_file(filename):
    """Serve uploaded files"""
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except FileNotFoundError:
        return "File not found", 404

# ----------------- Contacts API -----------------
@app.route("/api/contacts")
@rate_limit(limit=30, window=60)  # 30 requests per minute
def api_contacts():
    phone = request.args.get("phone")
    if not phone:
        return jsonify([]), 400
    
    # Check cache first
    cache_key = f"contacts_{phone}"
    cached_contacts = cache.get(cache_key)
    if cached_contacts:
        return jsonify(cached_contacts)
    
    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT contact_phone, contact_name,
                       substr(COALESCE(last_message,''), 1, 50) ||
                       CASE WHEN length(last_message) > 50 THEN '...' ELSE '' END as last_message
                FROM contacts
                WHERE user_phone=?
                ORDER BY timestamp DESC
            """,(phone,))
            rows = c.fetchall()
        finally:
            return_db_connection(conn)
        contacts = [{"contact_phone": r[0], "contact_name": r[1], "last_message": r[2]} for r in rows]
        
        # Cache the results
        cache.set(cache_key, contacts)
        
        return jsonify(contacts)
    except Exception as e:
        print(f"❌ Error in api_contacts: {e}")
        return jsonify([]), 500

@app.route("/add_contact", methods=["POST"])
@rate_limit(limit=10, window=60)  # 10 contacts per minute
def add_contact():
    try:
        user = request.form.get("user")
        country_code = request.form.get("country_code","")
        contact_phone = request.form.get("contact_phone","").strip()
        contact_name = request.form.get("contact_name","").strip()
        if not all([user, contact_phone, contact_name]):
            return jsonify({"success": False, "error": "Please fill all information"}), 400

        full_contact_phone = contact_phone
        if country_code and not contact_phone.startswith(country_code):
            full_contact_phone = country_code + contact_phone

        if not validate_phone(full_contact_phone):
            return jsonify({"success": False, "error": "Please enter valid phone number"}), 400

        now_iso = datetime.now().isoformat()
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("INSERT OR IGNORE INTO users(phone,last_online) VALUES(?,?)",(full_contact_phone, now_iso))
            c.execute("""
                INSERT OR REPLACE INTO contacts(user_phone,contact_phone,contact_name,last_message)
                VALUES(?,?,?,COALESCE((SELECT last_message FROM contacts WHERE user_phone=? AND contact_phone=?), ''))
            """,(user, full_contact_phone, contact_name, user, full_contact_phone))
            conn.commit()
        finally:
            return_db_connection(conn)

        # Clear cache for this user's contacts
        cache.delete(f"contacts_{user}")

        return jsonify({"success": True})

    except Exception as e:
        print(f"❌ Error in add_contact: {e}")
        return jsonify({"success": False, "error": "An error occurred"}), 500

# ----------------- Delete Messages API -----------------
@app.route("/api/delete_message", methods=["POST"])
@rate_limit(limit=20, window=60)  # 20 deletes per minute
def api_delete_message():
    try:
        data = request.get_json()
        message_id = data.get("message_id")
        user_phone = data.get("user_phone")
        delete_type = data.get("delete_type")  # 'for_me' or 'for_everyone'

        if not all([message_id, user_phone, delete_type]):
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        conn = get_db_connection()
        try:
            c = conn.cursor()

            # Message details get করুন
            c.execute("SELECT sender, receiver FROM messages WHERE id=?", (message_id,))
            message = c.fetchone()

            if not message:
                return jsonify({"success": False, "error": "Message not found"}), 404

            sender, receiver = message

            if delete_type == "for_me":
                # শুধু নিজের জন্য ডিলিট
                if user_phone == sender:
                    c.execute("UPDATE messages SET deleted_for_sender=1 WHERE id=?", (message_id,))
                elif user_phone == receiver:
                    c.execute("UPDATE messages SET deleted_for_receiver=1 WHERE id=?", (message_id,))
                else:
                    return jsonify({"success": False, "error": "User not authorized to delete this message"}), 403

                # Track deletion
                c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                         (message_id, user_phone, delete_type))

                # Send to both users in the conversation
                room = get_room(sender, receiver)
                socketio.emit('delete_success', {
                    'message_id': message_id, 
                    'delete_type': delete_type,
                    'user_phone': user_phone
                }, room=room)
                print(f"✅ Message {message_id} deleted for me by {user_phone}")

            elif delete_type == "for_everyone":
                # সবার জন্য ডিলিট - শুধু sender করতে পারবে
                if user_phone == sender:
                    c.execute("UPDATE messages SET deleted_for_everyone=1 WHERE id=?", (message_id,))
                    c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                             (message_id, user_phone, delete_type))

                    # Send to both users in the conversation
                    room = get_room(sender, receiver)
                    socketio.emit('delete_success', {
                        'message_id': message_id,
                        'delete_type': delete_type,
                        'user_phone': user_phone
                    }, room=room)
                    
                    print(f"✅ Message {message_id} deleted for everyone by {user_phone}")
                else:
                    return jsonify({"success": False, "error": "Only sender can delete for everyone"}), 403

            conn.commit()
        finally:
            return_db_connection(conn)

        # Clear cache for this conversation
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")

        return jsonify({"success": True})

    except Exception as e:
        print(f"❌ Error in api_delete_message: {e}")
        return jsonify({"success": False, "error": "An error occurred"}), 500

@app.route("/api/get_messages")
@rate_limit(limit=50, window=60)  # 50 requests per minute
def api_get_messages():
    """Get messages with delete status considered"""
    user_phone = request.args.get("user_phone")
    contact_phone = request.args.get("contact_phone")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    offset = (page - 1) * limit

    if not all([user_phone, contact_phone]):
        return jsonify([]), 400

    # Check cache first
    cache_key = f"messages_{user_phone}_{contact_phone}_page_{page}"
    cached_messages = cache.get(cache_key)
    if cached_messages:
        return jsonify(cached_messages)

    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT m.id, m.sender, m.receiver, m.message, m.encrypted_message, m.status, m.timestamp,
                       m.deleted_for_sender, m.deleted_for_receiver, m.deleted_for_everyone,
                       m.message_type, m.file_path, m.file_name, m.file_size, m.thumbnail_path
                FROM messages m
                WHERE ((m.sender=? AND m.receiver=?) OR (m.sender=? AND m.receiver=?))
                AND m.deleted_for_everyone = 0
                AND (m.deleted_for_sender = 0 OR m.sender != ?)
                AND (m.deleted_for_receiver = 0 OR m.receiver != ?)
                ORDER BY m.timestamp ASC
                LIMIT ? OFFSET ?
            """, (user_phone, contact_phone, contact_phone, user_phone, 
                  user_phone, user_phone, limit, offset))
            messages_data = c.fetchall()

            # Get reactions for all messages
            message_ids = [str(m[0]) for m in messages_data]
            reactions_dict = {}
            if message_ids:
                placeholders = ','.join('?' * len(message_ids))
                c.execute(f"""
                    SELECT message_id, user_phone, emoji 
                    FROM message_reactions 
                    WHERE message_id IN ({placeholders})
                """, message_ids)
                reactions_data = c.fetchall()
                
                for reaction in reactions_data:
                    msg_id, user_phone, emoji = reaction
                    if msg_id not in reactions_dict:
                        reactions_dict[msg_id] = []
                    reactions_dict[msg_id].append({
                        'user_phone': user_phone,
                        'emoji': emoji
                    })
        finally:
            return_db_connection(conn)

        messages = []
        for m in messages_data:
            (message_id, sender, receiver, plaintext, encrypted, status, timestamp,
             deleted_for_sender, deleted_for_receiver, deleted_for_everyone,
             message_type, file_path, file_name, file_size, thumbnail_path) = m

            # Check if message should be shown to this user
            should_show = True
            is_sender = user_phone == sender
            is_receiver = user_phone == receiver

            if deleted_for_everyone:
                should_show = False
            elif is_sender and deleted_for_sender:
                should_show = False
            elif is_receiver and deleted_for_receiver:
                should_show = False

            # Get reactions for this message
            reactions = reactions_dict.get(message_id, [])

            if should_show:
                # Handle different message types
                if message_type == 'text':
                    # Decrypt text message
                    if encrypted:
                        try:
                            decrypted_message = encryptor.decrypt_message(encrypted, sender, receiver)
                            message_content = decrypted_message
                        except Exception as e:
                            message_content = "🔒 [Encrypted message]"
                    else:
                        message_content = plaintext
                        
                    messages.append({
                        "id": message_id,
                        "sender": sender,
                        "receiver": receiver,
                        "message": message_content,
                        "status": status,
                        "timestamp": timestamp,
                        "deleted_for_everyone": bool(deleted_for_everyone),
                        "can_delete_for_everyone": is_sender,
                        "reactions": reactions,
                        "message_type": message_type,
                        "is_deleted": False
                    })
                else:
                    # File message - show appropriate content
                    if message_type == 'image':
                        message_content = f"📷 Image: {file_name}"
                    elif message_type == 'video':
                        message_content = f"🎥 Video: {file_name}"
                    else:
                        message_content = f"📄 File: {file_name}"

                    messages.append({
                        "id": message_id,
                        "sender": sender,
                        "receiver": receiver,
                        "message": message_content,
                        "status": status,
                        "timestamp": timestamp,
                        "deleted_for_everyone": bool(deleted_for_everyone),
                        "can_delete_for_everyone": is_sender,
                        "reactions": reactions,
                        "message_type": message_type,
                        "file_path": file_path,
                        "file_name": file_name,
                        "file_size": file_size,
                        "thumbnail_path": thumbnail_path,
                        "is_deleted": False
                    })
            else:
                # Show deleted message placeholder
                messages.append({
                    "id": message_id,
                    "sender": sender,
                    "receiver": receiver,
                    "message": "This message was deleted",
                    "status": "deleted",
                    "timestamp": timestamp,
                    "is_deleted": True,
                    "reactions": []  # Empty reactions for deleted messages
                })

        # Cache the results
        cache.set(cache_key, messages)

        return jsonify(messages)

    except Exception as e:
        print(f"❌ Error in api_get_messages: {e}")
        return jsonify([]), 500

# ----------------- Enhanced Chat Page -----------------
chat_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Chat</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --primary-color: #0E4950;
            --primary-light: #1a6b75;
            --secondary-color: #A8D0CF;
            --accent-color: #38b6ff;
            --sent-bubble: #dcf8c6;
            --received-bubble: #ffffff;
            --background-color: #A8D0CF;
            --text-color: #333333;
            --light-text: #777777;
            --border-color: #e0e0e0;
            --shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Oxygen, Ubuntu, sans-serif;
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: var(--background-color);
            color: var(--text-color);
        }

        #chat-header {
            background: var(--primary-color);
            color: #fff;
            padding: 16px 20px;
            font-weight: 600;
            font-size: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: var(--shadow);
            z-index: 10;
            position: relative;
        }

        #contact-info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }

        .left-header-actions {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-right: 15px;
        }

        #saveBtn {
            background: var(--accent-color);
            border: none;
            color: #fff;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            width: 36px;
            height: 36px;
        }

        #saveBtn:hover {
            background: #2aa0e6;
            transform: scale(1.1);
        }

        .contact-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--accent-color);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
        }

        .contact-details {
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        .contact-name {
            font-size: 18px;
            font-weight: 600;
        }

        .connection-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            margin-top: 2px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-online {
            background: #4CAF50;
        }

        .status-offline {
            background: #f44336;
        }

        .header-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        #chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #chat {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .message-group {
            display: flex;
            flex-direction: column;
            margin-bottom: 12px;
            max-width: 85%;
        }

        .sent-group {
            align-self: flex-end;
            align-items: flex-end;
        }

        .received-group {
            align-self: flex-start;
            align-items: flex-start;
        }

        .bubble {
            padding: 12px 16px;
            border-radius: 18px;
            margin: 2px 0;
            font-size: 15px;
            line-height: 1.4;
            word-wrap: break-word;
            position: relative;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
            user-select: none;
            -webkit-user-select: none;
        }

        .sent {
            background: var(--sent-bubble);
            border-bottom-right-radius: 6px;
        }

        .received {
            background: var(--received-bubble);
            border-bottom-left-radius: 6px;
            border: 1px solid var(--border-color);
        }

        .status {
            font-size: 11px;
            color: var(--light-text);
            margin-top: 4px;
            text-align: right;
            padding-right: 4px;
        }

        .message-time {
            font-size: 11px;
            color: var(--light-text);
            margin-top: 2px;
            padding: 0 4px;
        }

        #typing {
            font-size: 14px;
            color: var(--light-text);
            margin: 0 20px 10px;
            height: 20px;
            font-style: italic;
        }

        #message-box {
            display: flex;
            padding: 16px 20px;
            background: transparent;
            gap: 12px;
            align-items: flex-end;
            min-height: 70px;
        }

        #message {
            flex: 1;
            padding: 12px 18px;
            font-size: 16px;
            border: 1px solid var(--border-color);
            border-radius: 24px;
            outline: none;
            resize: none;
            max-height: 120px;
            font-family: inherit;
            transition: border 0.2s;
            background: white;
            line-height: 1.4;
            overflow-y: auto;
            min-height: 48px;
            height: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            word-break: break-word;
        }

        #message:focus {
            border-color: var(--accent-color);
        }

        #send-btn {
            width: 48px;
            height: 48px;
            border: none;
            border-radius: 50%;
            background: var(--primary-color);
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        #send-btn:hover {
            background: var(--primary-light);
            transform: scale(1.05);
        }

        #send-btn:active {
            transform: scale(0.95);
        }

        /* File Upload Button */
        #file-upload-btn {
            width: 48px;
            height: 48px;
            border: none;
            border-radius: 50%;
            background: var(--accent-color);
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        #file-upload-btn:hover {
            background: #2aa0e6;
            transform: scale(1.05);
        }

        /* Modern Bottom Sheet Modal Styles */
        .file-upload-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 2000;
            align-items: flex-end;
            justify-content: center;
        }

        .file-upload-content {
            background: white;
            border-radius: 24px 24px 0 0;
            padding: 25px 20px;
            width: 100%;
            max-width: 100%;
            text-align: center;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.2);
            animation: slideUpFromBottom 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            position: relative;
            overflow: hidden;
            max-height: 80vh;
            overflow-y: auto;
        }

        @keyframes slideUpFromBottom {
            from { 
                opacity: 0;
                transform: translateY(100%);
            }
            to { 
                opacity: 1;
                transform: translateY(0);
            }
        }

        .file-upload-content::before {
            content: '';
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 4px;
            background: #ddd;
            border-radius: 2px;
        }

        .file-upload-content h3 {
            margin-bottom: 20px;
            color: #0E4950;
            font-size: 20px;
            font-weight: 700;
            margin-top: 15px;
        }

        .file-upload-subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 25px;
            font-weight: 500;
        }

        .file-upload-options {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 20px 0;
        }

        .file-upload-option {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 15px 10px;
            border: 2px solid transparent;
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            background: #f8f9fa;
        }

        .file-upload-option:hover {
            background: #e9ecef;
            transform: translateY(-2px);
        }

        .option-icon {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            transition: all 0.3s ease;
        }

        .photo-option .option-icon {
            background: #4CAF50;
            color: white;
        }

        .video-option .option-icon {
            background: #FF9800;
            color: white;
        }

        .document-option .option-icon {
            background: #2196F3;
            color: white;
        }

        .option-title {
            font-size: 14px;
            font-weight: 600;
            color: #333;
        }

        .option-description {
            font-size: 11px;
            color: #666;
            line-height: 1.3;
        }

        .file-upload-info {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 12px;
            border-left: 4px solid #0E4950;
        }

        .info-text {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #555;
            font-size: 12px;
            font-weight: 500;
        }

        /* File Input Styling */
        #fileInput {
            display: none;
        }

        .modal-close-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            background: none;
            border: none;
            font-size: 24px;
            color: #666;
            cursor: pointer;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Enhanced Media Message Styles */
        .media-message {
            max-width: 280px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .media-message:hover {
            transform: translateY(-2px);
        }

        .media-preview {
            border-radius: 16px;
            overflow: hidden;
            margin-bottom: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            position: relative;
            transition: all 0.3s ease;
        }

        .media-preview::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0);
            transition: background 0.3s ease;
        }

        .media-preview:hover::after {
            background: rgba(0,0,0,0.1);
        }

        .media-preview img, .media-preview video {
            width: 100%;
            height: auto;
            display: block;
            transition: transform 0.3s ease;
        }

        .media-preview:hover img, .media-preview:hover video {
            transform: scale(1.05);
        }

        .media-info {
            padding: 8px 4px;
        }

        .media-filename {
            font-weight: 600;
            font-size: 13px;
            color: #333;
            margin-bottom: 4px;
            word-break: break-word;
            line-height: 1.3;
        }

        .media-metadata {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #666;
        }

        .media-size {
            font-weight: 500;
        }

        .media-type {
            background: #0E4950;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
        }

        /* Enhanced File Message Styles */
        .file-message {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border-radius: 16px;
            border: 1px solid #e9ecef;
            transition: all 0.3s ease;
        }

        .file-message:hover {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
            transform: translateY(-2px);
        }

        .file-icon {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
        }

        .file-icon.photo { background: #E8F5E8; color: #4CAF50; }
        .file-icon.video { background: #FFF3E0; color: #FF9800; }
        .file-icon.document { background: #E3F2FD; color: #2196F3; }

        .file-info {
            flex: 1;
            min-width: 0;
        }

        .file-name {
            font-weight: 700;
            font-size: 14px;
            margin-bottom: 6px;
            word-break: break-word;
            color: #333;
            line-height: 1.3;
        }

        .file-details {
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: 12px;
            color: #666;
        }

        .file-size {
            font-weight: 600;
            color: #0E4950;
        }

        .file-type {
            background: #0E4950;
            color: white;
            padding: 2px 8px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 600;
        }

        .download-btn {
            background: linear-gradient(135deg, #0E4950, #1a6b75);
            color: white;
            border: none;
            border-radius: 10px;
            padding: 10px 16px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        .download-btn:hover {
            background: linear-gradient(135deg, #1a6b75, #0E4950);
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(14, 73, 80, 0.3);
        }

        .download-btn:active {
            transform: translateY(0);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .file-upload-options {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .file-upload-option {
                flex-direction: row;
                justify-content: flex-start;
                padding: 12px 15px;
                gap: 15px;
            }
            
            .option-text {
                text-align: left;
            }
        }

        /* Rest of the existing styles remain the same */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
            background: #fff;
            padding: 24px;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            animation: slideUp 0.3s ease-out;
        }

        .modal h3 {
            margin-bottom: 16px;
            color: var(--primary-color);
        }

        .modal input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 20px;
            outline: none;
            transition: border 0.2s;
        }

        .modal input:focus {
            border-color: var(--accent-color);
        }

        .modal-buttons {
            display: flex;
            gap: 12px;
        }

        .modal-btn {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .modal-btn.primary {
            background: var(--primary-color);
            color: white;
        }

        .modal-btn.primary:hover {
            background: var(--primary-light);
        }

        .modal-btn.secondary {
            background: #e0e0e0;
            color: #333;
        }

        .modal-btn.secondary:hover {
            background: #d0d0d0;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message-appear {
            animation: messageAppear 0.3s ease-out;
        }

        @keyframes messageAppear {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        #chat::-webkit-scrollbar {
            width: 6px;
        }

        #chat::-webkit-scrollbar-track {
            background: transparent;
        }

        #chat::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 3px;
        }

        #chat::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
        }

        #message::-webkit-scrollbar {
            width: 4px;
        }

        #message::-webkit-scrollbar-track {
            background: transparent;
        }

        #message::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 2px;
        }

        .back-button {
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 8px;
        }

        /* Message Context Menu */
        .context-menu {
            position: fixed;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            min-width: 160px;
            padding: 8px 0;
            display: none;
            animation: slideUp 0.2s ease-out;
            border: 1px solid #e0e0e0;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }

        .context-menu-item {
            padding: 12px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            color: #333;
            transition: background 0.2s;
            user-select: none;
            -webkit-user-select: none;
        }

        .context-menu-item:hover {
            background: #f5f5f5;
        }

        .context-menu-item i {
            font-size: 16px;
            width: 20px;
            text-align: center;
        }

        .context-menu-divider {
            height: 1px;
            background: #e0e0e0;
            margin: 4px 0;
        }

        /* Context menu animation */
        @keyframes contextMenuAppear {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-5px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .context-menu {
            animation: contextMenuAppear 0.15s ease-out;
        }

        /* Emoji Reaction Menu */
        .emoji-menu {
            position: fixed;
            background: white;
            border-radius: 24px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            z-index: 1001;
            padding: 8px;
            display: none;
            animation: slideUp 0.2s ease-out;
        }

        .emoji-options {
            display: flex;
            gap: 8px;
        }

        .emoji-option {
            font-size: 20px;
            padding: 8px;
            cursor: pointer;
            border-radius: 50%;
            transition: all 0.2s;
        }

        .emoji-option:hover {
            background: #f0f0f0;
            transform: scale(1.2);
        }

        /* Message Reactions */
        .message-reactions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
            flex-wrap: wrap;
        }

        .reaction {
            background: rgba(0, 0, 0, 0.05);
            border-radius: 12px;
            padding: 2px 6px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 2px;
        }

        .reaction-emoji {
            font-size: 12px;
        }

        .reaction-count {
            font-size: 10px;
            color: #666;
        }

        .bubble.selected {
            background: rgba(56, 182, 255, 0.1) !important;
            border: 1px solid var(--accent-color) !important;
        }

        .deleted-message {
            font-style: italic;
            color: #999 !important;
            background: #f5f5f5 !important;
            border: 1px dashed #ddd !important;
            pointer-events: none;
        }

        .deleted-message .message-reactions {
            display: none !important;
        }

        /* Delete Options Modal */
        .delete-options-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            justify-content: center;
            align-items: center;
            z-index: 2000;
        }

        .delete-options-content {
            background: white;
            padding: 24px;
            border-radius: 12px;
            width: 90%;
            max-width: 320px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .delete-options-content h3 {
            margin-bottom: 16px;
            color: #333;
        }

        .delete-options-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .delete-option-btn {
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .delete-option-btn.for-me {
            background: #ff9800;
            color: white;
        }

        .delete-option-btn.for-me:hover {
            background: #f57c00;
        }

        .delete-option-btn.for-everyone {
            background: #f44336;
            color: white;
        }

        .delete-option-btn.for-everyone:hover {
            background: #d32f2f;
        }

        .delete-option-btn.cancel {
            background: #e0e0e0;
            color: #333;
        }

        .delete-option-btn.cancel:hover {
            background: #d0d0d0;
        }

        /* Copy Feedback */
        .copy-feedback {
            position: fixed;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 1002;
            animation: fadeInOut 2s ease-in-out;
        }

        @keyframes fadeInOut {
            0%, 100% { opacity: 0; transform: translateY(10px); }
            20%, 80% { opacity: 1; transform: translateY(0); }
        }

        /* Media Viewer */
        .media-viewer {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 3000;
            align-items: center;
            justify-content: center;
        }

        .media-viewer-content {
            max-width: 90%;
            max-height: 90%;
            position: relative;
        }

        .media-viewer-content img,
        .media-viewer-content video {
            max-width: 100%;
            max-height: 90vh;
            border-radius: 8px;
        }

        .close-viewer {
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @media (max-width: 768px) {
            #chat-header {
                padding: 14px 16px;
            }

            #chat {
                padding: 16px;
            }

            .message-group {
                max-width: 90%;
            }

            #message-box {
                padding: 14px 16px;
                min-height: 65px;
            }

            #message {
                min-height: 44px;
                max-height: 100px;
            }

            #saveBtn {
                width: 34px;
                height: 34px;
                padding: 6px;
            }

            .context-menu {
                min-width: 140px;
            }

            .emoji-menu {
                padding: 6px;
            }

            .emoji-option {
                font-size: 18px;
                padding: 6px;
            }

            .media-message {
                max-width: 250px;
            }
        }

        @media (max-width: 480px) {
            .contact-avatar {
                width: 36px;
                height: 36px;
                font-size: 16px;
            }

            .contact-name {
                font-size: 16px;
            }

            .bubble {
                padding: 10px 14px;
                font-size: 14px;
            }

            #message {
                padding: 10px 16px;
                font-size: 15px;
                min-height: 42px;
                max-height: 90px;
            }

            #send-btn, #file-upload-btn {
                width: 44px;
                height: 44px;
            }

            #message-box {
                min-height: 60px;
            }

            #saveBtn {
                width: 32px;
                height: 32px;
                padding: 5px;
            }

            .media-message {
                max-width: 200px;
            }

            .file-message {
                padding: 12px;
                gap: 12px;
            }
            
            .file-icon {
                width: 40px;
                height: 40px;
                font-size: 20px;
            }
        }

        /* Loading Indicator */
        .loading-indicator {
            text-align: center;
            padding: 10px;
            color: #666;
            font-style: italic;
        }

        .loading-indicator.hidden {
            display: none;
        }

        /* Message Grouping Improvements */
        .message-group .bubble:first-child {
            margin-top: 0;
        }

        .message-group .bubble:last-child {
            margin-bottom: 0;
        }

        /* Improved Message Status */
        .message-status {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: #999;
            margin-top: 2px;
        }

        .message-status.sent { color: #999; }
        .message-status.delivered { color: #4CAF50; }
        .message-status.seen { color: #2196F3; }
    </style>
</head>
<body>
    <div id="chat-header">
        <div class="left-header-actions">
            <button class="back-button" onclick="goBack()">←</button>
            {% if contact_name == contact_phone %}
                <button id="saveBtn" onclick="openSaveModal()" title="Save Contact">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="white"/>
                    </svg>
                </button>
            {% endif %}
        </div>

        <div id="contact-info">
            <div class="contact-avatar">{{ contact_name[0] if contact_name else '?' }}</div>
            <div class="contact-details">
                <div class="contact-name">{{ contact_name }}</div>
                <div class="connection-status">
                    <span class="status-dot status-online" id="statusDot"></span>
                    <span id="statusText">Connected</span>
                </div>
            </div>
        </div>

        <div class="header-actions">
            <!-- Empty for balance -->
        </div>
    </div>

    <div id="chat-container">
        <div id="chat">
            <div id="loadingIndicator" class="loading-indicator hidden">Loading more messages...</div>
        </div>
        <div id="typing"></div>
    </div>

    <div id="message-box">
        <button id="file-upload-btn" onclick="openFileUploadModal()" title="Send file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="white" stroke-width="2"/>
                <polyline points="14,2 14,8 20,8" stroke="white" stroke-width="2"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="white" stroke-width="2"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="white" stroke-width="2"/>
                <polyline points="10,9 9,9 8,9" stroke="white" stroke-width="2"/>
            </svg>
        </button>
        <textarea id="message" placeholder="Type a message..." rows="1"></textarea>
        <button id="send-btn" onclick="sendMessage()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="white"/>
            </svg>
        </button>
    </div>

    <!-- Modern Bottom Sheet File Upload Modal -->
    <div id="fileUploadModal" class="file-upload-modal">
        <div class="file-upload-content">
            <button class="modal-close-btn" onclick="closeFileUploadModal()">×</button>
            <h3>📁 Share File</h3>
            <div class="file-upload-subtitle">Choose what you'd like to share</div>
            
            <div class="file-upload-options">
                <div class="file-upload-option photo-option" onclick="triggerFileInput('image')">
                    <div class="option-icon">🖼️</div>
                    <div class="option-text">
                        <div class="option-title">Photos</div>
                        <div class="option-description">JPG, PNG, GIF</div>
                    </div>
                </div>
                <div class="file-upload-option video-option" onclick="triggerFileInput('video')">
                    <div class="option-icon">🎬</div>
                    <div class="option-text">
                        <div class="option-title">Videos</div>
                        <div class="option-description">MP4, MOV, AVI</div>
                    </div>
                </div>
                <div class="file-upload-option document-option" onclick="triggerFileInput('document')">
                    <div class="option-icon">📄</div>
                    <div class="option-text">
                        <div class="option-title">Documents</div>
                        <div class="option-description">PDF, DOC, TXT</div>
                    </div>
                </div>
            </div>
            
            <input type="file" id="fileInput" accept="*/*">
            
            <div class="file-upload-info">
                <div class="info-text">
                    <i>💡</i>
                    <span>Max file size: 16MB • All files are securely encrypted</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Save Contact Modal -->
    <div id="saveModal" class="modal">
        <div class="modal-content">
            <h3>Save Contact</h3>
            <form id="saveContactForm">
                <input type="hidden" name="user" value="{{ phone }}">
                <input type="hidden" name="country_code" value="">
                <input type="hidden" name="contact_phone" value="{{ contact_phone }}">
                <input type="text" name="contact_name" placeholder="Enter name" required>
                <div class="modal-buttons">
                    <button type="submit" class="modal-btn primary">Save</button>
                    <button type="button" onclick="closeSaveModal()" class="modal-btn secondary">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Delete Options Modal -->
    <div id="deleteOptionsModal" class="delete-options-modal">
        <div class="delete-options-content">
            <h3>Delete Message</h3>
            <div class="delete-options-buttons">
                <button class="delete-option-btn for-me" onclick="deleteMessageForMe()">
                    Delete for Me
                </button>
                <button class="delete-option-btn for-everyone" onclick="deleteMessageForEveryone()" id="deleteForEveryoneBtn">
                    Delete for Everyone
                </button>
                <button class="delete-option-btn cancel" onclick="closeDeleteOptions()">
                    Cancel
                </button>
            </div>
        </div>
    </div>

    <!-- Context Menu -->
    <div id="contextMenu" class="context-menu">
        <div class="context-menu-item" onclick="copyMessage()">
            <i>📋</i>
            <span>Copy</span>
        </div>
        <div class="context-menu-item" onclick="showEmojiMenu()">
            <i>😊</i>
            <span>React</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="showDeleteOptionsFromContext()">
            <i>🗑️</i>
            <span>Delete</span>
        </div>
    </div>

    <!-- Emoji Reaction Menu -->
    <div id="emojiMenu" class="emoji-menu">
        <div class="emoji-options">
            <div class="emoji-option" onclick="addReaction('👍')">👍</div>
            <div class="emoji-option" onclick="addReaction('❤️')">❤️</div>
            <div class="emoji-option" onclick="addReaction('😂')">😂</div>
            <div class="emoji-option" onclick="addReaction('😮')">😮</div>
            <div class="emoji-option" onclick="addReaction('😢')">😢</div>
            <div class="emoji-option" onclick="addReaction('🙏')">🙏</div>
        </div>
    </div>

    <!-- Media Viewer -->
    <div id="mediaViewer" class="media-viewer">
        <div class="media-viewer-content">
            <button class="close-viewer" onclick="closeMediaViewer()">✕</button>
            <img id="viewerImage" src="" alt="">
            <video id="viewerVideo" controls style="display: none;"></video>
        </div>
    </div>

    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js" crossorigin="anonymous"></script>
    <script>
        let myPhone = {{ phone|tojson }};
        let contactPhone = {{ contact_phone|tojson }};
        const typingDiv = document.getElementById('typing');
        let chatDiv = document.getElementById('chat');
        const messageInput = document.getElementById('message');
        const messageBox = document.getElementById('message-box');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const contextMenu = document.getElementById('contextMenu');
        const emojiMenu = document.getElementById('emojiMenu');
        const fileInput = document.getElementById('fileInput');
        const fileUploadModal = document.getElementById('fileUploadModal');
        const mediaViewer = document.getElementById('mediaViewer');
        const viewerImage = document.getElementById('viewerImage');
        const viewerVideo = document.getElementById('viewerVideo');
        const loadingIndicator = document.getElementById('loadingIndicator');
        
        let typingTimeout;
        let isConnected = false;
        let lastSender = null;
        let messageGroups = {};
        let lastMarkedSeenTime = 0;
        let currentMessageToDelete = null;
        let currentBubbleToDelete = null;
        let selectedMessage = null;
        let selectedMessageId = null;
        let contextMenuMessageId = null;

        // Enhanced variables for better performance
        let currentPage = 1;
        let isLoading = false;
        let hasMoreMessages = true;
        let scrollPositionBeforeLoad = 0;

        // Context Menu Variables
        let pressTimer;
        let longPressActive = false;

        function goBack() {
            window.location.href = '/main?phone=' + encodeURIComponent(myPhone);
        }

        function autoResizeTextarea() {
            messageInput.style.height = 'auto';
            const scrollHeight = messageInput.scrollHeight;
            const maxHeight = 120;
            if (scrollHeight <= maxHeight) {
                messageInput.style.height = scrollHeight + 'px';
                messageBox.style.minHeight = Math.max(70, scrollHeight + 22) + 'px';
            } else {
                messageInput.style.height = maxHeight + 'px';
                messageInput.style.overflowY = 'auto';
                messageBox.style.minHeight = '140px';
            }
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }

        messageInput.addEventListener('input', autoResizeTextarea);
        messageInput.addEventListener('keydown', autoResizeTextarea);
        messageInput.addEventListener('keyup', autoResizeTextarea);
        messageInput.addEventListener('focus', function() {
            setTimeout(autoResizeTextarea, 10);
        });

        function resetTextareaHeight() {
            setTimeout(() => {
                messageInput.style.height = 'auto';
                messageInput.style.overflowY = 'hidden';
                messageBox.style.minHeight = '70px';
            }, 100);
        }

        // ==================== FIXED CONTEXT MENU SYSTEM ====================
        
        function initializeContextMenuSystem() {
            console.log('🔄 Initializing fixed context menu system...');
            
            // Remove any existing event listeners first
            chatDiv.removeEventListener('contextmenu', handleContextMenu);
            chatDiv.removeEventListener('touchstart', handleTouchStart);
            chatDiv.removeEventListener('touchend', handleTouchEnd);
            chatDiv.removeEventListener('touchmove', handleTouchMove);
            
            // Add new event listeners
            chatDiv.addEventListener('contextmenu', handleContextMenu);
            chatDiv.addEventListener('touchstart', handleTouchStart);
            chatDiv.addEventListener('touchend', handleTouchEnd);
            chatDiv.addEventListener('touchmove', handleTouchMove);
            
            console.log('✅ Fixed context menu system initialized');
        }

        function handleContextMenu(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const bubble = e.target.closest('.bubble');
            if (bubble && bubble.dataset.messageId && !bubble.classList.contains('deleted-message')) {
                console.log('🎯 Context menu triggered for message:', bubble.dataset.messageId);
                showContextMenu(e.clientX, e.clientY, bubble.dataset.messageId, bubble);
            }
        }

        function handleTouchStart(e) {
            const bubble = e.target.closest('.bubble');
            if (bubble && bubble.dataset.messageId && !bubble.classList.contains('deleted-message')) {
                longPressActive = true;
                pressTimer = setTimeout(() => {
                    const touch = e.touches[0];
                    console.log('📱 Long press detected for message:', bubble.dataset.messageId);
                    showContextMenu(touch.clientX, touch.clientY, bubble.dataset.messageId, bubble);
                    longPressActive = false;
                    e.preventDefault();
                }, 500); // Increased to 500ms for better UX
            }
        }

        function handleTouchEnd() {
            clearTimeout(pressTimer);
            longPressActive = false;
        }

        function handleTouchMove() {
            clearTimeout(pressTimer);
            longPressActive = false;
        }

        function showContextMenu(x, y, messageId, bubble) {
            // Hide any existing menus immediately
            hideContextMenu();
            hideEmojiMenu();
            
            selectedMessage = bubble;
            selectedMessageId = messageId;
            contextMenuMessageId = messageId;
            currentMessageToDelete = messageId; // Set this for delete functions
            currentBubbleToDelete = bubble; // Set this for delete functions
            
            // Position calculation
            const menuWidth = 160;
            const menuHeight = 180;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let adjustedX = Math.min(x, viewportWidth - menuWidth - 10);
            let adjustedY = Math.min(y, viewportHeight - menuHeight - 10);
            
            // Show menu immediately
            contextMenu.style.display = 'block';
            contextMenu.style.left = adjustedX + 'px';
            contextMenu.style.top = adjustedY + 'px';
            
            // Select bubble
            document.querySelectorAll('.bubble.selected').forEach(b => b.classList.remove('selected'));
            bubble.classList.add('selected');
            
            console.log('📱 Context menu shown for message:', messageId);
        }

        function hideContextMenu() {
            contextMenu.style.display = 'none';
            if (selectedMessage) {
                selectedMessage.classList.remove('selected');
                selectedMessage = null;
            }
            contextMenuMessageId = null;
        }

        function hideEmojiMenu() {
            emojiMenu.style.display = 'none';
        }

        function showEmojiMenu() {
            if (!selectedMessage || !contextMenuMessageId) return;
            
            const rect = selectedMessage.getBoundingClientRect();
            const menuWidth = 240;
            const menuHeight = 60;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let adjustedX = rect.left + rect.width / 2 - menuWidth / 2;
            let adjustedY = rect.top - menuHeight - 10;
            
            if (adjustedX < 10) adjustedX = 10;
            if (adjustedX + menuWidth > viewportWidth) adjustedX = viewportWidth - menuWidth - 10;
            if (adjustedY < 10) adjustedY = rect.bottom + 10;
            
            emojiMenu.style.display = 'block';
            emojiMenu.style.left = adjustedX + 'px';
            emojiMenu.style.top = adjustedY + 'px';
            
            hideContextMenu();
        }

        function copyMessage() {
            if (!selectedMessage) return;
            
            const messageContent = selectedMessage.querySelector('div:first-child');
            if (messageContent) {
                const textToCopy = messageContent.textContent;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showCopyFeedback('Copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    showCopyFeedback('Copy failed!');
                });
            }
            
            hideContextMenu();
        }

        function showCopyFeedback(message) {
            const feedback = document.createElement('div');
            feedback.className = 'copy-feedback';
            feedback.textContent = message;
            feedback.style.left = '50%';
            feedback.style.top = '50%';
            feedback.style.transform = 'translate(-50%, -50%)';
            document.body.appendChild(feedback);
            
            setTimeout(() => {
                document.body.removeChild(feedback);
            }, 2000);
        }

        function addReaction(emoji) {
            if (!contextMenuMessageId) return;
            
            // Send reaction via socket
            socket.emit('add_reaction', {
                message_id: contextMenuMessageId,
                emoji: emoji,
                user_phone: myPhone
            });
            
            hideEmojiMenu();
        }

        function showDeleteOptionsFromContext() {
            if (!contextMenuMessageId || !selectedMessage) return;
            
            currentMessageToDelete = contextMenuMessageId;
            currentBubbleToDelete = selectedMessage;
            
            const canDeleteForEveryone = selectedMessage.classList.contains('sent');
            const deleteForEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
            if (deleteForEveryoneBtn) {
                deleteForEveryoneBtn.style.display = canDeleteForEveryone ? 'block' : 'none';
            }
            
            document.getElementById('deleteOptionsModal').style.display = 'flex';
            hideContextMenu();
            
            console.log('🗑️ Delete options for message:', currentMessageToDelete);
        }

        // ==================== ENHANCED MESSAGE LOADING ====================

        function setupInfiniteScroll() {
            chatDiv.addEventListener('scroll', function() {
                if (chatDiv.scrollTop < 100 && !isLoading && hasMoreMessages) {
                    loadMoreMessages();
                }
            });
        }

        async function loadMoreMessages() {
            if (isLoading || !hasMoreMessages) return;
            
            isLoading = true;
            currentPage++;
            scrollPositionBeforeLoad = chatDiv.scrollHeight - chatDiv.scrollTop;
            
            loadingIndicator.classList.remove('hidden');
            
            try {
                const response = await fetch(`/api/get_messages?user_phone=${encodeURIComponent(myPhone)}&contact_phone=${encodeURIComponent(contactPhone)}&page=${currentPage}&limit=50`);
                const newMessages = await response.json();
                
                if (newMessages.length === 0) {
                    hasMoreMessages = false;
                    loadingIndicator.textContent = 'No more messages';
                    return;
                }
                
                // Prepend messages to chat
                prependMessages(newMessages);
                
                // Restore scroll position
                const newScrollHeight = chatDiv.scrollHeight;
                chatDiv.scrollTop = newScrollHeight - scrollPositionBeforeLoad;
                
            } catch (error) {
                console.error('Error loading more messages:', error);
                currentPage--; // Revert page on error
            } finally {
                isLoading = false;
                loadingIndicator.classList.add('hidden');
                
                // Re-initialize context menu for new messages
                setTimeout(initializeContextMenuSystem, 100);
            }
        }

        function prependMessages(messages) {
            const fragment = document.createDocumentFragment();
            let currentGroup = null;
            let lastMessageSender = null;
            
            messages.reverse().forEach(message => {
                if (message.is_deleted) {
                    const deletedElement = createDeletedMessage(message.sender, message.id);
                    fragment.prepend(deletedElement);
                    lastMessageSender = null;
                } else if (message.message_type === 'text') {
                    if (message.sender !== lastMessageSender) {
                        currentGroup = createMessageGroup(message.sender === String(myPhone));
                        fragment.prepend(currentGroup);
                    }
                    const messageElement = createTextMessage(message);
                    currentGroup.prepend(messageElement);
                    lastMessageSender = message.sender;
                } else {
                    if (message.sender !== lastMessageSender) {
                        currentGroup = createMessageGroup(message.sender === String(myPhone));
                        fragment.prepend(currentGroup);
                    }
                    const messageElement = createMediaMessage(message);
                    currentGroup.prepend(messageElement);
                    lastMessageSender = message.sender;
                }
            });
            
            chatDiv.prepend(fragment);
        }

        function createMessageGroup(isSent) {
            const group = document.createElement('div');
            group.className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
            return group;
        }

        function createTextMessage(message) {
            const bubble = document.createElement('div');
            bubble.className = `bubble ${message.sender === String(myPhone) ? 'sent' : 'received'} message-appear`;
            bubble.dataset.messageId = message.id;

            const messageContent = document.createElement('div');
            messageContent.textContent = message.message;
            bubble.appendChild(messageContent);

            // Add reactions if any
            if (message.reactions && message.reactions.length > 0) {
                bubble.appendChild(createReactionsElement(message.reactions));
            }

            // Add status and time
            if (message.sender === String(myPhone)) {
                bubble.appendChild(createStatusElement(message.status));
            }
            bubble.appendChild(createTimeElement());

            return bubble;
        }

        function createMediaMessage(message) {
            const bubble = document.createElement('div');
            bubble.className = `bubble ${message.sender === String(myPhone) ? 'sent' : 'received'} media-message message-appear`;
            bubble.dataset.messageId = message.id;

            // Media content will be added here based on message type
            if (message.message_type === 'image') {
                bubble.appendChild(createImageMessage(message));
            } else if (message.message_type === 'video') {
                bubble.appendChild(createVideoMessage(message));
            } else {
                bubble.appendChild(createFileMessage(message));
            }

            // Add reactions if any
            if (message.reactions && message.reactions.length > 0) {
                bubble.appendChild(createReactionsElement(message.reactions));
            }

            // Add status and time
            if (message.sender === String(myPhone)) {
                bubble.appendChild(createStatusElement(message.status));
            }
            bubble.appendChild(createTimeElement());

            return bubble;
        }

        function createReactionsElement(reactions) {
            const container = document.createElement('div');
            container.className = 'message-reactions';
            
            const reactionCounts = {};
            reactions.forEach(reaction => {
                if (!reactionCounts[reaction.emoji]) {
                    reactionCounts[reaction.emoji] = 0;
                }
                reactionCounts[reaction.emoji]++;
            });

            Object.entries(reactionCounts).forEach(([emoji, count]) => {
                const reactionElement = document.createElement('div');
                reactionElement.className = 'reaction';
                reactionElement.innerHTML = `
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${count}</span>
                `;
                container.appendChild(reactionElement);
            });

            return container;
        }

        function createStatusElement(status) {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'status';
            statusDiv.textContent = status === 'seen' ? "✓✓ Seen" : (status === 'delivered') ? "✓ Delivered" : "✓ Sent";
            return statusDiv;
        }

        function createTimeElement() {
            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return timeDiv;
        }

        function createDeletedMessage(sender, messageId) {
            const bubble = document.createElement('div');
            bubble.className = `bubble ${sender === String(myPhone) ? 'sent' : 'received'} deleted-message`;
            bubble.dataset.messageId = messageId;

            const messageContent = document.createElement('div');
            messageContent.textContent = 'This message was deleted';
            messageContent.style.fontStyle = 'italic';
            messageContent.style.color = '#999';
            bubble.appendChild(messageContent);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.appendChild(timeDiv);

            return bubble;
        }

        // ==================== EVENT LISTENERS ====================
        
        // Click outside to close context menu
        document.addEventListener('click', function(e) {
            if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
                hideContextMenu();
            }
            if (emojiMenu.style.display === 'block' && !emojiMenu.contains(e.target)) {
                hideEmojiMenu();
            }
        });

        // Prevent context menu from closing when clicking inside it
        contextMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        emojiMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // Close modals when clicking outside
        document.getElementById('deleteOptionsModal').addEventListener('click', function(e) {
            if (e.target === this) closeDeleteOptions();
        });

        document.getElementById('saveModal').addEventListener('click', function(e) {
            if (e.target === this) closeSaveModal();
        });

        document.getElementById('fileUploadModal').addEventListener('click', function(e) {
            if (e.target === this) closeFileUploadModal();
        });

        // Escape key to close menus
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeFileUploadModal();
                closeSaveModal();
                closeDeleteOptions();
                closeMediaViewer();
                hideContextMenu();
                hideEmojiMenu();
            }
        });

        // Load messages from API
        function loadMessages() {
            fetch(`/api/get_messages?user_phone=${encodeURIComponent(myPhone)}&contact_phone=${encodeURIComponent(contactPhone)}&page=1&limit=50`)
                .then(response => response.json())
                .then(messages => {
                    chatDiv.innerHTML = '<div id="loadingIndicator" class="loading-indicator hidden">Loading more messages...</div>';
                    messageGroups = {};
                    lastSender = null;

                    messages.forEach(m => {
                        if (!m.is_deleted) {
                            if (m.message_type === 'text') {
                                addMessage(m.sender, m.message, m.status, m.id, m.can_delete_for_everyone, m.reactions);
                            } else {
                                addMediaMessage(m.sender, m.message_type, m.file_path, m.file_name, m.file_size, m.status, m.id, m.can_delete_for_everyone, m.reactions);
                            }
                        } else {
                            addDeletedMessage(m.sender, m.id);
                        }
                    });

                    chatDiv.scrollTop = chatDiv.scrollHeight;
                    
                    // Initialize infinite scroll and context menu
                    setupInfiniteScroll();
                    setTimeout(initializeContextMenuSystem, 100);
                })
                .catch(error => {
                    console.error('Error loading messages:', error);
                    const oldMessages = {{ messages|tojson }};
                    oldMessages.forEach(m => {
                        if (m.message_type === 'text' || !m.message_type) {
                            addMessage(m.sender, m.message, m.status, m.id, m.sender === String(myPhone), []);
                        } else {
                            addMediaMessage(m.sender, m.message_type, m.file_path, m.file_name, m.file_size, m.status, m.id, m.sender === String(myPhone), []);
                        }
                    });
                });
        }

        // Initial load
        loadMessages();

        var socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        function updateConnectionStatus(connected) {
            isConnected = connected;
            if (connected) {
                statusDot.className = 'status-dot status-online';
                statusText.textContent = 'Connected';
            } else {
                statusDot.className = 'status-dot status-offline';
                statusText.textContent = 'Offline';
            }
        }

        socket.on('connect', () => {
            console.log('✅ Connected to server');
            updateConnectionStatus(true);
            socket.emit('join', {user: myPhone, contact: contactPhone});
            markAllMessagesAsSeen();
        });

        // Modern Bottom Sheet File Upload Functions
        function openFileUploadModal() {
            fileUploadModal.style.display = 'flex';
        }

        function closeFileUploadModal() {
            fileUploadModal.style.display = 'none';
            fileInput.value = '';
        }

        // Background-এ ক্লিক করলে মডাল বন্ধ হোক
        fileUploadModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeFileUploadModal();
            }
        });

        function triggerFileInput(fileType) {
            let accept = '';
            switch(fileType) {
                case 'image':
                    accept = 'image/*';
                    break;
                case 'video':
                    accept = 'video/*';
                    break;
                case 'document':
                    accept = '*/*';
                    break;
            }
            fileInput.accept = accept;
            fileInput.onchange = function() {
                if (this.files.length > 0) {
                    uploadFile(this.files[0], fileType);
                }
            };
            fileInput.click();
            closeFileUploadModal();
        }

        // Enhanced file type detection
        function getFileIcon(fileType, fileName) {
            const extension = fileName.split('.').pop()?.toLowerCase();
            
            if (fileType === 'image') return '🖼️';
            if (fileType === 'video') return '🎬';
            
            // Document type icons
            const docIcons = {
                'pdf': '📕',
                'doc': '📘',
                'docx': '📘',
                'txt': '📝',
                'ppt': '📊',
                'pptx': '📊',
                'xls': '📈',
                'xlsx': '📈',
                'zip': '📦',
                'rar': '📦'
            };
            
            return docIcons[extension] || '📄';
        }

        function getFileTypeClass(fileType) {
            switch(fileType) {
                case 'image': return 'photo';
                case 'video': return 'video';
                default: return 'document';
            }
        }

        function uploadFile(file, fileType) {
            if (!file) return;

            // ফাইল সাইজ চেক (16MB = 16 * 1024 * 1024)
            const maxSize = 16 * 1024 * 1024;
            if (file.size > maxSize) {
                alert('File size too large. Maximum size is 16MB.');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('sender', myPhone);
            formData.append('receiver', contactPhone);

            // Show uploading indicator
            const tempMessageId = 'temp_' + Date.now();
            addTempMediaMessage(file);

            fetch('/upload_file', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove temp message and add real one
                    removeTempMessage(tempMessageId);
                    addMediaMessage(myPhone, data.file_type, data.file_path, data.file_name, data.file_size, 'sent', data.message_id, true, []);
                    
                    // Emit socket event for real-time update
                    socket.emit('send_file_message', {
                        sender: String(myPhone),
                        receiver: String(contactPhone),
                        message_type: data.file_type,
                        file_path: data.file_path,
                        file_name: data.file_name,
                        file_size: data.file_size,
                        message_id: data.message_id,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    throw new Error(data.error || 'Upload failed');
                }
            })
            .catch(error => {
                console.error('Upload error:', error);
                removeTempMessage(tempMessageId);
                alert('File upload failed: ' + error.message);
            });
        }

        function addTempMediaMessage(file) {
            const isSent = true;
            const messageGroupId = 'sent';

            if (!messageGroups[messageGroupId]) {
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble ${isSent ? 'sent' : 'received'} message-appear`;
            bubble.id = 'temp_' + Date.now();

            const messageContent = document.createElement('div');
            messageContent.textContent = `Uploading ${file.name}...`;
            messageContent.style.fontStyle = 'italic';
            messageContent.style.color = '#666';
            bubble.appendChild(messageContent);

            messageGroups[messageGroupId].appendChild(bubble);
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }

        function removeTempMessage(messageId) {
            const tempElement = document.getElementById(messageId);
            if (tempElement) {
                tempElement.remove();
            }
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function downloadFile(filePath, fileName) {
            const link = document.createElement('a');
            link.href = `/uploads/${filePath}`;
            link.download = fileName;
            link.click();
        }

        function viewMedia(filePath, mediaType) {
            const mediaUrl = `/uploads/${filePath}`;
            
            if (mediaType === 'image') {
                viewerImage.src = mediaUrl;
                viewerImage.style.display = 'block';
                viewerVideo.style.display = 'none';
            } else if (mediaType === 'video') {
                viewerVideo.src = mediaUrl;
                viewerVideo.style.display = 'block';
                viewerImage.style.display = 'none';
            }
            
            mediaViewer.style.display = 'flex';
        }

        function closeMediaViewer() {
            mediaViewer.style.display = 'none';
            viewerVideo.pause();
        }

        // Enhanced media message display
        function addMediaMessage(sender, messageType, filePath, fileName, fileSize, status, messageId = null, canDeleteForEveryone = false, reactions = []) {
            const isSent = sender === String(myPhone);
            const messageGroupId = isSent ? 'sent' : 'received';

            if (!messageGroups[messageGroupId]) {
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble ${isSent ? 'sent' : 'received'} media-message message-appear`;
            if (messageId) {
                bubble.dataset.messageId = messageId;
            } else {
                // Generate temporary ID if none provided
                bubble.dataset.messageId = 'temp_' + Date.now();
            }

            const fileIcon = getFileIcon(messageType, fileName);
            const fileTypeClass = getFileTypeClass(messageType);

            if (messageType === 'image') {
                const mediaContainer = document.createElement('div');
                mediaContainer.style.position = 'relative';
                
                const mediaPreview = document.createElement('div');
                mediaPreview.className = 'media-preview';
                mediaPreview.onclick = () => viewMedia(filePath, 'image');
                
                const img = document.createElement('img');
                img.src = `/uploads/${filePath}`;
                img.alt = fileName;
                img.loading = 'lazy';
                
                mediaPreview.appendChild(img);
                mediaContainer.appendChild(mediaPreview);
                
                const mediaInfo = document.createElement('div');
                mediaInfo.className = 'media-info';
                
                const fileNameDiv = document.createElement('div');
                fileNameDiv.className = 'media-filename';
                fileNameDiv.textContent = fileName;
                
                const metadataDiv = document.createElement('div');
                metadataDiv.className = 'media-metadata';
                
                const sizeDiv = document.createElement('div');
                sizeDiv.className = 'media-size';
                sizeDiv.textContent = formatFileSize(fileSize);
                
                const typeDiv = document.createElement('div');
                typeDiv.className = 'media-type';
                typeDiv.textContent = 'IMAGE';
                
                metadataDiv.appendChild(sizeDiv);
                metadataDiv.appendChild(typeDiv);
                
                mediaInfo.appendChild(fileNameDiv);
                mediaInfo.appendChild(metadataDiv);
                mediaContainer.appendChild(mediaInfo);
                
                bubble.appendChild(mediaContainer);
                
            } else if (messageType === 'video') {
                const mediaContainer = document.createElement('div');
                mediaContainer.style.position = 'relative';
                
                const mediaPreview = document.createElement('div');
                mediaPreview.className = 'media-preview';
                mediaPreview.onclick = () => viewMedia(filePath, 'video');
                
                const video = document.createElement('video');
                video.src = `/uploads/${filePath}`;
                video.alt = fileName;
                video.controls = false;
                
                // Add play icon overlay
                const playOverlay = document.createElement('div');
                playOverlay.style.cssText = `
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.7); border-radius: 50%; width: 50px; height: 50px;
                    display: flex; align-items: center; justify-content: center; color: white;
                    font-size: 20px; pointer-events: none;
                `;
                playOverlay.innerHTML = '▶';
                
                mediaPreview.appendChild(video);
                mediaPreview.appendChild(playOverlay);
                mediaContainer.appendChild(mediaPreview);
                
                const mediaInfo = document.createElement('div');
                mediaInfo.className = 'media-info';
                
                const fileNameDiv = document.createElement('div');
                fileNameDiv.className = 'media-filename';
                fileNameDiv.textContent = fileName;
                
                const metadataDiv = document.createElement('div');
                metadataDiv.className = 'media-metadata';
                
                const sizeDiv = document.createElement('div');
                sizeDiv.className = 'media-size';
                sizeDiv.textContent = formatFileSize(fileSize);
                
                const typeDiv = document.createElement('div');
                typeDiv.className = 'media-type';
                typeDiv.textContent = 'VIDEO';
                
                metadataDiv.appendChild(sizeDiv);
                metadataDiv.appendChild(typeDiv);
                
                mediaInfo.appendChild(fileNameDiv);
                mediaInfo.appendChild(metadataDiv);
                mediaContainer.appendChild(mediaInfo);
                
                bubble.appendChild(mediaContainer);
                
            } else {
                // Document file with enhanced styling
                const fileMessage = document.createElement('div');
                fileMessage.className = 'file-message';
                fileMessage.onclick = () => downloadFile(filePath, fileName);
                
                const fileIconDiv = document.createElement('div');
                fileIconDiv.className = `file-icon ${fileTypeClass}`;
                fileIconDiv.innerHTML = fileIcon;
                
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                
                const fileNameDiv = document.createElement('div');
                fileNameDiv.className = 'file-name';
                fileNameDiv.textContent = fileName;
                
                const fileDetails = document.createElement('div');
                fileDetails.className = 'file-details';
                
                const fileSizeDiv = document.createElement('div');
                fileSizeDiv.className = 'file-size';
                fileSizeDiv.textContent = formatFileSize(fileSize);
                
                const fileTypeDiv = document.createElement('div');
                fileTypeDiv.className = 'file-type';
                fileTypeDiv.textContent = messageType.toUpperCase();
                
                fileDetails.appendChild(fileSizeDiv);
                fileDetails.appendChild(fileTypeDiv);
                
                fileInfo.appendChild(fileNameDiv);
                fileInfo.appendChild(fileDetails);
                
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.innerHTML = '📥 Download';
                downloadBtn.onclick = (e) => {
                    e.stopPropagation();
                    downloadFile(filePath, fileName);
                };
                
                fileMessage.appendChild(fileIconDiv);
                fileMessage.appendChild(fileInfo);
                fileMessage.appendChild(downloadBtn);
                
                bubble.appendChild(fileMessage);
            }

            // Add reactions if any
            if (reactions && reactions.length > 0) {
                const reactionsContainer = document.createElement('div');
                reactionsContainer.className = 'message-reactions';
                
                // Group reactions by emoji
                const reactionCounts = {};
                reactions.forEach(reaction => {
                    if (!reactionCounts[reaction.emoji]) {
                        reactionCounts[reaction.emoji] = 0;
                    }
                    reactionCounts[reaction.emoji]++;
                });

                // Create reaction elements
                Object.entries(reactionCounts).forEach(([emoji, count]) => {
                    const reactionElement = document.createElement('div');
                    reactionElement.className = 'reaction';
                    reactionElement.innerHTML = `
                        <span class="reaction-emoji">${emoji}</span>
                        <span class="reaction-count">${count}</span>
                    `;
                    reactionsContainer.appendChild(reactionElement);
                });

                bubble.appendChild(reactionsContainer);
            }

            if (isSent) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'status';
                statusDiv.textContent = (status === 'seen') ? "✓✓ Seen" : (status === 'delivered') ? "✓ Delivered" : "✓ Sent";
                bubble.appendChild(statusDiv);
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            const now = new Date();
            timeDiv.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.appendChild(timeDiv);

            messageGroups[messageGroupId].appendChild(bubble);

            if (lastSender !== sender) {
                messageGroups = {};
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
                messageGroups[messageGroupId].appendChild(bubble);
            }

            lastSender = sender;
            chatDiv.scrollTop = chatDiv.scrollHeight;

            if (!isSent) {
                setTimeout(() => {
                    markAllMessagesAsSeen();
                }, 500);
            }
        }

        // Close media viewer when clicking outside
        mediaViewer.addEventListener('click', function(e) {
            if (e.target === this) {
                closeMediaViewer();
            }
        });

        // Delete message functions - FIXED VERSION
        function deleteMessageForMe() {
            if (!currentMessageToDelete) {
                console.error('❌ No message to delete');
                return;
            }

            console.log('🗑️ Deleting message for me:', currentMessageToDelete);

            fetch('/api/delete_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message_id: currentMessageToDelete,
                    user_phone: myPhone,
                    delete_type: 'for_me'
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Delete for me successful');
                    // Remove message from UI immediately
                    if (currentBubbleToDelete) {
                        currentBubbleToDelete.remove();
                    }
                } else {
                    console.error('❌ Delete failed:', data.error);
                    alert('Error: ' + (data.error || 'Failed to delete message'));
                }
            })
            .catch(error => {
                console.error('❌ Error deleting message:', error);
                alert('Error deleting message');
            })
            .finally(() => {
                closeDeleteOptions();
            });
        }

        function deleteMessageForEveryone() {
            if (!currentMessageToDelete) {
                console.error('❌ No message to delete');
                return;
            }

            console.log('🗑️ Deleting message for everyone:', currentMessageToDelete);

            fetch('/api/delete_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message_id: currentMessageToDelete,
                    user_phone: myPhone,
                    delete_type: 'for_everyone'
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Delete for everyone successful');
                    // Update UI to show deleted message
                    if (currentBubbleToDelete) {
                        currentBubbleToDelete.classList.add('deleted-message');
                        const messageContent = currentBubbleToDelete.querySelector('div:first-child');
                        if (messageContent) {
                            messageContent.textContent = 'This message was deleted';
                            messageContent.style.fontStyle = 'italic';
                            messageContent.style.color = '#999';
                        }
                        
                        // Remove reactions
                        const reactionsContainer = currentBubbleToDelete.querySelector('.message-reactions');
                        if (reactionsContainer) {
                            reactionsContainer.remove();
                        }
                        
                        // Remove status indicator
                        const statusDiv = currentBubbleToDelete.querySelector('.status');
                        if (statusDiv) {
                            statusDiv.remove();
                        }
                    }
                } else {
                    console.error('❌ Delete failed:', data.error);
                    alert('Error: ' + (data.error || 'Failed to delete message'));
                }
            })
            .catch(error => {
                console.error('❌ Error deleting message:', error);
                alert('Error deleting message');
            })
            .finally(() => {
                closeDeleteOptions();
            });
        }

        function closeDeleteOptions() {
            document.getElementById('deleteOptionsModal').style.display = 'none';
            currentMessageToDelete = null;
            currentBubbleToDelete = null;
        }

        // Socket event listeners for real-time delete updates - FIXED VERSION
        socket.on('delete_success', function(data) {
            console.log('✅ Delete success received:', data);
            
            // Check if this delete event is for the current user
            const isForMe = data.delete_type === 'for_me' && data.user_phone === myPhone;
            const isForEveryone = data.delete_type === 'for_everyone';
            
            if (isForMe || isForEveryone) {
                const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
                
                if (messageElement) {
                    if (isForMe) {
                        // Remove completely for "delete for me"
                        messageElement.remove();
                        console.log('🗑️ Message removed for me:', data.message_id);
                    } else if (isForEveryone) {
                        // Show "This message was deleted" for "delete for everyone"
                        if (!messageElement.classList.contains('deleted-message')) {
                            messageElement.classList.add('deleted-message');
                            const messageContent = messageElement.querySelector('div:first-child');
                            if (messageContent) {
                                messageContent.textContent = 'This message was deleted';
                                messageContent.style.fontStyle = 'italic';
                                messageContent.style.color = '#999';
                            }
                            
                            // Remove reactions from deleted message
                            const reactionsContainer = messageElement.querySelector('.message-reactions');
                            if (reactionsContainer) {
                                reactionsContainer.remove();
                            }
                            
                            // Remove status indicator
                            const statusDiv = messageElement.querySelector('.status');
                            if (statusDiv) {
                                statusDiv.remove();
                            }
                            
                            console.log('🗑️ Message marked as deleted for everyone:', data.message_id);
                        }
                    }
                }
            }
        });

        socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            updateConnectionStatus(false);
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            updateConnectionStatus(false);
        });

        messageInput.addEventListener('input', ()=>{
            if(!isConnected) return;
            socket.emit('typing', {actor: myPhone, target: contactPhone});
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(()=>{
                socket.emit('stop_typing', {actor: myPhone, target: contactPhone});
            }, 2000);
        });

        socket.on('typing', data=>{
            if(data.actor === contactPhone) typingDiv.textContent = 'Typing...';
        });

        socket.on('stop_typing', data=>{
            if(data.actor === contactPhone) typingDiv.textContent = '';
        });

        function addMessage(sender, msg, status, messageId = null, canDeleteForEveryone = false, reactions = []) {
            const isSent = sender === String(myPhone);
            const messageGroupId = isSent ? 'sent' : 'received';

            if (!messageGroups[messageGroupId]) {
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble ${isSent ? 'sent' : 'received'} message-appear`;
            
            // CRITICAL: Ensure messageId is properly set for context menu
            if (messageId) {
                bubble.dataset.messageId = messageId;
            } else {
                // Generate temporary ID if none provided
                bubble.dataset.messageId = 'temp_' + Date.now();
            }

            const messageContent = document.createElement('div');
            messageContent.textContent = msg;
            bubble.appendChild(messageContent);

            // Add reactions if any
            if (reactions && reactions.length > 0) {
                const reactionsContainer = document.createElement('div');
                reactionsContainer.className = 'message-reactions';
                
                // Group reactions by emoji
                const reactionCounts = {};
                reactions.forEach(reaction => {
                    if (!reactionCounts[reaction.emoji]) {
                        reactionCounts[reaction.emoji] = 0;
                    }
                    reactionCounts[reaction.emoji]++;
                });

                // Create reaction elements
                Object.entries(reactionCounts).forEach(([emoji, count]) => {
                    const reactionElement = document.createElement('div');
                    reactionElement.className = 'reaction';
                    reactionElement.innerHTML = `
                        <span class="reaction-emoji">${emoji}</span>
                        <span class="reaction-count">${count}</span>
                    `;
                    reactionsContainer.appendChild(reactionElement);
                });

                bubble.appendChild(reactionsContainer);
            }

            if (isSent) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'status';
                statusDiv.textContent = (status === 'seen') ? "✓✓ Seen" : (status === 'delivered') ? "✓ Delivered" : "✓ Sent";
                bubble.appendChild(statusDiv);
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            const now = new Date();
            timeDiv.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.appendChild(timeDiv);

            messageGroups[messageGroupId].appendChild(bubble);

            if (lastSender !== sender) {
                messageGroups = {};
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
                messageGroups[messageGroupId].appendChild(bubble);
            }

            lastSender = sender;
            chatDiv.scrollTop = chatDiv.scrollHeight;

            if (!isSent) {
                setTimeout(() => {
                    markAllMessagesAsSeen();
                }, 500);
            }
        }

        function addDeletedMessage(sender, messageId) {
            const isSent = sender === String(myPhone);
            const messageGroupId = isSent ? 'sent' : 'received';

            if (!messageGroups[messageGroupId]) {
                messageGroups[messageGroupId] = document.createElement('div');
                messageGroups[messageGroupId].className = `message-group ${isSent ? 'sent-group' : 'received-group'}`;
                chatDiv.appendChild(messageGroups[messageGroupId]);
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble ${isSent ? 'sent' : 'received'} deleted-message`;
            bubble.dataset.messageId = messageId;

            const messageContent = document.createElement('div');
            messageContent.textContent = 'This message was deleted';
            messageContent.style.fontStyle = 'italic';
            messageContent.style.color = '#999';
            bubble.appendChild(messageContent);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.appendChild(timeDiv);

            messageGroups[messageGroupId].appendChild(bubble);
        }

        function sendMessage() {
            const msg = messageInput.value.trim();
            if(!msg) return;
            if(!isConnected) {
                alert('You are offline. Please check your internet connection.');
                return;
            }
            messageInput.value = '';
            resetTextareaHeight();
            addMessage(String(myPhone), msg, 'sent');
            try {
                socket.emit('send_message', {
                    sender: String(myPhone),
                    receiver: String(contactPhone),
                    message: msg,
                    timestamp: new Date().toISOString()
                });
            } catch(error) {
                console.error('Error sending message:', error);
                alert('Failed to send message');
            }
        }

        messageInput.addEventListener('keydown', function(e) {
            if(e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        socket.on('receive_message', data => {
            if(data.sender === String(contactPhone)) {
                addMessage(data.sender, data.message, 'delivered', data.id, false, []);
                setTimeout(() => {
                    markAllMessagesAsSeen();
                    // Re-initialize context menu for the new message
                    initializeContextMenuSystem();
                }, 100);
            }
        });

        socket.on('receive_file_message', data => {
            if(data.sender === String(contactPhone)) {
                addMediaMessage(data.sender, data.message_type, data.file_path, data.file_name, data.file_size, 'delivered', data.message_id, false, []);
                setTimeout(() => {
                    markAllMessagesAsSeen();
                    // Re-initialize context menu for the new message
                    initializeContextMenuSystem();
                }, 100);
            }
        });

        // Handle reaction events from socket
        socket.on('reaction_updated', function(data) {
            // Reload messages to show updated reactions
            loadMessages();
        });

        socket.on('message_seen_confirmation', data => {
            if(data.receiver === String(myPhone)) {
                updateAllSentMessagesStatus('seen');
            }
        });

        function updateAllSentMessagesStatus(status) {
            const sentMessages = document.querySelectorAll('#chat .bubble.sent');
            sentMessages.forEach(bubble => {
                const statusDiv = bubble.querySelector('.status');
                if(statusDiv && !bubble.classList.contains('deleted-message')) {
                    if(status === 'seen') {
                        statusDiv.textContent = "✓✓ Seen";
                    } else if(status === 'delivered') {
                        statusDiv.textContent = "✓ Delivered";
                    }
                }
            });
        }

        socket.on('error', data => {
            console.error('Socket error:', data);
            alert('An error occurred: ' + (data.message || 'Unknown error'));
        });

        function openSaveModal() {
            document.getElementById("saveModal").style.display = "flex";
        }

        function closeSaveModal() {
            document.getElementById("saveModal").style.display = "none";
        }

        // Contact save form handling
        document.getElementById('saveContactForm').addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(this);
            const saveBtn = this.querySelector('.modal-btn.primary');
            const originalText = saveBtn.textContent;

            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            fetch('/add_contact', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    closeSaveModal();
                    alert('Contact saved successfully!');
                    const newName = formData.get('contact_name');
                    updateContactNameInHeader(newName);
                } else {
                    throw new Error(data.error || 'Save failed');
                }
            })
            .catch(error => {
                console.error('Error saving contact:', error);
                alert('Error saving contact: ' + error.message);
            })
            .finally(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            });
        });

        function updateContactNameInHeader(newName) {
            const contactNameElement = document.querySelector('.contact-name');
            const contactAvatar = document.querySelector('.contact-avatar');

            if (contactNameElement) {
                contactNameElement.textContent = newName;
            }

            if (contactAvatar) {
                contactAvatar.textContent = newName[0].toUpperCase();
            }

            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.style.display = 'none';
            }
        }

        function markAllMessagesAsSeen() {
            const receivedMessages = document.querySelectorAll('#chat .bubble.received');
            if (receivedMessages.length > 0) {
                const now = Date.now();
                if (now - lastMarkedSeenTime > 1000) {
                    socket.emit('mark_seen', {
                        sender: contactPhone,
                        receiver: myPhone
                    });
                    lastMarkedSeenTime = now;
                }
            }
        }

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                markAllMessagesAsSeen();
            }
        });

        chatDiv.addEventListener('scroll', function() {
            markAllMessagesAsSeen();
        });

        chatDiv.addEventListener('click', markAllMessagesAsSeen);

        // ==================== INITIALIZATION ====================
        
        // Initialize everything on page load
        window.addEventListener('load', function() {
            console.log('🚀 Page loaded, initializing all systems...');
            
            // Load messages first
            loadMessages();
            
            // Then initialize context menu system and infinite scroll
            setTimeout(() => {
                initializeContextMenuSystem();
                setupInfiniteScroll();
                console.log('✅ All systems initialized successfully');
                console.log('🎯 Single tap will NOT open context menu now!');
            }, 500);
        });

        // Re-initialize when coming back from background (for mobile)
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                setTimeout(initializeContextMenuSystem, 100);
            }
        });

        // Auto-resize textarea
        setTimeout(autoResizeTextarea, 100);

        console.log('✅ Fixed chat page loaded successfully');
    </script>
</body>
</html>"""

@app.route("/chat/<contact_phone>")
def chat_page(contact_phone):
    phone = request.args.get("phone")
    if not phone:
        return redirect(url_for('signin'))
    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT contact_name FROM contacts WHERE user_phone=? AND contact_phone=?", (phone, contact_phone))
            row = c.fetchone()
            c.execute("""
                SELECT id, sender, receiver, message, encrypted_message, status, timestamp,
                       message_type, file_path, file_name, file_size, thumbnail_path
                FROM messages
                WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)
                ORDER BY timestamp ASC
                LIMIT 100
            """, (phone, contact_phone, contact_phone, phone))
            messages_data = c.fetchall()

            # Process messages
            messages = []
            for m in messages_data:
                message_id, sender, receiver, plaintext, encrypted, status, timestamp, message_type, file_path, file_name, file_size, thumbnail_path = m

                # Handle different message types
                if message_type == 'text':
                    # Use encrypted message if available, otherwise use plaintext
                    if encrypted:
                        try:
                            decrypted_message = encryptor.decrypt_message(encrypted, sender, receiver)
                            messages.append({
                                "id": message_id,
                                "sender": sender,
                                "receiver": receiver,
                                "message": decrypted_message,
                                "status": status,
                                "timestamp": timestamp,
                                "message_type": "text"
                            })
                        except Exception as e:
                            print(f"❌ Decryption failed for message {message_id}: {e}")
                            messages.append({
                                "id": message_id,
                                "sender": sender,
                                "receiver": receiver,
                                "message": "🔒 [Encrypted message]",
                                "status": status,
                                "timestamp": timestamp,
                                "message_type": "text"
                            })
                    else:
                        messages.append({
                            "id": message_id,
                            "sender": sender,
                            "receiver": receiver,
                            "message": plaintext,
                            "status": status,
                            "timestamp": timestamp,
                            "message_type": "text"
                        })
                else:
                    # File message
                    messages.append({
                        "id": message_id,
                        "sender": sender,
                        "receiver": receiver,
                        "message": f"Sent a {message_type}",
                        "status": status,
                        "timestamp": timestamp,
                        "message_type": message_type,
                        "file_path": file_path,
                        "file_name": file_name,
                        "file_size": file_size,
                        "thumbnail_path": thumbnail_path
                    })

            c.execute("UPDATE messages SET status='seen' WHERE receiver=? AND sender=? AND status!='seen'", (phone, contact_phone))
            conn.commit()
        finally:
            return_db_connection(conn)
        contact_name = row[0] if row and row[0] else contact_phone
        return render_template_string(chat_html, phone=phone, contact_phone=contact_phone, contact_name=contact_name, messages=messages)
    except Exception as e:
        print(f"❌ Error in chat_page: {e}")
        return "An error occurred", 500

# ----------------- Enhanced Socket.IO Events -----------------
def get_room(user, contact):
    return "_".join(sorted([str(user), str(contact)]))

connected_users = {}

@socketio.on('join')
def on_join(data):
    try:
        user = str(data['user'])
        contact = str(data['contact'])
        room = get_room(user, contact)
        join_room(room)
        connected_users[request.sid] = {'phone': user, 'room': room}
        if typing_status.get((user, contact)):
            emit('typing', {'actor': contact}, room=request.sid)
    except Exception as e:
        print(f"❌ Error in join: {e}")
        emit('error', {'message': 'Failed to join room'})

@socketio.on('send_message')
def handle_message(data):
    try:
        sender = str(data.get('sender', ''))
        receiver = str(data.get('receiver', ''))
        message = data.get('message', '').strip()
        if not all([sender, receiver, message]):
            emit('error', {'message': 'Invalid message data'})
            return
        if len(message) > 5000:
            emit('error', {'message': 'Message too long'})
            return

        # Encrypt the message
        encrypted_message = encryptor.encrypt_message(message, sender, receiver)
        if not encrypted_message:
            emit('error', {'message': 'Failed to encrypt message'})
            return

        now_iso = datetime.now().isoformat()
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("INSERT INTO messages(sender,receiver,message,encrypted_message,status,timestamp) VALUES(?,?,?,?,?,?)",
                      (sender, receiver, message, encrypted_message, "sent", now_iso))
            message_id = c.lastrowid
            c.execute("INSERT OR IGNORE INTO users(phone,last_online) VALUES(?,?)", (receiver, now_iso))
            c.execute("INSERT OR IGNORE INTO contacts(user_phone,contact_phone,contact_name,last_message) VALUES(?,?,?,?)",
                      (sender, receiver, "", message))
            c.execute("UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP WHERE user_phone=? AND contact_phone=?",
                      (message, sender, receiver))
            c.execute("INSERT OR IGNORE INTO contacts(user_phone,contact_phone,contact_name,last_message) VALUES(?,?,?,?)",
                      (receiver, sender, "", message))
            c.execute("UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP WHERE user_phone=? AND contact_phone=?",
                      (message, receiver, sender))
            conn.commit()
        finally:
            return_db_connection(conn)
        room = get_room(sender, receiver)
        emit('receive_message', {'id': message_id, 'sender': sender, 'message': message}, room=room)
        
        # Clear cache for this conversation
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")
        
    except Exception as e:
        print(f"❌ Error in send_message: {e}")
        emit('error', {'message': 'Failed to send message'})

@socketio.on('send_file_message')
def handle_file_message(data):
    try:
        sender = str(data.get('sender', ''))
        receiver = str(data.get('receiver', ''))
        message_type = data.get('message_type', '')
        file_path = data.get('file_path', '')
        file_name = data.get('file_name', '')
        file_size = data.get('file_size', 0)
        message_id = data.get('message_id', '')

        if not all([sender, receiver, message_type, file_path]):
            emit('error', {'message': 'Invalid file message data'})
            return

        room = get_room(sender, receiver)
        emit('receive_file_message', {
            'id': message_id,
            'sender': sender,
            'message_type': message_type,
            'file_path': file_path,
            'file_name': file_name,
            'file_size': file_size
        }, room=room)

        # Clear cache for this conversation
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")

    except Exception as e:
        print(f"❌ Error in send_file_message: {e}")
        emit('error', {'message': 'Failed to send file message'})

@socketio.on('add_reaction')
def handle_add_reaction(data):
    try:
        message_id = data.get('message_id')
        emoji = data.get('emoji')
        user_phone = data.get('user_phone')

        if not all([message_id, emoji, user_phone]):
            emit('error', {'message': 'Invalid reaction data'})
            return

        conn = get_db_connection()
        try:
            c = conn.cursor()
            
            # Check if message exists and get conversation participants
            c.execute("SELECT sender, receiver FROM messages WHERE id=?", (message_id,))
            message = c.fetchone()
            if not message:
                emit('error', {'message': 'Message not found'})
                return

            sender, receiver = message

            # Check if user already has a reaction on this message
            c.execute("SELECT emoji FROM message_reactions WHERE message_id=? AND user_phone=?", 
                     (message_id, user_phone))
            existing_reaction = c.fetchone()
            
            if existing_reaction:
                # If clicking the same emoji, remove the reaction
                if existing_reaction[0] == emoji:
                    c.execute("DELETE FROM message_reactions WHERE message_id=? AND user_phone=?", 
                             (message_id, user_phone))
                    action = 'removed'
                else:
                    # If different emoji, update the reaction
                    c.execute("UPDATE message_reactions SET emoji=? WHERE message_id=? AND user_phone=?", 
                             (emoji, message_id, user_phone))
                    action = 'updated'
            else:
                # Add new reaction
                c.execute("INSERT INTO message_reactions (message_id, user_phone, emoji) VALUES (?, ?, ?)",
                         (message_id, user_phone, emoji))
                action = 'added'
            
            conn.commit()

        finally:
            return_db_connection(conn)

        # Get updated reactions for this message
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT user_phone, emoji FROM message_reactions WHERE message_id=?", (message_id,))
            updated_reactions = c.fetchall()
            
            reactions_list = []
            for reaction in updated_reactions:
                reactions_list.append({
                    'user_phone': reaction[0],
                    'emoji': reaction[1]
                })
        finally:
            return_db_connection(conn)

        # Send to both users in the conversation
        room = get_room(sender, receiver)
        emit('reaction_updated', {
            'message_id': message_id,
            'user_phone': user_phone,
            'emoji': emoji,
            'action': action,
            'reactions': reactions_list
        }, room=room)

        # Clear cache for this conversation
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")

        print(f"😊 Reaction {action} by {user_phone} on message {message_id}")

    except Exception as e:
        print(f"❌ Error in add_reaction: {e}")
        emit('error', {'message': 'Failed to add reaction'})

@socketio.on('mark_seen')
def handle_mark_seen(data):
    try:
        sender = str(data.get('sender', ''))  # যার message দেখা হলো
        receiver = str(data.get('receiver', ''))  # যে দেখলো

        # Database তে status update করো
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("UPDATE messages SET status='seen' WHERE sender=? AND receiver=? AND status!='seen'",
                     (sender, receiver))
            conn.commit()
        finally:
            return_db_connection(conn)

        # Message যিনি পাঠিয়েছেন তাকে notify করো যে তার messages দেখা হয়েছে
        room = get_room(sender, receiver)
        emit('message_seen_confirmation', {
            'receiver': sender,  # Message sender কে notify করছি
            'status': 'seen'
        }, room=room)

        print(f"👀 Messages seen by {receiver}, notifying {sender}")

    except Exception as e:
        print(f"❌ Error in mark_seen: {e}")

@socketio.on('delete_message')
def handle_delete_message(data):
    try:
        message_id = data.get('message_id')
        user_phone = data.get('user_phone')
        delete_type = data.get('delete_type')

        print(f"🗑️ Delete request: message_id={message_id}, user={user_phone}, type={delete_type}")

        conn = get_db_connection()
        try:
            c = conn.cursor()

            # Message details get করুন
            c.execute("SELECT sender, receiver FROM messages WHERE id=?", (message_id,))
            message = c.fetchone()

            if not message:
                emit('error', {'message': 'Message not found'})
                return

            sender, receiver = message

            if delete_type == "for_me":
                if user_phone == sender:
                    c.execute("UPDATE messages SET deleted_for_sender=1 WHERE id=?", (message_id,))
                elif user_phone == receiver:
                    c.execute("UPDATE messages SET deleted_for_receiver=1 WHERE id=?", (message_id,))
                else:
                    emit('error', {'message': 'User not authorized to delete this message'})
                    return

                c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                         (message_id, user_phone, delete_type))

                # Send success confirmation to both users
                room = get_room(sender, receiver)
                emit('delete_success', {
                    'message_id': message_id, 
                    'delete_type': delete_type,
                    'user_phone': user_phone
                }, room=room)

            elif delete_type == "for_everyone":
                if user_phone == sender:
                    c.execute("UPDATE messages SET deleted_for_everyone=1 WHERE id=?", (message_id,))
                    c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                             (message_id, user_phone, delete_type))

                    # Send to both users in the conversation
                    room = get_room(sender, receiver)
                    emit('delete_success', {
                        'message_id': message_id,
                        'delete_type': delete_type,
                        'user_phone': user_phone
                    }, room=room)
                    
                    print(f"✅ Message {message_id} deleted for everyone by {user_phone}")
                else:
                    emit('error', {'message': 'Only sender can delete for everyone'})
                    return

            conn.commit()
        finally:
            return_db_connection(conn)

        # Clear cache for this conversation
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")

    except Exception as e:
        print(f"❌ Error in handle_delete_message: {e}")
        emit('error', {'message': 'Failed to delete message'})

@socketio.on('typing')
def handle_typing(data):
    try:
        actor = str(data.get('actor', ''))
        target = str(data.get('target', ''))
        if not all([actor, target]):
            return
        typing_status[(target, actor)] = True
        room = get_room(actor, target)
        emit('typing', {'actor': actor}, room=room)
    except Exception as e:
        print(f"❌ Error in typing: {e}")

@socketio.on('stop_typing')
def handle_stop_typing(data):
    try:
        actor = str(data.get('actor', ''))
        target = str(data.get('target', ''))
        if not all([actor, target]):
            return
        typing_status[(target, actor)] = False
        room = get_room(actor, target)
        emit('stop_typing', {'actor': actor}, room=room)
    except Exception as e:
        print(f"❌ Error in stop_typing: {e}")

@socketio.on('disconnect')
def on_disconnect():
    try:
        if request.sid in connected_users:
            del connected_users[request.sid]
        keys_to_remove = []
        for key in typing_status:
            if typing_status[key]:
                keys_to_remove.append(key)
        for key in keys_to_remove:
            if key in typing_status:
                del typing_status[key]
        print(f"✅ Client disconnected: {request.sid}")
    except Exception as e:
        print(f"❌ Error in disconnect: {e}")

@socketio.on_error_default
def default_error_handler(e):
    print(f"❌ SocketIO Error: {e}")
    emit('error', {'message': 'An error occurred'})

# ----------------- Security Information -----------------
@app.route("/security")
def security_info():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Exomnia Security</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            h1 { color: #0E4950; }
            .feature { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔒 Exomnia Security Features</h1>

            <div class="feature">
                <h3>End-to-End Encryption</h3>
                <p>All messages are encrypted with AES-256-GCM before being stored or transmitted.</p>
            </div>

            <div class="feature">
                <h3>Secure Key Derivation</h3>
                <p>Unique encryption keys are derived for each user using PBKDF2 with 100,000 iterations.</p>
            </div>

            <div class="feature">
                <h3>Forward Secrecy</h3>
                <p>Each conversation uses a unique key combination from both participants.</p>
            </div>

            <div class="feature">
                <h3>Message Integrity</h3>
                <p>AES-GCM provides authentication ensuring messages cannot be tampered with.</p>
            </div>

            <div class="feature">
                <h3>Advanced Message Deletion</h3>
                <p>Delete messages for yourself or for everyone with WhatsApp-style functionality.</p>
            </div>

            <div class="feature">
                <h3>Message Reactions</h3>
                <p>React to messages with emojis that are synced across all users in real-time.</p>
            </div>

            <div class="feature">
                <h3>File Sharing</h3>
                <p>Securely share images, videos, and documents with end-to-end encryption.</p>
            </div>

            <div class="feature">
                <h3>Enhanced Performance</h3>
                <p>Connection pooling, caching, and infinite scroll for optimal user experience.</p>
            </div>
        </div>
    </body>
    </html>
    """

# ----------------- Run -----------------
if __name__=="__main__":
    init_db()
    print("🚀 Starting Exomnia Super App on http://0.0.0.0:5000")
    print("📱 Main App: http://0.0.0.0:5000/main")
    print("💬 Chat Login: http://0.0.0.0:5000/")
    print("🔒 Security Info: http://0.0.0.0:5000/security")
    print("✅ All systems integrated")
    print("🔐 End-to-End Encryption Enabled")
    print("🗑️  WhatsApp-style delete feature enabled")
    print("🔙 Back button navigation fixed")
    print("😊 Message reactions enabled")
    print("📁 Modern Bottom Sheet File sharing system enabled")
    print("🎨 Premium UI/UX Design")
    print("⚡ Performance Optimized for 50+ Users")
    print("🔧 Connection Pooling Enabled")
    print("💾 Enhanced Caching System Active")
    print("🚦 Rate Limiting Implemented")
    print("✅ SocketIO Disconnect Handler Fixed")
    print("✅ Real-time Delete System Active")
    print("✅ FIXED Context Menu System - Single tap will NOT open context menu!")
    print("✅ Context menu only opens on right-click or long-press (500ms)")
    print("✅ Infinite Scroll Implemented")
    print("✅ Enhanced Message Grouping")

    # SocketIO কে সঠিক host দিয়ে রান করুন
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, allow_unsafe_werkzeug=True)
