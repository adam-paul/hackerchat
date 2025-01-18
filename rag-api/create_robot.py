#!/usr/bin/env python3

import psycopg2
import os
import sys
import argparse
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get database URL from environment
DATABASE_URL = os.environ.get("NEONDB_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)

def verify_database():
    """Verify database is initialized with required tables."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            # Check if users table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'users'
                );
            """)
            if not cur.fetchone()[0]:
                print("Error: 'users' table not found. Have you run the database migrations?")
                sys.exit(1)
            
            # Verify table structure
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'users';
            """)
            columns = {row[0]: row[1] for row in cur.fetchall()}
            required_columns = {'id', 'name', 'status', 'createdAt', 'updatedAt'}
            missing = required_columns - set(columns.keys())
            if missing:
                print(f"Error: Missing required columns in users table: {missing}")
                sys.exit(1)
    finally:
        conn.close()

def create_robot(bot_name: str):
    """Create a bot user in the database with the given name."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        # Generate a consistent bot ID based on the name
        bot_id = f"bot_{bot_name.lower().replace(' ', '_')}"
        
        with conn.cursor() as cur:
            # Check if bot already exists
            cur.execute('SELECT id FROM "users" WHERE id = %s', (bot_id,))
            if cur.fetchone():
                print(f"Bot user '{bot_name}' already exists with ID: {bot_id}")
                return
            
            # Insert new bot user with all required fields
            now = datetime.utcnow()
            cur.execute(
                """
                INSERT INTO "users" (
                    id, 
                    name, 
                    status,
                    "createdAt",
                    "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s)
                """,
                (bot_id, bot_name, "online", now, now)
            )
            conn.commit()
            print(f"Created bot user '{bot_name}' with ID: {bot_id}")
    
    except Exception as e:
        print(f"Error creating bot user: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Create a bot user in the chat database")
    parser.add_argument("bot_name", help="Name of the bot to create")
    args = parser.parse_args()
    
    # Verify database before attempting to create bot
    verify_database()
    create_robot(args.bot_name)

if __name__ == "__main__":
    main()
