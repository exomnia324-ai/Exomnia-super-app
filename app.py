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
    logger=True,  # Debugging enabled
    engineio_logger=True  # Debugging enabled
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
      console.log('Opening tab:', tabName);
      
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
      console.log('Is logged in?', isLoggedIn);

      if (tabName === 'chat') {
        if (isLoggedIn) {
          // User is logged in - load contacts
          console.log('Loading contacts for:', isLoggedIn);
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
      console.log('Fetching contacts for:', phone);
      fetch(`/api/contacts?phone=${encodeURIComponent(phone)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          return response.json();
        })
        .then(contacts => {
          console.log('Contacts received:', contacts);
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
              <p style="color: gray; font-size: 12px;">Error: ${error.message}</p>
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
      console.log('Page loaded, checking login status...');
      
      // URL থেকে logged_in_phone পড়ুন
      const urlParams = new URLSearchParams(window.location.search);
      const loggedInPhone = urlParams.get('logged_in_phone');
      console.log('URL param logged_in_phone:', loggedInPhone);
      
      if (loggedInPhone) {
        console.log('Setting phone in localStorage:', loggedInPhone);
        localStorage.setItem('exomnia_user_phone', loggedInPhone);
        
        // URL থেকে parameter সরান
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        console.log('URL cleaned, now showing chat tab');
        
        // Automatically open chat tab
        const chatTab = document.querySelector('.tab[onclick*="chat"]');
        if (chatTab) {
          openTab('chat', chatTab);
        } else {
          openTab('chat');
        }
      } else {
        // Check if already logged in
        const savedPhone = localStorage.getItem('exomnia_user_phone');
        console.log('Saved phone from localStorage:', savedPhone);
        
        if (savedPhone) {
          console.log('Already logged in, opening chat tab');
          const chatTab = document.querySelector('.tab[onclick*="chat"]');
          if (chatTab) {
            openTab('chat', chatTab);
          } else {
            openTab('chat');
          }
        } else {
          console.log('Not logged in, showing chat tab with login prompt');
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

        print(f"🔑 Signin attempt - Phone: {phone}, Username: {username}")

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
            
            # main_app রুটে redirect করুন - URL parameter হিসেবে phone পাঠান
            print(f"🔗 Redirecting to /main?logged_in_phone={phone}")
            return redirect(url_for('main_app', logged_in_phone=phone))
            
        except Exception as e:
            print(f"❌ Error in signin: {e}")
            return render_template_string(signin_html, error="An error occurred. Please try again.")

    return render_template_string(signin_html)

@app.route("/main")
def main_app():
    logged_in_phone = request.args.get('logged_in_phone')
    print(f"📱 Main app accessed. Phone from URL: {logged_in_phone}")
    
    # সরাসরি main_app_html রেন্ডার করুন
    # JavaScript URL থেকে phone পড়বে এবং localStorage এ সেভ করবে
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

# ==================== INSTANT DELETE API ====================
@app.route("/api/delete_message", methods=["POST"])
@rate_limit(limit=20, window=60)  # 20 deletes per minute
def api_delete_message():
    """INSTANT DELETE - Works for both users without refresh"""
    try:
        data = request.get_json()
        message_id = data.get("message_id")
        user_phone = data.get("user_phone")
        delete_type = data.get("delete_type")  # 'for_me' or 'for_everyone'

        print(f"🗑️ INSTANT DELETE: message_id={message_id}, user={user_phone}, type={delete_type}")

        if not all([message_id, user_phone, delete_type]):
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        # For temporary messages
        if isinstance(message_id, str) and message_id.startswith('temp_'):
            print(f"🔥 Temp message delete: {message_id}")
            return jsonify({
                "success": True, 
                "message": "Temporary message deleted",
                "is_temp": True,
                "temp_id": message_id
            })

        conn = get_db_connection()
        try:
            c = conn.cursor()

            # Get message details
            c.execute("SELECT id, sender, receiver FROM messages WHERE id=?", (message_id,))
            message = c.fetchone()

            if not message:
                print(f"❌ Message not found: {message_id}")
                return jsonify({"success": False, "error": "Message not found"}), 404

            msg_id, sender, receiver = message
            print(f"📩 Message found: id={msg_id}, sender={sender}, receiver={receiver}")

            # Track who's deleting
            is_sender = user_phone == sender
            is_receiver = user_phone == receiver
            
            print(f"👤 Delete by: {user_phone} (sender={is_sender}, receiver={is_receiver})")

            if delete_type == "for_me":
                # Delete only for this user
                if is_sender:
                    c.execute("UPDATE messages SET deleted_for_sender=1 WHERE id=?", (message_id,))
                    print(f"✅ Set deleted_for_sender for message {message_id}")
                elif is_receiver:
                    c.execute("UPDATE messages SET deleted_for_receiver=1 WHERE id=?", (message_id,))
                    print(f"✅ Set deleted_for_receiver for message {message_id}")
                else:
                    return jsonify({"success": False, "error": "User not authorized"}), 403

                # Track in deleted_messages
                c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                         (message_id, user_phone, delete_type))
                print(f"✅ Tracked in deleted_messages")

            elif delete_type == "for_everyone":
                # Delete for everyone - only sender can do this
                if is_sender:
                    c.execute("UPDATE messages SET deleted_for_everyone=1 WHERE id=?", (message_id,))
                    print(f"✅ Set deleted_for_everyone for message {message_id}")
                    
                    # Also mark as deleted for sender (since they initiated delete for everyone)
                    c.execute("UPDATE messages SET deleted_for_sender=1 WHERE id=?", (message_id,))
                    print(f"✅ Also marked as deleted_for_sender")
                    
                    # Track in deleted_messages
                    c.execute("INSERT INTO deleted_messages (message_id, user_phone, delete_type) VALUES (?, ?, ?)",
                             (message_id, user_phone, delete_type))
                    print(f"✅ Tracked in deleted_messages (for everyone)")
                else:
                    return jsonify({"success": False, "error": "Only sender can delete for everyone"}), 403

            conn.commit()
            print(f"✅ Database commit successful")
            
        finally:
            return_db_connection(conn)

        # Clear cache for BOTH users
        cache.clear_pattern(f"messages_{sender}_{receiver}")
        cache.clear_pattern(f"messages_{receiver}_{sender}")
        cache.clear_pattern(f"contacts_{sender}")
        cache.clear_pattern(f"contacts_{receiver}")
        print(f"✅ Cleared cache for both users")

        # Create room for real-time notification
        room = f"chat_{sender}_{receiver}" if sender < receiver else f"chat_{receiver}_{sender}"
        
        # Return success with all necessary data for real-time update
        return jsonify({
            "success": True, 
            "message": "Message deleted successfully",
            "message_id": message_id,
            "sender": sender,
            "receiver": receiver,
            "delete_type": delete_type,
            "deleted_by": user_phone,
            "deleted_for_everyone": delete_type == "for_everyone",
            "room": room,
            "should_update_ui": True
        })

    except Exception as e:
        print(f"❌ Error in api_delete_message: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": "An error occurred"}), 500

@app.route("/api/get_messages")
@rate_limit(limit=50, window=60)  # 50 requests per minute
def api_get_messages():
    """Get messages with proper delete filtering"""
    user_phone = request.args.get("user_phone")
    contact_phone = request.args.get("contact_phone")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    offset = (page - 1) * limit

    if not all([user_phone, contact_phone]):
        return jsonify([]), 400

    cache_key = f"messages_{user_phone}_{contact_phone}_page_{page}"
    cached_messages = cache.get(cache_key)
    if cached_messages:
        return jsonify(cached_messages)

    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            
            # Get all messages regardless of delete status
            c.execute("""
                SELECT m.id, m.sender, m.receiver, m.message, m.encrypted_message, m.status, m.timestamp,
                       m.deleted_for_sender, m.deleted_for_receiver, m.deleted_for_everyone,
                       m.message_type, m.file_path, m.file_name, m.file_size, m.thumbnail_path
                FROM messages m
                WHERE ((m.sender=? AND m.receiver=?) OR (m.sender=? AND m.receiver=?))
                ORDER BY m.timestamp ASC
                LIMIT ? OFFSET ?
            """, (user_phone, contact_phone, contact_phone, user_phone, limit, offset))
            
            messages_data = c.fetchall()
            print(f"📨 Loaded {len(messages_data)} messages from DB for {user_phone}")

            # Get reactions
            message_ids = [str(m[0]) for m in messages_data if m[0]]
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
                    msg_id, r_user_phone, emoji = reaction
                    if msg_id not in reactions_dict:
                        reactions_dict[msg_id] = []
                    reactions_dict[msg_id].append({
                        'user_phone': r_user_phone,
                        'emoji': emoji
                    })
        finally:
            return_db_connection(conn)

        messages = []
        for m in messages_data:
            (message_id, sender, receiver, plaintext, encrypted, status, timestamp,
             deleted_for_sender, deleted_for_receiver, deleted_for_everyone,
             message_type, file_path, file_name, file_size, thumbnail_path) = m

            # Check if this user should see this message
            is_sender = user_phone == sender
            is_receiver = user_phone == receiver
            
            should_show = True
            is_deleted = False
            
            # Check delete status
            if deleted_for_everyone:
                is_deleted = True
            elif is_sender and deleted_for_sender:
                is_deleted = True
            elif is_receiver and deleted_for_receiver:
                is_deleted = True

            # Get reactions for this message
            reactions = reactions_dict.get(message_id, [])

            if is_deleted:
                # Show deleted message placeholder
                messages.append({
                    "id": message_id,
                    "sender": sender,
                    "receiver": receiver,
                    "message": "This message was deleted",
                    "status": "deleted",
                    "timestamp": timestamp,
                    "is_deleted": True,
                    "deleted_for_everyone": bool(deleted_for_everyone),
                    "reactions": [],
                    "message_type": "text",
                    "can_delete_for_everyone": False
                })
            else:
                # Show normal message
                if message_type == 'text':
                    if encrypted:
                        try:
                            decrypted_message = encryptor.decrypt_message(encrypted, sender, receiver)
                            message_content = decrypted_message
                        except Exception as e:
                            message_content = "🔒 [Encrypted message]"
                    else:
                        message_content = plaintext
                else:
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
                    "thumbnail_path": thumbnail_path
                })

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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; height: 100vh; background: #A8D0CF; }
        
        #chat-header {
            background: #0E4950;
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        #chat {
            height: calc(100vh - 140px);
            overflow-y: auto;
            padding: 15px;
        }
        
        .message {
            margin: 10px 0;
            padding: 10px 15px;
            border-radius: 18px;
            max-width: 70%;
            word-wrap: break-word;
        }
        
        .sent {
            background: #dcf8c6;
            margin-left: auto;
            border-bottom-right-radius: 5px;
        }
        
        .received {
            background: white;
            margin-right: auto;
            border-bottom-left-radius: 5px;
        }
        
        .deleted {
            background: #f5f5f5 !important;
            color: #999 !important;
            font-style: italic;
            border: 1px dashed #ddd !important;
        }
        
        #message-box {
            position: fixed;
            bottom: 0;
            width: 100%;
            background: white;
            padding: 10px;
            display: flex;
            gap: 10px;
            border-top: 1px solid #ddd;
        }
        
        #message {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 20px;
            resize: none;
        }
        
        #send-btn {
            background: #0E4950;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
        }
        
        .context-menu {
            position: fixed;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            display: none;
            z-index: 1000;
        }
        
        .context-item {
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        }
        
        .context-item:hover {
            background: #f5f5f5;
        }
        
        .delete-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            justify-content: center;
            align-items: center;
            z-index: 2000;
        }
        
        .delete-content {
            background: white;
            padding: 20px;
            border-radius: 10px;
            width: 300px;
            text-align: center;
        }
        
        .delete-btn {
            padding: 10px;
            margin: 5px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
        }
        
        .for-me { background: #ff9800; color: white; }
        .for-everyone { background: #f44336; color: white; }
        .cancel { background: #ddd; }
    </style>
</head>
<body>
    <div id="chat-header">
        <button onclick="goBack()">← Back</button>
        <div>{{ contact_name }}</div>
        <div></div>
    </div>
    
    <div id="chat"></div>
    
    <div id="message-box">
        <textarea id="message" placeholder="Type a message..." rows="1"></textarea>
        <button id="send-btn" onclick="sendMessage()">➤</button>
    </div>
    
    <div id="contextMenu" class="context-menu">
        <div class="context-item" onclick="copyMessage()">Copy</div>
        <div class="context-item" onclick="showDeleteOptions()">Delete</div>
    </div>
    
    <div id="deleteModal" class="delete-modal">
        <div class="delete-content">
            <h3>Delete Message</h3>
            <p>Choose how to delete this message:</p>
            <button class="delete-btn for-me" onclick="deleteForMe()">Delete for Me</button>
            <button class="delete-btn for-everyone" onclick="deleteForEveryone()" id="deleteForEveryoneBtn">Delete for Everyone</button>
            <button class="delete-btn cancel" onclick="closeDeleteModal()">Cancel</button>
        </div>
    </div>

    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <script>
        let myPhone = {{ phone|tojson }};
        let contactPhone = {{ contact_phone|tojson }};
        let chatDiv = document.getElementById('chat');
        let currentDeleteMessageId = null;
        let currentDeleteMessageElement = null;
        
        // Socket connection
        const socket = io();
        
        // Join chat room
        socket.emit('join_chat', {
            user: myPhone,
            contact: contactPhone
        });
        
        // Load messages on page load
        window.addEventListener('load', loadMessages);
        
        function loadMessages() {
            fetch(`/api/get_messages?user_phone=${encodeURIComponent(myPhone)}&contact_phone=${encodeURIComponent(contactPhone)}`)
                .then(res => res.json())
                .then(messages => {
                    chatDiv.innerHTML = '';
                    messages.forEach(msg => {
                        addMessageToChat(msg, false);
                    });
                    scrollToBottom();
                });
        }
        
        function addMessageToChat(msg, isNew = true) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.sender === myPhone ? 'sent' : 'received'}`;
            messageDiv.dataset.messageId = msg.id;
            
            // If message is deleted, show deleted placeholder
            if (msg.is_deleted || msg.message === "This message was deleted") {
                messageDiv.classList.add('deleted');
                messageDiv.innerHTML = `
                    <div style="color: #999; font-style: italic;">This message was deleted</div>
                    <div style="font-size: 10px; color: #999; margin-top: 5px;">
                        ${new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                `;
            } else {
                // Normal message
                messageDiv.innerHTML = `
                    <div>${msg.message}</div>
                    <div style="font-size: 10px; color: #666; margin-top: 5px; display: flex; justify-content: space-between;">
                        <span>${new Date(msg.timestamp).toLocaleTimeString()}</span>
                        ${msg.sender === myPhone ? `<span>${msg.status === 'seen' ? '✓✓' : '✓'}</span>` : ''}
                    </div>
                `;
                
                // Add right-click context menu for messages I sent
                if (msg.sender === myPhone) {
                    messageDiv.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        currentDeleteMessageId = msg.id;
                        currentDeleteMessageElement = this;
                        
                        // Show delete for everyone button only for messages I sent
                        document.getElementById('deleteForEveryoneBtn').style.display = 'block';
                        
                        const contextMenu = document.getElementById('contextMenu');
                        contextMenu.style.left = e.pageX + 'px';
                        contextMenu.style.top = e.pageY + 'px';
                        contextMenu.style.display = 'block';
                    });
                }
            }
            
            if (isNew) {
                messageDiv.style.animation = 'fadeIn 0.3s';
                chatDiv.appendChild(messageDiv);
                scrollToBottom();
            } else {
                chatDiv.appendChild(messageDiv);
            }
        }
        
        function scrollToBottom() {
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }
        
        // Message sending
        function sendMessage() {
            const messageInput = document.getElementById('message');
            const text = messageInput.value.trim();
            
            if (!text) return;
            
            // Add temporary message to UI
            const tempMsg = {
                id: 'temp_' + Date.now(),
                sender: myPhone,
                receiver: contactPhone,
                message: text,
                timestamp: new Date().toISOString(),
                status: 'sent'
            };
            
            addMessageToChat(tempMsg);
            messageInput.value = '';
            
            // Send via socket
            socket.emit('send_message', {
                sender: myPhone,
                receiver: contactPhone,
                message: text
            });
        }
        
        // Enter key to send
        document.getElementById('message').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Receive messages via socket
        socket.on('receive_message', function(data) {
            if (data.sender === contactPhone) {
                addMessageToChat({
                    id: data.id || 'temp_' + Date.now(),
                    sender: data.sender,
                    receiver: data.receiver,
                    message: data.message,
                    timestamp: data.timestamp || new Date().toISOString(),
                    status: 'delivered'
                });
            }
        });
        
        // ============= INSTANT DELETE SYSTEM =============
        
        function showDeleteOptions() {
            document.getElementById('contextMenu').style.display = 'none';
            document.getElementById('deleteModal').style.display = 'flex';
        }
        
        function closeDeleteModal() {
            document.getElementById('deleteModal').style.display = 'none';
            currentDeleteMessageId = null;
            currentDeleteMessageElement = null;
        }
        
        function deleteForMe() {
            if (!currentDeleteMessageId || !currentDeleteMessageElement) return;
            
            console.log('🗑️ Deleting for me:', currentDeleteMessageId);
            
            // INSTANT UI UPDATE - Mark as deleted immediately
            currentDeleteMessageElement.classList.add('deleted');
            currentDeleteMessageElement.innerHTML = `
                <div style="color: #999; font-style: italic;">This message was deleted</div>
                <div style="font-size: 10px; color: #999; margin-top: 5px;">
                    ${new Date().toLocaleTimeString()}
                </div>
            `;
            
            // Send delete request
            fetch('/api/delete_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: currentDeleteMessageId,
                    user_phone: myPhone,
                    delete_type: 'for_me'
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Delete successful');
                    
                    // Emit socket event for other user
                    socket.emit('message_deleted', {
                        message_id: currentDeleteMessageId,
                        sender: data.sender,
                        receiver: data.receiver,
                        delete_type: 'for_me',
                        deleted_by: myPhone
                    });
                }
            });
            
            closeDeleteModal();
        }
        
        function deleteForEveryone() {
            if (!currentDeleteMessageId || !currentDeleteMessageElement) return;
            
            console.log('🗑️ Deleting for everyone:', currentDeleteMessageId);
            
            // INSTANT UI UPDATE - Mark as deleted immediately for BOTH users
            currentDeleteMessageElement.classList.add('deleted');
            currentDeleteMessageElement.innerHTML = `
                <div style="color: #999; font-style: italic;">This message was deleted</div>
                <div style="font-size: 10px; color: #999; margin-top: 5px;">
                    ${new Date().toLocaleTimeString()}
                </div>
            `;
            
            // Send delete request
            fetch('/api/delete_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: currentDeleteMessageId,
                    user_phone: myPhone,
                    delete_type: 'for_everyone'
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Delete for everyone successful');
                    
                    // Emit socket event for other user
                    socket.emit('message_deleted', {
                        message_id: currentDeleteMessageId,
                        sender: data.sender,
                        receiver: data.receiver,
                        delete_type: 'for_everyone',
                        deleted_by: myPhone,
                        room: data.room
                    });
                }
            });
            
            closeDeleteModal();
        }
        
        // Listen for delete events from other user
        socket.on('message_deleted', function(data) {
            console.log('⚡ Received delete event:', data);
            
            const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
            
            if (messageElement) {
                if (data.delete_type === 'for_everyone') {
                    // Update UI INSTANTLY - no refresh needed
                    messageElement.classList.add('deleted');
                    messageElement.innerHTML = `
                        <div style="color: #999; font-style: italic;">This message was deleted</div>
                        <div style="font-size: 10px; color: #999; margin-top: 5px;">
                            ${new Date().toLocaleTimeString()}
                        </div>
                    `;
                    console.log('✅ UI updated instantly for other user!');
                } else if (data.delete_type === 'for_me' && data.deleted_by === myPhone) {
                    // Only remove if I deleted it for myself
                    messageElement.remove();
                }
            } else {
                console.log('⚠️ Message element not found, reloading messages...');
                loadMessages();
            }
        });
        
        // Close context menu when clicking elsewhere
        document.addEventListener('click', function() {
            document.getElementById('contextMenu').style.display = 'none';
        });
        
        function copyMessage() {
            // Copy message text
            document.getElementById('contextMenu').style.display = 'none';
        }
        
        function goBack() {
            window.history.back();
        }
        
        // Auto-resize textarea
        document.getElementById('message').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        console.log('✅ INSTANT DELETE SYSTEM LOADED');
        console.log('🔥 No refresh needed - updates happen instantly!');
        console.log('✅ Both users will see delete immediately!');
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
            
            # Mark messages as seen
            c.execute("UPDATE messages SET status='seen' WHERE receiver=? AND sender=? AND status!='seen'", (phone, contact_phone))
            conn.commit()
        finally:
            return_db_connection(conn)
        contact_name = row[0] if row and row[0] else contact_phone
        return render_template_string(chat_html, phone=phone, contact_phone=contact_phone, contact_name=contact_name)
    except Exception as e:
        print(f"❌ Error in chat_page: {e}")
        return "An error occurred", 500

# ==================== SIMPLE SOCKET SYSTEM ====================
active_rooms = {}

@socketio.on('connect')
def handle_connect():
    print(f"✅ Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"❌ Client disconnected: {request.sid}")
    # Remove from active rooms
    for room, users in list(active_rooms.items()):
        if request.sid in users:
            users.remove(request.sid)
            if not users:
                del active_rooms[room]

@socketio.on('join_chat')
def handle_join_chat(data):
    try:
        user = str(data.get('user'))
        contact = str(data.get('contact'))
        
        # Create room ID
        room = f"chat_{user}_{contact}" if user < contact else f"chat_{contact}_{user}"
        
        join_room(room)
        
        # Track active users in room
        if room not in active_rooms:
            active_rooms[room] = []
        if request.sid not in active_rooms[room]:
            active_rooms[room].append(request.sid)
        
        print(f"✅ User {user} joined room {room} (with {contact})")
        print(f"📊 Active in room {room}: {len(active_rooms.get(room, []))} users")
        
        emit('joined_chat', {'room': room, 'success': True})
        
    except Exception as e:
        print(f"❌ Error in join_chat: {e}")
        emit('error', {'message': 'Failed to join chat'})

@socketio.on('send_message')
def handle_send_message(data):
    try:
        sender = str(data.get('sender'))
        receiver = str(data.get('receiver'))
        message = data.get('message', '').strip()
        
        if not all([sender, receiver, message]):
            emit('error', {'message': 'Invalid message'})
            return
        
        # Encrypt message
        encrypted_message = encryptor.encrypt_message(message, sender, receiver)
        if not encrypted_message:
            emit('error', {'message': 'Encryption failed'})
            return
        
        # Save to database
        now_iso = datetime.now().isoformat()
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("INSERT INTO messages(sender, receiver, message, encrypted_message, status, timestamp) VALUES(?,?,?,?,?,?)",
                     (sender, receiver, message, encrypted_message, "sent", now_iso))
            message_id = c.lastrowid
            
            # Update contacts
            c.execute("INSERT OR IGNORE INTO contacts(user_phone, contact_phone, contact_name, last_message) VALUES(?,?,?,?)",
                     (sender, receiver, "", message))
            c.execute("UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP WHERE user_phone=? AND contact_phone=?",
                     (message, sender, receiver))
            
            c.execute("INSERT OR IGNORE INTO contacts(user_phone, contact_phone, contact_name, last_message) VALUES(?,?,?,?)",
                     (receiver, sender, "", message))
            c.execute("UPDATE contacts SET last_message=?, timestamp=CURRENT_TIMESTAMP WHERE user_phone=? AND contact_phone=?",
                     (message, receiver, sender))
            
            conn.commit()
        finally:
            return_db_connection(conn)
        
        # Create room for broadcasting
        room = f"chat_{sender}_{receiver}" if sender < receiver else f"chat_{receiver}_{sender}"
        
        # Broadcast to both users
        emit('receive_message', {
            'id': message_id,
            'sender': sender,
            'receiver': receiver,
            'message': message,
            'timestamp': now_iso
        }, room=room)
        
        print(f"📩 Message {message_id} sent from {sender} to {receiver} in room {room}")
        
    except Exception as e:
        print(f"❌ Error in send_message: {e}")
        emit('error', {'message': 'Failed to send message'})

# ==================== INSTANT DELETE SOCKET EVENT ====================
@socketio.on('message_deleted')
def handle_message_deleted(data):
    """Handle INSTANT delete notifications"""
    try:
        message_id = data.get('message_id')
        sender = data.get('sender')
        receiver = data.get('receiver')
        delete_type = data.get('delete_type')
        deleted_by = data.get('deleted_by')
        room = data.get('room')
        
        print(f"⚡ INSTANT DELETE EVENT: message_id={message_id}, delete_type={delete_type}, deleted_by={deleted_by}")
        
        # If room is provided, use it, otherwise create room
        if not room:
            room = f"chat_{sender}_{receiver}" if sender < receiver else f"chat_{receiver}_{sender}"
        
        # Broadcast delete event to BOTH users in the room
        emit('message_deleted', {
            'message_id': message_id,
            'delete_type': delete_type,
            'deleted_by': deleted_by
        }, room=room)
        
        print(f"✅ Delete event broadcasted to room {room}")
        print(f"✅ BOTH users will see delete instantly without refresh!")
        
    except Exception as e:
        print(f"❌ Error in message_deleted: {e}")
        emit('error', {'message': 'Failed to process delete'})

@socketio.on('typing')
def handle_typing(data):
    try:
        actor = str(data.get('actor', ''))
        target = str(data.get('target', ''))
        if not all([actor, target]):
            return
        
        room = f"chat_{actor}_{target}" if actor < target else f"chat_{target}_{actor}"
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
        
        room = f"chat_{actor}_{target}" if actor < target else f"chat_{target}_{actor}"
        emit('stop_typing', {'actor': actor}, room=room)
    except Exception as e:
        print(f"❌ Error in stop_typing: {e}")

# ----------------- Run -----------------
if __name__=="__main__":
    init_db()
    print("=" * 80)
    print("🚀 EXOMNIA - INSTANT DELETE SYSTEM")
    print("=" * 80)
    print("✅ NO REFRESH NEEDED - Updates happen instantly!")
    print("✅ Both users see delete immediately!")
    print("✅ WhatsApp-style experience")
    print("=" * 80)
    print("🔥 TEST INSTRUCTIONS:")
    print("1. Open TWO browser tabs")
    print("2. Login with two different phone numbers")
    print("3. Add each other as contacts")
    print("4. Send messages")
    print("5. Delete a message - BOTH will see it instantly!")
    print("=" * 80)
    print("📱 Main App: http://localhost:5000/main")
    print("🔑 Sign In: http://localhost:5000/")
    print("=" * 80)

    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
