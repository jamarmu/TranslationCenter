import os
import re
import csv
import json
import tempfile
import sys
from datetime import datetime
import fitz  # PyMuPDF
import vertexai
from vertexai.generative_models import GenerativeModel
from google.cloud import storage
from googleapiclient.discovery import build
from google.oauth2 import service_account
from db import log_event, log_tokens, update_job_status, get_job

# Load environment variables
GCP_PROJECT = os.getenv("GCP_PROJECT", "translation-center")
GCP_REGION = os.getenv("GCP_REGION", "us-central1")
CONFIG_BUCKET = f"{GCP_PROJECT}_translation_config"
OUTPUT_BUCKET = f"{GCP_PROJECT}_translation_output_files"
INPUT_BUCKET = f"{GCP_PROJECT}_translation_input_files"

# Initialize Vertex AI SDK
try:
    vertexai.init(project=GCP_PROJECT, location=GCP_REGION)
    log_event("INFO", f"Vertex AI initialized successfully in project {GCP_PROJECT} ({GCP_REGION})")
except Exception as e:
    log_event("ERROR", f"Failed to initialize Vertex AI: {e}")

# Helper to get Google Drive/Docs API service client
def get_google_services():
    try:
        # Standard GCP Application Default Credentials or service account credentials
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_path and os.path.exists(creds_path):
            creds = service_account.Credentials.from_service_account_file(
                creds_path,
                scopes=[
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/documents'
                ]
            )
        else:
            # Fallback to default
            import google.auth
            creds, _ = google.auth.default(scopes=[
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/documents'
            ])
        
        drive_service = build('drive', 'v3', credentials=creds)
        docs_service = build('docs', 'v1', credentials=creds)
        return drive_service, docs_service
    except Exception as e:
        log_event("ERROR", f"Google Drive API connection failed: {e}")
        return None, None

# Parse config.md to extract translation settings
def parse_translation_config():
    client = storage.Client()
    bucket = client.bucket(CONFIG_BUCKET)
    blob = bucket.blob("translation_config.md")
    
    settings = {
        "model": "Gemini 3.5 Flash",
        "languages": "Spanish, English, French, German",
        "corpus_file": "translation_corpus.csv",
        "dnt_file": "do_not_translate.csv"
    }
    
    try:
        content = blob.download_as_text()
        # Parse fields using regex
        model_match = re.search(r"-\s+\*\*Model\*\*:\s*(.*)", content, re.IGNORECASE)
        if model_match:
            settings["model"] = model_match.group(1).strip()
            
        langs_match = re.search(r"-\s+\*\*Supported Languages\*\*:\s*(.*)", content, re.IGNORECASE)
        if langs_match:
            settings["languages"] = langs_match.group(1).strip()
            
        corpus_match = re.search(r"-\s+\*\*Translation Knowledge Base CSV\*\*:\s*(.*)", content, re.IGNORECASE)
        if corpus_match:
            settings["corpus_file"] = corpus_match.group(1).strip()
            
        dnt_match = re.search(r"-\s+\*\*Do Not Translate CSV\*\*:\s*(.*)", content, re.IGNORECASE)
        if dnt_match:
            settings["dnt_file"] = dnt_match.group(1).strip()
            
    except Exception as e:
        log_event("ERROR", f"Failed to download config from GCS: {e}. Using default settings.")
        
    return settings

# Retrieve CSV file from GCS and return content as text
def get_gcs_file_text(filename):
    if not filename:
        return ""
    try:
        client = storage.Client()
        bucket = client.bucket(CONFIG_BUCKET)
        blob = bucket.blob(filename)
        if blob.exists():
            return blob.download_as_text()
    except Exception as e:
        log_event("ERROR", f"Failed to fetch file {filename} from config bucket: {e}")
    return ""

# Run Gemini Translation Model call
def run_gemini_translation(prompt_text, model_name="Gemini 3.5 Flash"):
    # Map friendly selector names to standard Gemini model API names
    api_model = "gemini-1.5-flash"
    if "Pro" in model_name:
        api_model = "gemini-1.5-pro"
        
    try:
        model = GenerativeModel(api_model)
        log_event("INFO", f"Sending translation request via Vertex AI to model {api_model}")
        response = model.generate_content(prompt_text)
        
        # Token usage calculations
        input_tokens = len(prompt_text) // 4  # Rough estimation
        output_tokens = len(response.text) // 4
        total_tokens = input_tokens + output_tokens
        
        return response.text, total_tokens
    except Exception as e:
        log_event("ERROR", f"Vertex AI Gemini API invocation failed: {e}")
        raise e

# Core PDF Text Extraction & Redaction Translation Overlay
def translate_pdf_file(input_path, output_path, job, config_settings, prompt_template):
    doc = fitz.open(input_path)
    
    # Extract blocks with coordinates
    xml_blocks = []
    block_map = {}
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        # Dict representation returns detail layouts
        page_dict = page.get_text("dict")
        for b_idx, block in enumerate(page_dict.get("blocks", [])):
            if "lines" not in block:
                continue
            
            block_text = ""
            for line in block["lines"]:
                for span in line["spans"]:
                    block_text += span["text"] + " "
            
            block_text = block_text.strip()
            if not block_text:
                continue
                
            block_id = f"p{page_num}_b{b_idx}"
            xml_blocks.append(f'<block id="{block_id}">{block_text}</block>')
            
            # Save original position, size, and style for rebuilding
            block_map[block_id] = {
                "page": page_num,
                "bbox": block["bbox"],
                "color": block["lines"][0]["spans"][0]["color"],
                "size": block["lines"][0]["spans"][0]["size"],
                "font": block["lines"][0]["spans"][0]["font"],
            }
            
    if not xml_blocks:
        # Empty doc
        log_event("ERROR", f"No text found in PDF file {input_path}")
        raise Exception("Input PDF is empty or non-parseable")

    # Fetch reference materials
    corpus_csv = get_gcs_file_text(config_settings["corpus_file"])
    dnt_csv = get_gcs_file_text(config_settings["dnt_file"])
    
    # Rebuild final prompt from template
    prompt = prompt_template
    prompt = prompt.replace("[Source Language]", job["source_lang"])
    prompt = prompt.replace("[Target Language]", job["target_lang"])
    prompt = prompt.replace("[Paste your CSV text of known translations here. Format: Source Text, Target Translation]", corpus_csv)
    prompt = prompt.replace("[Paste your list of names, brands, and product titles here, one per line or comma-separated]", dnt_csv)
    
    source_doc_xml = "\n".join(xml_blocks)
    prompt = prompt.replace("[Paste the document text you want translated here]", source_doc_xml)
    
    # Run translation
    model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
    translated_xml, tokens_used = run_gemini_translation(prompt, model_to_use)
    
    # Parse translated XML blocks
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    # Rebuild PDF Overlay
    out_doc = fitz.open(input_path)
    for block_id, orig_meta in block_map.items():
        translated_text = translated_map.get(block_id)
        if not translated_text:
            continue
            
        page = out_doc[orig_meta["page"]]
        rect = fitz.Rect(orig_meta["bbox"])
        
        # Redact original text
        page.add_redact_annot(rect, fill=(1, 1, 1)) # White block overlay
        page.apply_redactions()
        
        # Draw translated text inside exact same block
        # We handle text wrapping inside the bounding box using insert_textbox
        try:
            page.insert_textbox(
                rect, 
                translated_text, 
                fontsize=orig_meta["size"] * 0.95, # Subtle scale down to ensure fitting
                fontname="helv", 
                color=fitz.PDF_COLOR_BLACK
            )
        except Exception as draw_err:
            print(f"Error rendering text on PDF block {block_id}: {draw_err}")
            
    out_doc.save(output_path)
    out_doc.close()
    doc.close()
    
    return tokens_used

# Core Google Docs Translation (Drive API copy and replacements)
def translate_google_doc(drive_url, job, config_settings, prompt_template):
    drive_service, docs_service = get_google_services()
    if not drive_service or not docs_service:
        raise Exception("Google APIs not authenticated or unavailable")
        
    # Extract file ID from URL
    match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", drive_url)
    if not match:
        raise Exception("Invalid Google Drive Document URL")
    doc_id = match.group(1)
    
    # Fetch Doc Content
    doc = docs_service.documents().get(documentId=doc_id).execute()
    doc_title = doc.get("title", "Untitled Document")
    body_content = doc.get("body", {}).get("content", [])
    
    # Extract text runs with index keys
    paragraphs = []
    element_map = []
    
    for idx, element in enumerate(body_content):
        if "paragraph" in element:
            para_text = ""
            for run in element["paragraph"].get("elements", []):
                if "textRun" in run:
                    para_text += run["textRun"].get("content", "")
            
            clean_text = para_text.strip()
            if clean_text:
                para_id = f"para_{idx}"
                paragraphs.append(f'<block id="{para_id}">{clean_text}</block>')
                element_map.append({
                    "id": para_id,
                    "index": idx,
                    "original_length": len(para_text)
                })
                
    if not paragraphs:
        raise Exception("Google Doc is empty or contains no parseable paragraphs")
        
    # Translate
    corpus_csv = get_gcs_file_text(config_settings["corpus_file"])
    dnt_csv = get_gcs_file_text(config_settings["dnt_file"])
    
    prompt = prompt_template
    prompt = prompt.replace("[Source Language]", job["source_lang"])
    prompt = prompt.replace("[Target Language]", job["target_lang"])
    prompt = prompt.replace("[Paste your CSV text of known translations here. Format: Source Text, Target Translation]", corpus_csv)
    prompt = prompt.replace("[Paste your list of names, brands, and product titles here, one per line or comma-separated]", dnt_csv)
    prompt = prompt.replace("[Paste the document text you want translated here]", "\n".join(paragraphs))
    
    model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
    translated_xml, tokens_used = run_gemini_translation(prompt, model_to_use)
    
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    # Copy file in Google Drive adding candidate suffix
    cand_title = f"{doc_title}_translation_candidate_{job['target_lang']}"
    copied_file = drive_service.files().copy(
        fileId=doc_id, 
        body={"name": cand_title}
    ).execute()
    cand_doc_id = copied_file.get("id")
    cand_url = f"https://docs.google.com/document/d/{cand_doc_id}/edit"
    
    # We must apply batchUpdates backwards (from bottom to top)
    # to avoid index shifting after text modification!
    requests = []
    # Fetch copied document to get exact layout index boundaries
    cand_doc = docs_service.documents().get(documentId=cand_doc_id).execute()
    cand_body = cand_doc.get("body", {}).get("content", [])
    
    # Scan elements backward
    for idx in reversed(range(len(cand_body))):
        element = cand_body[idx]
        if "paragraph" in element:
            para_id = f"para_{idx}"
            translated_text = translated_map.get(para_id)
            if not translated_text:
                continue
                
            # Get startIndex and endIndex
            start = element.get("startIndex")
            end = element.get("endIndex")
            
            # Docs batchUpdate requests to replace text in index boundaries
            requests.append({
                "deleteContentRange": {
                    "range": {
                        "startIndex": start,
                        "endIndex": end - 1 # Keep paragraph break character
                    }
                }
            })
            requests.append({
                "insertText": {
                    "location": {
                        "index": start
                    },
                    "text": translated_text
                }
            })
            
    if requests:
        docs_service.documents().batchUpdate(
            documentId=cand_doc_id,
            body={"requests": requests}
        ).execute()
        
    return cand_url, tokens_used

# Main Job Processing Runner
def process_translation_job(job_id):
    job = get_job(job_id)
    if not job:
        log_event("ERROR", f"Job ID {job_id} not found in database.")
        return
        
    update_job_status(job_id, "TRANSLATING")
    
    try:
        # Load configs
        config_settings = parse_translation_config()
        
        # Load prompt template from GCS config bucket
        client = storage.Client()
        bucket = client.bucket(CONFIG_BUCKET)
        blob = bucket.blob("translation_prompt.md")
        if blob.exists():
            prompt_template = blob.download_as_text()
        else:
            # Fallback to local root workspace file
            local_prompt_path = os.path.join(os.path.dirname(__file__), "../translation_prompt.md")
            with open(local_prompt_path, "r", encoding="utf-8") as f:
                prompt_template = f.read()
                
        # Handle file parsing based on GCS or Google Drive
        if job["storage_type"] == "gcs":
            # GCS Download
            src_uri = job["source_file_path"]
            parts = src_uri.replace("gs://", "").split("/")
            bucket_name = parts[0]
            blob_name = "/".join(parts[1:])
            
            temp_in = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            temp_in_path = temp_in.name
            temp_in.close()
            
            client.bucket(bucket_name).blob(blob_name).download_to_filename(temp_in_path)
            
            # Prepare Output file
            temp_out_path = temp_in_path + "_out.pdf"
            
            # Run PDF Translation
            tokens_used = translate_pdf_file(
                temp_in_path, 
                temp_out_path, 
                job, 
                config_settings, 
                prompt_template
            )
            
            # Upload Candidate to Output GCS bucket
            cand_filename = f"{job_id}_translation_candidate_{job['target_lang']}.pdf"
            cand_uri = f"gs://{OUTPUT_BUCKET}/{cand_filename}"
            client.bucket(OUTPUT_BUCKET).blob(cand_filename).upload_from_filename(temp_out_path)
            
            # Cleanup local temp files
            if os.path.exists(temp_in_path): os.remove(temp_in_path)
            if os.path.exists(temp_out_path): os.remove(temp_out_path)
            
            # Log usage & update DB status
            log_tokens(job_id, tokens_used)
            model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
            update_job_status(job_id, "PENDING_REVIEW", cand_uri, model_to_use)
            
        else:
            # Google Drive URL
            drive_url = job["source_file_path"]
            if job["file_type"] == "gdoc":
                cand_url, tokens_used = translate_google_doc(
                    drive_url, 
                    job, 
                    config_settings, 
                    prompt_template
                )
                log_tokens(job_id, tokens_used)
                model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
                update_job_status(job_id, "PENDING_REVIEW", cand_url, model_to_use)
            else:
                # PDF Google Drive download, translate local PDF, upload translated back to Drive
                # For simplicity, download GDrive file bytes and overlay them
                drive_service, docs_service = get_google_services()
                if not drive_service:
                    raise Exception("Google API client credentials missing")
                    
                match = re.search(r"/file/d/([a-zA-Z0-9-_]+)", drive_url)
                if not match:
                    # Alternative drive patterns
                    match = re.search(r"id=([a-zA-Z0-9-_]+)", drive_url)
                if not match:
                    raise Exception("Invalid Google Drive File Link")
                file_id = match.group(1)
                
                # Fetch metadata
                meta = drive_service.files().get(fileId=file_id).execute()
                title = meta.get("name", "Document.pdf")
                
                temp_in = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
                temp_in_path = temp_in.name
                temp_in.close()
                
                # Download bytes
                from googleapiclient.http import MediaIoBaseDownload
                import io
                request = drive_service.files().get_media(fileId=file_id)
                fh = io.FileIO(temp_in_path, 'wb')
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                    
                # Output filename & run translation overlay
                temp_out_path = temp_in_path + "_out.pdf"
                tokens_used = translate_pdf_file(
                    temp_in_path, 
                    temp_out_path, 
                    job, 
                    config_settings, 
                    prompt_template
                )
                
                # Upload candidate PDF copy back to Google Drive
                from googleapiclient.http import MediaFileUpload
                cand_title = f"{title.replace('.pdf', '')}_translation_candidate_{job['target_lang']}.pdf"
                media = MediaFileUpload(temp_out_path, mimetype='application/pdf')
                uploaded_file = drive_service.files().create(
                    body={"name": cand_title, "mimeType": "application/pdf"},
                    media_body=media
                ).execute()
                cand_url = f"https://drive.google.com/file/d/{uploaded_file.get('id')}/view"
                
                # Clean local temporary files
                if os.path.exists(temp_in_path): os.remove(temp_in_path)
                if os.path.exists(temp_out_path): os.remove(temp_out_path)
                
                log_tokens(job_id, tokens_used)
                model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
                update_job_status(job_id, "PENDING_REVIEW", cand_url, model_to_use)
                
    except Exception as e:
        log_event("ERROR", f"Job ID {job_id} failed during translation: {e}")
        update_job_status(job_id, "FAILED")
        print(f"Error executing translation: {e}", file=sys.stderr)
