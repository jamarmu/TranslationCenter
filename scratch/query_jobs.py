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
        cursor.execute("SELECT id, job_name, model_override, model_used, status FROM jobs ORDER BY id DESC LIMIT 10")
        rows = cursor.fetchall()
        for row in rows:
            print(f"ID: {row['id']}, Name: {row['job_name']}, Override: {row['model_override']}, Used: {row['model_used']}, Status: {row['status']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
