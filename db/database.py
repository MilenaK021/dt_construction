import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql://dtuser:dtpass@localhost:5432/dtwin")


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db():
    """Run schema.sql to create all tables."""
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r") as f:
        sql = f.read()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Database initialized successfully")
    except Exception as e:
        conn.rollback()
        print(f"Database init error: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
