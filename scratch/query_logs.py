import sys
sys.path.append("/Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend")
from db import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Could not connect to DB")
        return
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, severity, message, timestamp FROM app_logs ORDER BY id DESC LIMIT 20")
        rows = cursor.fetchall()
        for row in rows:
            print(f"[{row['severity']}] {row['timestamp']}: {row['message']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
