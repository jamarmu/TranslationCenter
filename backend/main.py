from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import uvicorn
from translator import process_translation_job
from db import log_event, get_db_connection

def run_migration():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SHOW COLUMNS FROM jobs LIKE 'verbose'")
            result = cursor.fetchone()
            if not result:
                cursor.execute("ALTER TABLE jobs ADD COLUMN verbose BOOLEAN NOT NULL DEFAULT FALSE")
                conn.commit()
                log_event("INFO", "Database migration: added verbose column to jobs table.")
                print("Database migration ran successfully: added verbose column.")
            else:
                print("Database column verbose already exists.")

            cursor.execute("SHOW COLUMNS FROM jobs LIKE 'translation_engine'")
            result = cursor.fetchone()
            if not result:
                cursor.execute("ALTER TABLE jobs ADD COLUMN translation_engine VARCHAR(50) NOT NULL DEFAULT 'llm_pymupdf'")
                cursor.execute("ALTER TABLE jobs ADD COLUMN translation_tier VARCHAR(50) NULL")
                cursor.execute("ALTER TABLE jobs ADD COLUMN pages_translated INT NULL DEFAULT NULL")
                conn.commit()
                log_event("INFO", "Database migration: added translation_engine, translation_tier, and pages_translated columns.")
                print("Database migration ran successfully: added translation_engine, translation_tier, and pages_translated columns.")
            else:
                print("Database columns for translation_engine, translation_tier, and pages_translated already exist.")
        except Exception as e:
            print(f"Migration error: {e}")
            log_event("ERROR", f"Database migration failed: {e}")
        finally:
            conn.close()

# Run migration on startup
run_migration()

app = FastAPI(title="Translation Center Backend Service")

class TranslationRequest(BaseModel):
    job_id: int

@app.post("/translate")
async def trigger_translation(request: TranslationRequest):
    job_id = request.job_id
    if not job_id:
        raise HTTPException(status_code=400, detail="Job ID required")
    
    log_event("INFO", f"Running translation synchronously for Job ID: {job_id}")
    process_translation_job(job_id)
    return {"message": "Translation process completed successfully", "job_id": job_id}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
