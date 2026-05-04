#!/usr/bin/env python3
"""
Migration script to transfer data from SQLite to PostgreSQL
Usage: python migrate_sqlite_to_postgres.py
"""

import sqlite3
import psycopg2
import os
import sys
from dotenv import load_dotenv

load_dotenv()

SQLITE_DB = os.environ.get("SQLITE_DB_PATH", "game.db")

PG_CONFIG = {
    'host': os.environ.get("DB_HOST", "localhost"),
    'port': int(os.environ.get("DB_PORT", 5432)),
    'database': os.environ.get("DB_NAME", "game_db"),
    'user': os.environ.get("DB_USER", "postgres"),
    'password': os.environ.get("DB_PASSWORD", "password")
}

def migrate():
    print("🔄 Starting migration from SQLite to PostgreSQL...")
    
    try:
        print(f"📂 Connecting to SQLite: {SQLITE_DB}")
        sqlite_conn = sqlite3.connect(SQLITE_DB)
        sqlite_conn.row_factory = sqlite3.Row
        sqlite_cursor = sqlite_conn.cursor()
        
        print(f"🗄️  Connecting to PostgreSQL: {PG_CONFIG['database']}")
        pg_conn = psycopg2.connect(**PG_CONFIG)
        pg_cursor = pg_conn.cursor()
        
        print("📊 Fetching data from SQLite...")
        sqlite_cursor.execute("SELECT * FROM scores")
        rows = sqlite_cursor.fetchall()
        total_rows = len(rows)
        
        if total_rows == 0:
            print("✅ No data to migrate")
            sqlite_conn.close()
            pg_conn.close()
            return
        
        print(f"📦 Found {total_rows} records to migrate")
        
        print("💾 Inserting data into PostgreSQL...")
        for idx, row in enumerate(rows, 1):
            try:
                pg_cursor.execute("""
                    INSERT INTO scores 
                    (callsign, avatar, score, wave, kills, combo, coins, ship, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    row['callsign'],
                    row['avatar'],
                    row['score'],
                    row['wave'],
                    row['kills'],
                    row['combo'],
                    row['coins'],
                    row['ship'],
                    row['created_at']
                ))
                
                if idx % 100 == 0:
                    pg_conn.commit()
                    print(f"   ✓ Migrated {idx}/{total_rows} records")
            
            except Exception as e:
                print(f"❌ Error inserting row {idx}: {e}")
                continue
        
        pg_conn.commit()
        print(f"✅ Successfully migrated {total_rows} records!")
        
        pg_cursor.execute("SELECT COUNT(*) FROM scores")
        pg_count = pg_cursor.fetchone()[0]
        print(f"🔍 Verification: PostgreSQL has {pg_count} records")
        
        sqlite_conn.close()
        pg_conn.close()
        
        print("✨ Migration completed successfully!")
        return True
        
    except sqlite3.Error as e:
        print(f"❌ SQLite Error: {e}")
        return False
    except psycopg2.Error as e:
        print(f"❌ PostgreSQL Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
