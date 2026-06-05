import sys
sys.path.append("/Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend")
from db import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Could not connect to DB")
        return
    try:
        cursor = conn.cursor()
        print("Disabling foreign key checks...")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        print("Truncating table usage_logs...")
        cursor.execute("TRUNCATE TABLE usage_logs")
        
        print("Truncating table jobs...")
        cursor.execute("TRUNCATE TABLE jobs")
        
        print("Truncating table app_logs...")
        cursor.execute("TRUNCATE TABLE app_logs")
        
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        print("Database cleanup completed successfully!")
    except Exception as e:
        print(f"Error during database cleanup: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
