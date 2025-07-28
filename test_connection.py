import os
import psycopg2
from openai import OpenAI
import urllib.parse

def test_connections():
    """Test both OpenAI and Database connections in Replit"""
    print("Testing connections...")

    try:
        # Test OpenAI
        print("Testing OpenAI connection...")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("ERROR: OPENAI_API_KEY not found in environment")
            return

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hello!"}],
            max_tokens=10
        )
        print("✅ OpenAI connection successful")

        # Test Database
        print("Testing database connection...")
        database_url = os.getenv("DATABASE_URL")

        if database_url:
            print("Using DATABASE_URL...")
            parsed = urllib.parse.urlparse(database_url)
            conn = psycopg2.connect(
                host=parsed.hostname,
                database=parsed.path[1:],
                user=parsed.username,
                password=parsed.password,
                port=parsed.port or 5432
            )
        else:
            print("Using individual PG variables...")
            conn = psycopg2.connect(
                host=os.getenv("PGHOST"),
                database=os.getenv("PGDATABASE"),
                user=os.getenv("PGUSER"),
                password=os.getenv("PGPASSWORD"),
                port=int(os.getenv("PGPORT", 5432))
            )

        cursor = conn.cursor()
        cursor.execute("SELECT current_database(), current_user;")
        db_name, user = cursor.fetchone()
        print("✅ Database connection successful")
        print(f"   Database: {db_name}")
        print(f"   User: {user}")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    test_connections()