from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import uvicorn
from translator import process_translation_job
from db import log_event

app = FastAPI(title="Translation Center Backend Service")

class TranslationRequest(BaseModel):
    job_id: int

@app.post("/translate")
async def trigger_translation(request: TranslationRequest, background_tasks: BackgroundTasks):
    job_id = request.job_id
    if not job_id:
        raise HTTPException(status_code=400, detail="Job ID required")
    
    # Run the CPU/network intensive translation process in the background
    background_tasks.add_task(process_translation_job, job_id)
    
    log_event("INFO", f"Translation background task scheduled for Job ID: {job_id}")
    return {"message": "Translation process triggered successfully", "job_id": job_id}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
