import mysql.connector
import os
import sys
from datetime import date
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", "password"),
            database=os.getenv("DB_NAME", "translation_center"),
            port=int(os.getenv("DB_PORT", 3306))
        )
        return conn
    except Exception as e:
        print(f"Database connection error: {e}", file=sys.stderr)
        return None

def log_event(severity, message):
    conn = get_db_connection()
    if not conn:
        print(f"[{severity}] DB Offline: {message}", file=sys.stderr)
        return
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO app_logs (severity, message) VALUES (%s, %s)",
            (severity, message)
        )
        conn.commit()
    except Exception as e:
        print(f"Failed to write log to DB: {e}", file=sys.stderr)
    finally:
        conn.close()

def log_tokens(job_id, tokens_consumed):
    conn = get_db_connection()
    if not conn:
        print(f"DB Offline - Could not log {tokens_consumed} tokens for Job {job_id}", file=sys.stderr)
        return
    try:
        cursor = conn.cursor()
        # Log to usage statistics
        cursor.execute(
            "INSERT INTO usage_logs (job_id, tokens_consumed, date) VALUES (%s, %s, %s)",
            (job_id, tokens_consumed, date.today())
        )
        conn.commit()
        log_event("INFO", f"Job ID {job_id} logged token usage: {tokens_consumed} tokens.")
    except Exception as e:
        print(f"Failed to log tokens: {e}", file=sys.stderr)
        log_event("ERROR", f"Failed to log tokens for Job {job_id}: {e}")
    finally:
        conn.close()

def update_job_status(job_id, status, candidate_file_path=None, model_used=None):
    conn = get_db_connection()
    if not conn:
        print(f"DB Offline - Failed to update Job {job_id} status to {status}", file=sys.stderr)
        return
    try:
        cursor = conn.cursor()
        if candidate_file_path and model_used:
            cursor.execute(
                "UPDATE jobs SET status = %s, candidate_file_path = %s, model_used = %s, updated_at = NOW() WHERE id = %s",
                (status, candidate_file_path, model_used, job_id)
            )
        elif candidate_file_path:
            cursor.execute(
                "UPDATE jobs SET status = %s, candidate_file_path = %s, updated_at = NOW() WHERE id = %s",
                (status, candidate_file_path, job_id)
            )
        else:
            cursor.execute(
                "UPDATE jobs SET status = %s, updated_at = NOW() WHERE id = %s",
                (status, job_id)
            )
        conn.commit()
        log_event("INFO", f"Job ID {job_id} status updated to {status}")
    except Exception as e:
        print(f"Failed to update job status: {e}", file=sys.stderr)
        log_event("ERROR", f"Failed to update Job {job_id} status: {e}")
    finally:
        conn.close()

def get_job(job_id):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM jobs WHERE id = %s", (job_id,))
        return cursor.fetchone()
    except Exception as e:
        print(f"Failed to query job: {e}", file=sys.stderr)
        return None
    finally:
        conn.close()
